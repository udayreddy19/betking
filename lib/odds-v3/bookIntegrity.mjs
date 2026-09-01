/**
 * Post-price book protection: align winner markets, apply liability,
 * and suspend lock prices so they never reach the betting grid.
 */

import { MIN_DECIMAL_ODDS } from './pricing/MarginCalculator.mjs';
import { priceSelection } from './pricing/OddsCalculator.mjs';
import { riskAdjustmentEngine } from '../engines/riskAdjustmentEngine.mjs';
import { acceptedLineStillOpen, parseOuLine } from './lineIdentity.mjs';
import { oddsPricesEqual } from '../oddsComparison.mjs';
import {
  canonicalTeamsFromSnapshot,
  createSelectionUnresolvedError,
  resolveSelectionInPool,
} from './selectionResolver.mjs';

const LOCK_EPS = 0.0005;

/** Live markets that are too noisy, unpriceable, or lack settlement (money risk). */
export const COMPACT_LIVE_SKIP_IDS = new Set([
  'match_run_range',
  'btts_score_x',
  'total_match_wickets',
  'total_match_fours',
  'total_match_sixes',
  'team_total_alt_high',
  'team_total_alt_low',
  'team_total_fours',
  'team_total_sixes',
  'batter_h2h_sixes',
  'batter_h2h_runs',
  'top_batter',
  'will_there_be_a_tie',
  'double_chance',
  'most_sixes',
  'most_fours',
]);

export function shouldSkipCompactLiveMarket(marketId = '') {
  const id = String(marketId);
  if (COMPACT_LIVE_SKIP_IDS.has(id)) return true;
  if (id.startsWith('method_of_next_wicket')) return true;
  if (/_method_of_next_wicket_/.test(id)) return true;
  // Delivery markets are innings+over+ball scoped — keep in book; missing id refuses cashout
  if (id.includes('odd_even')) return true;
  return false;
}

export function isLockPrice(odds) {
  return Number.isFinite(odds) && odds <= MIN_DECIMAL_ODDS + LOCK_EPS;
}

function cloneMarket(market, patch = {}) {
  return {
    ...market,
    ...patch,
    selections: (patch.selections || market.selections || []).map((s) => ({ ...s })),
  };
}

export function alignWinnerMarkets(markets = []) {
  const winner = markets.find((m) => m.marketId === 'match_winner' && m.status === 'OPEN');
  const superOver = markets.find((m) => m.marketId === 'match_winner_super_over' && m.status === 'OPEN');
  if (!winner?.selections?.length || !superOver?.selections?.length) return markets;

  const aligned = superOver.selections.map((sel) => {
    const src = winner.selections.find((w) => String(w.name) === String(sel.name));
    if (!src || !Number.isFinite(src.odds)) return sel;
    return {
      ...src,
      selectionId: sel.selectionId,
      name: sel.name,
    };
  });

  return markets.map((m) => (
    m.marketId === 'match_winner_super_over' ? cloneMarket(m, { selections: aligned }) : m
  ));
}

export function applyLiabilityToTwoWayMarkets(markets = []) {
  return markets.map((market) => {
    if (market.status !== 'OPEN' || !market.selections || market.selections.length !== 2) {
      return market;
    }
    const [s0, s1] = market.selections;
    if (!Number.isFinite(s0.probability) || !Number.isFinite(s1.probability)) return market;

    if (riskAdjustmentEngine.isRiskLimitExceeded(market.marketId, 250000)) {
      return cloneMarket(market, {
        status: 'SUSPENDED',
        liabilityCap: true,
        selections: market.selections.map((s) => ({
          ...s,
          status: 'SUSPENDED',
          bettable: false,
        })),
      });
    }

    const shifted = riskAdjustmentEngine.applyTwoWayShift(
      s0.probability,
      s1.probability,
      market.marketId,
      s0.selectionId,
      s1.selectionId,
    );
    if (Math.abs(shifted.p0 - s0.probability) < 0.0005) return market;

    const overround = Number.isFinite(s0.margin) ? s0.margin : 0.05;
    try {
      return cloneMarket(market, {
        liabilityShifted: true,
        liabilityDiff: shifted.liabilityDiff,
        selections: [
          priceSelection({
            selectionId: s0.selectionId,
            name: s0.name,
            probability: shifted.p0,
            overround,
          }),
          priceSelection({
            selectionId: s1.selectionId,
            name: s1.name,
            probability: shifted.p1,
            overround,
          }),
        ],
      });
    } catch {
      return market;
    }
  });
}

export function suspendLockMarkets(markets = []) {
  return markets.map((market) => {
    if (market.status !== 'OPEN') return market;
    const typeKey = `${market.marketId || ''} ${market.marketType || ''} ${market.name || ''}`;
    if (/PLAYER|H2H|HEAD.?TO.?HEAD|TOP_BATTER|BATTER_/i.test(typeKey)) return market;

    const priced = (market.selections || []).filter((s) => Number.isFinite(s.odds));
    if (priced.length === 0) return market;
    if (!priced.some((s) => isLockPrice(s.odds))) return market;

    return cloneMarket(market, {
      status: 'SUSPENDED',
      selections: market.selections.map((s) => ({
        ...s,
        status: 'SUSPENDED',
        bettable: false,
      })),
    });
  });
}

/** Drop lock / determined markets from the compact live book (placement still refuses them). */
export function hideUnpriceableMarkets(markets = []) {
  return markets.filter((market) => {
    if (!market) return false;
    if (market.status === 'SETTLED' || market.status === 'DETERMINED') return false;
    if (market.liabilityCap) return false;
    const priced = (market.selections || []).filter((s) => Number.isFinite(s.odds));
    if (market.status === 'SUSPENDED' && priced.some((s) => isLockPrice(s.odds))) return false;
    if (market.status === 'SUSPENDED' && priced.every((s) => s.bettable === false) && priced.length > 0) {
      return false;
    }
    return true;
  });
}

export function applyBookIntegrity(markets = []) {
  const aligned = alignWinnerMarkets(markets);
  const risked = applyLiabilityToTwoWayMarkets(aligned);
  return hideUnpriceableMarkets(suspendLockMarkets(risked));
}

export function assertBettableQuote(serverOdds, clientOdds) {
  const server = Number(serverOdds);
  if (!Number.isFinite(server) || server < MIN_DECIMAL_ODDS) {
    const err = new Error(`ODDS_LOCKED: selection is not bettable at ${serverOdds}`);
    err.code = 'ODDS_LOCKED';
    throw err;
  }
  if (clientOdds == null || clientOdds === '') return server;
  const client = Number(clientOdds);
  if (!Number.isFinite(client) || client < MIN_DECIMAL_ODDS) {
    const err = new Error(`ODDS_EXPIRED: client odds ${clientOdds} are not bettable`);
    err.code = 'ODDS_EXPIRED';
    throw err;
  }
  return server;
}

/** True when server and client prices differ (normalized decimal comparison). */
export function oddsQuoteChanged(serverOdds, clientOdds) {
  if (clientOdds == null || clientOdds === '') return false;
  return !oddsPricesEqual(serverOdds, clientOdds);
}

export function findQuotedSelection(snapshot, marketId, selectionId, opts = {}) {
  const markets = snapshot?.markets || [];
  const wantedMarket = String(marketId || '');
  const wantedSel = String(selectionId || '');
  const selectionName = opts.selectionName || '';
  const acceptedLine = opts.acceptedLine != null
    ? Number(opts.acceptedLine)
    : (parseOuLine(selectionName) ?? parseOuLine(wantedSel));

  let market = markets.find((m) => (
    m.marketId === wantedMarket || m.marketType === wantedMarket || m.key === wantedMarket
  ));

  // UI often defaults to match_winner while live cricket may only expose match_winner_super_over.
  if (!market && wantedMarket.includes('match_winner')) {
    market = markets.find((m) => (
      String(m.marketId || m.marketType || '').includes('match_winner')
      && (!m.status || m.status === 'OPEN')
    ));
  }

  if (!market) return null;
  if (market.status && market.status !== 'OPEN') {
    const err = new Error(`MARKET_ALREADY_DETERMINED: Market '${marketId}' is ${market.status}`);
    err.code = 'MARKET_ALREADY_DETERMINED';
    throw err;
  }

  const pool = market.selections || market.options || [];
  const teams = canonicalTeamsFromSnapshot(snapshot);
  let sel = resolveSelectionInPool(pool, wantedSel, { selectionName, teams });

  // Legacy sel_over / sel_under → match side only when accepted line equals live line
  if (!sel && (/^sel_over$/i.test(wantedSel) || /^sel_under$/i.test(wantedSel))) {
    const wantUnder = /^sel_under$/i.test(wantedSel);
    if (acceptedLine != null && market.line != null
      && Math.abs(Number(market.line) - acceptedLine) > 0.01) {
      const err = new Error(
        `MARKET_ALREADY_DETERMINED: Accepted line ${acceptedLine} != live line ${market.line}`,
      );
      err.code = 'MARKET_ALREADY_DETERMINED';
      throw err;
    }
    sel = pool.find((s) => {
      const id = String(s.selectionId || '');
      const name = String(s.name || '');
      return wantUnder
        ? (/under/i.test(id) || /under/i.test(name))
        : (/over/i.test(id) || /over/i.test(name));
    });
  }

  if (!sel && selectionName) {
    sel = resolveSelectionInPool(pool, selectionName, { teams });
  }

  if (!sel) {
    throw createSelectionUnresolvedError(wantedSel || selectionName, marketId);
  }
  if (sel.bettable === false || sel.status === 'SUSPENDED' || sel.status === 'SETTLED'
    || sel.status === 'WON' || sel.status === 'LOST' || sel.status === 'DETERMINED') {
    const err = new Error(`MARKET_ALREADY_DETERMINED: Selection '${selectionId}' is determined or suspended`);
    err.code = 'MARKET_ALREADY_DETERMINED';
    throw err;
  }

  if (acceptedLine != null && market.line != null
    && Math.abs(Number(market.line) - acceptedLine) > 0.01) {
    const err = new Error(
      `MARKET_ALREADY_DETERMINED: Requested line ${acceptedLine} != live line ${market.line}`,
    );
    err.code = 'MARKET_ALREADY_DETERMINED';
    throw err;
  }
  if (!acceptedLineStillOpen(market, wantedSel, selectionName || String(sel.name || ''))) {
    const err = new Error(
      `MARKET_ALREADY_DETERMINED: Selection line no longer matches live market line ${market.line}`,
    );
    err.code = 'MARKET_ALREADY_DETERMINED';
    throw err;
  }

  return { market, selection: sel, odds: Number(sel.odds) };
}
