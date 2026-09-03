/**
 * Live bet acceptance hold — re-check score fingerprint and odds after a short delay
 * so last-ball / lagged-feed snipes cannot lock soft prices.
 */

import { matchOddsStateKey } from './matchOddsStateKey.mjs';
import { resolveServerOdds, unwrapServerOddsQuote } from './oddsQuoteService.mjs';

export const LIVE_BET_HOLD_MS = process.env.LIVE_BET_HOLD_MS != null
  ? Number(process.env.LIVE_BET_HOLD_MS)
  : (process.env.VITEST || process.env.NODE_ENV === 'test' ? 0 : 3500);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {object} params
 * @param {object} params.initialQuote
 * @param {string} params.matchId
 * @param {string} params.marketId
 * @param {string} params.selectionId
 * @param {string} [params.selectionName]
 * @param {number} params.clientOdds
 * @param {object} [params.matchHint] optional match object for pre-hold state key
 * @param {number} [params.holdMs]
 */
export async function holdAndRecheckLiveQuote({
  initialQuote,
  matchId,
  marketId,
  selectionId,
  selectionName = null,
  clientOdds,
  matchHint = null,
  holdMs = LIVE_BET_HOLD_MS,
}) {
  const beforeKey = initialQuote?.stateKey
    || initialQuote?.matchStateKey
    || (matchHint ? matchOddsStateKey(matchHint) : null);

  const beforeOdds = unwrapServerOddsQuote(initialQuote);
  const wait = Math.max(0, Math.min(8000, Number(holdMs) || LIVE_BET_HOLD_MS));
  if (wait > 0) await sleep(wait);

  const refreshed = await resolveServerOdds({
    matchId,
    marketId,
    selectionId,
    clientOdds,
    selectionName,
    forceFresh: true,
  });
  const afterOdds = unwrapServerOddsQuote(refreshed);
  const afterKey = refreshed?.stateKey || refreshed?.matchStateKey || null;

  if (beforeKey && afterKey && beforeKey !== afterKey) {
    const err = new Error('SCORE_CHANGED: Live score moved during bet acceptance — please requote');
    err.code = 'SCORE_CHANGED';
    err.status = 409;
    throw err;
  }

  if (Number.isFinite(beforeOdds) && Number.isFinite(afterOdds) && Math.abs(beforeOdds - afterOdds) > 0.02) {
    const err = new Error(
      `ODDS_CHANGED: Odds moved from ${beforeOdds} to ${afterOdds} during acceptance — please requote`,
    );
    err.code = 'ODDS_CHANGED';
    err.status = 409;
    throw err;
  }

  return refreshed;
}
