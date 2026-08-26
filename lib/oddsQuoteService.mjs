/**
 * Server-authoritative odds quoting for bet placement (singles + acca legs).
 * Live snapshot with forced feed refresh on miss — no stale canonical soft-fallback.
 * User-facing messages never include match ids or provider brands.
 */

import { findQuotedSelection, assertBettableQuote, oddsQuoteChanged } from './odds-v3/bookIntegrity.mjs';
import { MIN_DECIMAL_ODDS } from './odds-v3/pricing/MarginCalculator.mjs';
import { acceptedLineStillOpen, parseOuLine } from './odds-v3/lineIdentity.mjs';
import { detectOddsChange, formatOddsForClient } from './oddsComparison.mjs';
import { assertQuoteNotExpired } from './oddsPlacementValidation.mjs';
import { aggregateLiveScores, getCachedAggregatedLiveScores } from './aggregator.mjs';
import { matchIdAliases, matchIdsEqual } from './matchIdPublic.mjs';

/** Load authoritative odds snapshot for a match (cached ~2s in liveScoresApiHandlers). */
export async function loadLiveOddsSnapshot(matchId, { force = false } = {}) {
  if (!matchId) {
    throw new Error('INVALID_BET: matchId is required');
  }

  let liveSnap = null;
  let lastErr = null;
  try {
    const { buildMatchOddsPayload } = await import('./liveScoresApiHandlers.mjs');
    liveSnap = await buildMatchOddsPayload({ matchId, force });
  } catch (err) {
    lastErr = err;
    if (isQuoteFatalError(err) && !isNotFoundish(err)) throw err;
  }

  if (!liveSnap && !force) {
    try {
      const { buildMatchOddsPayload } = await import('./liveScoresApiHandlers.mjs');
      liveSnap = await buildMatchOddsPayload({ matchId, force: false });
      lastErr = null;
    } catch (err) {
      lastErr = err;
      if (isQuoteFatalError(err) && !isNotFoundish(err)) throw err;
    }
  }

  if (!liveSnap) {
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

  return liveSnap;
}

export function resolveServerOddsFromSnapshot(liveSnap, {
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

  if (liveSnap?.status === 'DETERMINED' || liveSnap?.status === 'INVALID_STATE') {
    throw new Error('MARKET_ALREADY_DETERMINED: Match markets are closed');
  }
  if (!Array.isArray(liveSnap?.markets) || liveSnap.markets.length === 0) {
    throw new Error('ODDS_UNAVAILABLE: No open markets for this match right now');
  }

  let quoted = findQuotedSelection(liveSnap, marketId, selectionId, {
    selectionName,
    acceptedLine: lineHint,
  });
  if (!quoted) {
    throw new Error('SELECTION_UNAVAILABLE: That selection is not available in this market');
  }

  if (lineHint != null && quoted.market?.line != null
    && Math.abs(Number(quoted.market.line) - Number(lineHint)) > 0.01) {
    throw new Error('MARKET_ALREADY_DETERMINED: Accepted line no longer matches the live market');
  }
  if (lineHint != null && !acceptedLineStillOpen(quoted.market, selectionId, selectionName || `Over ${lineHint}`)) {
    throw new Error('MARKET_ALREADY_DETERMINED: Accepted line no longer matches the live market');
  }

  const quoteMeta = {
    generatedAt: liveSnap?.generatedAt ?? liveSnap?.timestamp ?? null,
    expiresAt: liveSnap?.expiresAt ?? null,
  };
  assertQuoteNotExpired(quoteMeta);

  const odds = assertBettableQuote(quoted.odds, clientOdds);
  if (!odds || Number.isNaN(odds) || odds < MIN_DECIMAL_ODDS) {
    throw new Error('ODDS_UNAVAILABLE: Authoritative odds unavailable for this selection');
  }
  const change = detectOddsChange(odds, clientOdds);
  const resolvedMarketId = quoted.market?.marketId
    || quoted.market?.marketType
    || quoted.market?.key
    || marketId;
  const resolvedSelectionId = quoted.selection?.selectionId
    || quoted.selection?.selection
    || selectionId;

  return {
    odds,
    changed: change.changed,
    oddsChanged: change.oddsChanged,
    previousOdds: change.oldOdds != null ? Number(change.oldOdds) : null,
    oldOdds: change.oldOdds != null ? formatOddsForClient(change.oldOdds) : null,
    newOdds: formatOddsForClient(odds),
    marketId: resolvedMarketId,
    selectionId: resolvedSelectionId,
    stateVersion: liveSnap?.stateVersion ?? liveSnap?.canonicalState?.stateVersion ?? null,
    oddsVersion: liveSnap?.oddsVersion ?? null,
    quoteTimestamp: quoteMeta.generatedAt || new Date().toISOString(),
    generatedAt: quoteMeta.generatedAt,
    expiresAt: quoteMeta.expiresAt,
  };
}

export async function resolveServerOdds({
  matchId,
  marketId,
  selectionId,
  clientOdds,
  selectionName = null,
  acceptedLine = null,
  liveSnap = null,
}) {
  const snapshot = liveSnap ?? await loadLiveOddsSnapshot(matchId);

  const isLive = Boolean(
    snapshot?.isLive
    || snapshot?.matchState === 'in'
    || snapshot?.live
    || snapshot?.canonicalState?.isLive,
  );
  if (isLive && marketId) {
    const { oddsFreshnessEngine } = await import('./oddsFreshnessEngine.mjs');
    const providerTs = snapshot?.providerUpdatedAt
      || snapshot?.generatedAt
      || snapshot?.timestamp
      || null;
    const freshness = await oddsFreshnessEngine.processOddsFreshness(
      String(marketId),
      providerTs,
      true,
    );
    if (freshness?.freshnessStatus === 'STALE' || freshness?.freshnessStatus === 'INVALID') {
      const err = new Error('ODDS_EXPIRED: Live odds are stale — refresh and try again');
      err.code = 'ODDS_EXPIRED';
      err.freshnessStatus = freshness.freshnessStatus;
      throw err;
    }
  }

  return resolveServerOddsFromSnapshot(snapshot, {
    matchId,
    marketId,
    selectionId,
    clientOdds,
    selectionName,
    acceptedLine,
  });
}

function findQuotedSelectionAcrossMarkets(_snapshot, _opts) {
  return null;
}

/** Normalize quote result to decimal odds (supports legacy number return in tests). */
export function unwrapServerOddsQuote(quote) {
  if (quote != null && typeof quote === 'object' && quote.odds != null) {
    return Number(quote.odds);
  }
  return Number(quote);
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
    || msg.startsWith('STALE_ODDS')
    || msg.startsWith('ODDS_EXPIRED')
    || msg.startsWith('MARKET_ALREADY_DETERMINED')
    || msg.startsWith('MARKET_SUSPENDED')
    || msg.startsWith('ODDS_LOCKED')
    || msg.startsWith('ODDS_UNAVAILABLE')
    || msg.startsWith('SELECTION_UNAVAILABLE');
}
