/**
 * Server-authoritative odds quoting for bet placement (singles + acca legs).
 * Live snapshot with forced feed refresh on miss — no stale canonical soft-fallback.
 * User-facing messages never include match ids or provider brands.
 */

import { findQuotedSelection, assertBettableQuote } from './odds-v3/bookIntegrity.mjs';
import { MIN_DECIMAL_ODDS } from './odds-v3/pricing/MarginCalculator.mjs';
import { acceptedLineStillOpen, parseOuLine } from './odds-v3/lineIdentity.mjs';
import { aggregateLiveScores, getCachedAggregatedLiveScores } from './aggregator.mjs';
import { matchIdAliases, matchIdsEqual } from './matchIdPublic.mjs';

export async function resolveServerOdds({
  matchId,
  marketId,
  selectionId,
  clientOdds,
  selectionName = null,
  acceptedLine = null,
}) {
  if (!matchId || !marketId || !selectionId) {
    throw new Error('INVALID_BET: matchId, marketId, and selectionId are required');
  }

  const lineHint = acceptedLine ?? parseOuLine(selectionName) ?? parseOuLine(selectionId);

  let liveSnap = null;
  let lastErr = null;
  try {
    const { buildMatchOddsPayload } = await import('./liveScoresApiHandlers.mjs');
    liveSnap = await buildMatchOddsPayload({ matchId, force: false });
  } catch (err) {
    lastErr = err;
    if (isQuoteFatalError(err) && !isNotFoundish(err)) throw err;
    // Force-refresh live feed once — brief gaps between UI view and place are common
    try {
      await aggregateLiveScores({ force: true });
      const { buildMatchOddsPayload } = await import('./liveScoresApiHandlers.mjs');
      liveSnap = await buildMatchOddsPayload({ matchId, force: true });
      lastErr = null;
    } catch (err2) {
      lastErr = err2;
      if (isQuoteFatalError(err2) && !isNotFoundish(err2)) throw err2;
    }
  }

  if (!liveSnap) {
    const inFeed = (getCachedAggregatedLiveScores()?.matches || [])
      .some((m) => matchIdsEqual(m.id || m.matchId, matchId)
        || matchIdAliases(matchId).includes(String(m.id || m.matchId)));
    if (!inFeed) {
      throw new Error('ODDS_UNAVAILABLE: Odds temporarily unavailable — refresh the match and try again');
    }
    throw new Error(
      lastErr?.message?.startsWith('MARKET_') || lastErr?.message?.startsWith('ODDS_')
        ? lastErr.message
        : 'ODDS_UNAVAILABLE: Could not build live odds — refresh and try again',
    );
  }

  if (liveSnap?.status === 'DETERMINED' || liveSnap?.status === 'INVALID_STATE') {
    throw new Error('MARKET_ALREADY_DETERMINED: Match markets are closed');
  }
  if (!Array.isArray(liveSnap?.markets) || liveSnap.markets.length === 0) {
    throw new Error('ODDS_UNAVAILABLE: No open markets for this match right now');
  }

  const quoted = findQuotedSelection(liveSnap, marketId, selectionId, {
    selectionName,
    acceptedLine: lineHint,
  });
  if (!quoted) {
    throw new Error('ODDS_UNAVAILABLE: That selection is no longer on the live board');
  }

  if (lineHint != null && quoted.market?.line != null
    && Math.abs(Number(quoted.market.line) - Number(lineHint)) > 0.01) {
    throw new Error('MARKET_ALREADY_DETERMINED: Accepted line no longer matches the live market');
  }
  if (lineHint != null && !acceptedLineStillOpen(quoted.market, selectionId, selectionName || `Over ${lineHint}`)) {
    throw new Error('MARKET_ALREADY_DETERMINED: Accepted line no longer matches the live market');
  }

  const odds = assertBettableQuote(quoted.odds, clientOdds);
  if (!odds || Number.isNaN(odds) || odds < MIN_DECIMAL_ODDS) {
    throw new Error('ODDS_UNAVAILABLE: Authoritative odds unavailable for this selection');
  }
  return odds;
}

function isNotFoundish(err) {
  const msg = err?.message || '';
  return err?.statusCode === 404
    || err?.code === 'NOT_AVAILABLE'
    || /not found|not available/i.test(msg);
}

function isQuoteFatalError(err) {
  const msg = err?.message || '';
  return msg.startsWith('ODDS_CHANGED')
    || msg.startsWith('MARKET_ALREADY_DETERMINED')
    || msg.startsWith('MARKET_SUSPENDED')
    || msg.startsWith('ODDS_LOCKED')
    || msg.startsWith('ODDS_UNAVAILABLE');
}
