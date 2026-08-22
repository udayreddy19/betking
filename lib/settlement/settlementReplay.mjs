/**
 * Settlement replay — re-grade a bet from current match state without mutating finances.
 */

import { evaluateBetForSettlement, buildSettlementMatchState } from '../liveMatchSettlement.mjs';
import { getSettlementHistory } from './settlementAudit.mjs';

export async function replayBetSettlement({ bet, matchLookup }) {
  if (!bet) return { error: 'bet_required' };

  const evaluated = matchLookup
    ? await evaluateBetForSettlement(bet, matchLookup)
    : null;

  const stored = {
    status: bet.status,
    actualPayout: bet.actual_payout,
    settlementReason: bet.settlement_reason,
    settlementVersion: bet.settlement_version,
  };

  const history = await getSettlementHistory(bet.bet_id);

  const mismatch = evaluated && stored.status
    && ['WON', 'LOST', 'VOID'].includes(String(stored.status).toUpperCase())
    && String(evaluated.outcome).toUpperCase() !== String(stored.status).toUpperCase();

  return {
    betId: bet.bet_id,
    stored,
    replayed: evaluated,
    settlementHistory: history,
    discrepancy: mismatch ? {
      stored: stored.status,
      replayed: evaluated.outcome,
      reason: evaluated.reason,
    } : null,
    matchState: matchLookup?.(bet.match_id)
      ? buildSettlementMatchState(matchLookup(bet.match_id))
      : null,
  };
}
