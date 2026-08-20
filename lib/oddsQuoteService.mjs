/**
 * Server-authoritative odds quoting for bet placement (singles + acca legs).
 * Live snapshot → V3 canonical fallback only. No stale DB odds.
 */

import { findQuotedSelection, assertBettableQuote } from './odds-v3/bookIntegrity.mjs';
import { MIN_DECIMAL_ODDS } from './odds-v3/pricing/MarginCalculator.mjs';
import { evaluateMarketAgainstMatchState } from './marketEvaluationEngine.mjs';
import { query } from '../db/pg.js';

export async function resolveServerOdds({ matchId, marketId, selectionId, clientOdds }) {
  if (!matchId || !marketId || !selectionId) {
    throw new Error('INVALID_BET: matchId, marketId, and selectionId are required');
  }

  let serverOdds = null;

  try {
    const { buildMatchOddsPayload } = await import('./liveScoresApiHandlers.mjs');
    const liveSnap = await buildMatchOddsPayload({ matchId, force: false });
    if (liveSnap?.status === 'DETERMINED') {
      throw new Error('MARKET_ALREADY_DETERMINED: Match markets are closed');
    }
    if (Array.isArray(liveSnap?.markets) && liveSnap.markets.length > 0) {
      const quoted = findQuotedSelection(liveSnap, marketId, selectionId);
      if (!quoted) {
        throw new Error(`ODDS_UNAVAILABLE: Selection '${selectionId}' is not on the live snapshot`);
      }
      serverOdds = assertBettableQuote(quoted.odds, clientOdds);
    }
  } catch (err) {
    if (isQuoteFatalError(err)) throw err;
  }

  if (serverOdds == null) {
    try {
      const { canonicalMatchStateEngine } = await import('./canonicalMatchState.mjs');
      const canonicalState = canonicalMatchStateEngine.getMatchState(matchId);
      if (canonicalState && (canonicalState.sport === 'CRICKET' || canonicalState.team1)) {
        const { generate } = await import('./odds-v3/OddsEngineV3.mjs');
        const v3Snap = generate(canonicalState);
        if (v3Snap && v3Snap.status === 'OK') {
          const quoted = findQuotedSelection(v3Snap, marketId, selectionId);
          if (quoted) {
            serverOdds = assertBettableQuote(quoted.odds, clientOdds);
          }
        }
      }
    } catch (err) {
      if (isQuoteFatalError(err)) throw err;
    }
  }

  if (!serverOdds || Number.isNaN(serverOdds) || serverOdds < MIN_DECIMAL_ODDS) {
    throw new Error(
      `ODDS_UNAVAILABLE: Authoritative odds unavailable for selection '${selectionId}' on match '${matchId}'`,
    );
  }

  await assertSelectionStillOpen({ matchId, marketId, selectionId });

  return serverOdds;
}

function isQuoteFatalError(err) {
  const msg = err?.message || '';
  return msg.startsWith('ODDS_CHANGED')
    || msg.startsWith('MARKET_ALREADY_DETERMINED')
    || msg.startsWith('MARKET_SUSPENDED')
    || msg.startsWith('ODDS_LOCKED')
    || msg.startsWith('ODDS_UNAVAILABLE: Selection');
}

async function assertSelectionStillOpen({ matchId, marketId, selectionId }) {
  try {
    const matchRes = await query(
      'SELECT live_score1, live_score2, status FROM matches WHERE match_id = $1',
      [matchId],
    );
    if (matchRes.rows.length === 0) return;
    const mRow = matchRes.rows[0];
    const evalRes = evaluateMarketAgainstMatchState(
      {
        id: marketId,
        marketType: marketId,
        title: marketId,
        options: [{ id: selectionId, selection: selectionId, name: selectionId }],
      },
      {
        liveDetails: {
          runs: parseInt(mRow.live_score1 || 0, 10),
          score2: parseInt(mRow.live_score2 || 0, 10),
        },
        status: mRow.status,
      },
    );
    if (evalRes.determined || (evalRes.options && evalRes.options[0]?.determined)) {
      throw new Error(`MARKET_ALREADY_DETERMINED: Market selection '${selectionId}' is already determined`);
    }
  } catch (err) {
    if (err.message.includes('MARKET_ALREADY_DETERMINED')) throw err;
  }
}
