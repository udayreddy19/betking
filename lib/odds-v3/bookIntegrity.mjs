/**
 * Post-price book protection: align winner markets, apply liability,
 * and suspend lock prices so they never reach the betting grid.
 */

import { MIN_DECIMAL_ODDS } from './pricing/MarginCalculator.mjs';
import { priceSelection } from './pricing/OddsCalculator.mjs';
import { riskAdjustmentEngine } from '../engines/riskAdjustmentEngine.mjs';

const LOCK_EPS = 0.0005;

/** Live markets that are too noisy or routinely unpriceable. */
export const COMPACT_LIVE_SKIP_IDS = new Set([
  'match_run_range',
  'btts_score_x',
  'total_match_wickets',
  'team_total_alt_high',
  'team_total_alt_low',
  'batter_h2h_sixes',
]);

export function shouldSkipCompactLiveMarket(marketId = '') {
  const id = String(marketId);
  if (COMPACT_LIVE_SKIP_IDS.has(id)) return true;
  if (id.startsWith('method_of_next_wicket')) return true;
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

export function applyBookIntegrity(markets = []) {
  const aligned = alignWinnerMarkets(markets);
  const risked = applyLiabilityToTwoWayMarkets(aligned);
  return suspendLockMarkets(risked);
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
    const err = new Error(`ODDS_LOCKED: client odds ${clientOdds} are not bettable`);
    err.code = 'ODDS_LOCKED';
    throw err;
  }
  const drift = Math.abs(server - client) / server;
  if (drift > 0.02) {
    const err = new Error(`ODDS_CHANGED: Requested odds ${client} differs from authoritative server odds ${server}`);
    err.code = 'ODDS_CHANGED';
    throw err;
  }
  return server;
}

export function findQuotedSelection(snapshot, marketId, selectionId) {
  const markets = snapshot?.markets || [];
  const wantedMarket = String(marketId || '');
  const wantedSel = String(selectionId || '');

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
  let sel = pool.find((s) => (
    String(s.selectionId) === wantedSel
    || String(s.selection) === wantedSel
    || String(s.name) === wantedSel
  ));

  if (!sel) {
    const active = pool.filter((s) => s.bettable !== false && Number(s.odds) > 1);
    if (wantedSel === '1' || wantedSel === 'home') sel = active[0] || pool[0];
    else if (wantedSel === '2' || wantedSel === 'away') {
      sel = active.length >= 2 ? active[active.length - 1] : (pool[2] || pool[1]);
    } else if (wantedSel === 'X' || wantedSel === 'draw') {
      sel = pool.find((s) => /draw|tie/i.test(String(s.name || '')))
        || (active.length === 3 ? active[1] : null);
    }
  }

  if (!sel) return null;
  if (sel.bettable === false || sel.status === 'SUSPENDED' || sel.status === 'SETTLED'
    || sel.status === 'WON' || sel.status === 'LOST' || sel.status === 'DETERMINED') {
    const err = new Error(`MARKET_ALREADY_DETERMINED: Selection '${selectionId}' is determined or suspended`);
    err.code = 'MARKET_ALREADY_DETERMINED';
    throw err;
  }
  return { market, selection: sel, odds: Number(sel.odds) };
}
