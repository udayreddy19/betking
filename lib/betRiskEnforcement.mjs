/**
 * Pre-placement risk gates — stake/win/liability limits and orchestrator decisions.
 * Liability caps hard-reject when remaining capacity cannot cover the stake.
 */

import { globalRiskOrchestrator } from './globalRiskOrchestrator.mjs';

const BLOCKING_DECISIONS = new Set(['REJECT', 'MANUAL_REVIEW', 'REQUIRE_ODDS_CONFIRMATION', 'REPRICE']);

export async function enforceBetRisk({
  userId,
  stake,
  validatedSelections = [],
  betType = 'SINGLE',
}) {
  if (!userId || !Array.isArray(validatedSelections) || validatedSelections.length === 0) {
    throw new Error('RISK_REJECTED: Missing bet selections for risk evaluation');
  }

  const effectiveStake = Number(stake) || 0;
  const legOdds = Number(validatedSelections[0]?.odds) || 1;

  for (const sel of validatedSelections) {
    const decision = await globalRiskOrchestrator.evaluateBetRequest({
      userId,
      matchId: sel.matchId,
      marketId: sel.marketId,
      selectionId: sel.selectionId,
      clientOdds: Number(sel.odds) || legOdds,
      serverOdds: Number(sel.odds) || legOdds,
      stake: effectiveStake,
    });

    if (BLOCKING_DECISIONS.has(decision.decision)) {
      const reason = decision.reason || decision.decision;
      throw Object.assign(
        new Error(`RISK_REJECTED: ${reason}`),
        { code: decision.decision, decision },
      );
    }
  }

  return effectiveStake;
}
