/**
 * Pre-placement risk gates — stake/win/liability limits and orchestrator decisions.
 * Liability caps and house-protection rules hard-reject (no soft accept-with-limit).
 */

import { globalRiskOrchestrator } from './globalRiskOrchestrator.mjs';
import {
  enforceHouseProtection,
  liabilityLimitForMarket,
} from './houseProtectionEngine.mjs';
import { calculateExposureRisk } from './exposureEngine.mjs';

export async function enforceBetRisk({
  userId,
  stake,
  validatedSelections = [],
  betType = 'SINGLE',
  fundSource = 'cash',
}) {
  if (!userId || !Array.isArray(validatedSelections) || validatedSelections.length === 0) {
    throw new Error('RISK_REJECTED: Missing bet selections for risk evaluation');
  }

  const effectiveStake = Number(stake) || 0;

  for (const sel of validatedSelections) {
    const odds = Number(sel.odds) || 1;
    const marketId = sel.marketId || sel.market_id;
    const selectionId = sel.selectionId || sel.selection_id;
    const selectionName = sel.selectionName || sel.selection_name || selectionId;
    const matchId = sel.matchId || sel.match_id;

    await enforceHouseProtection({
      userId,
      stake: effectiveStake,
      odds,
      matchId,
      marketId,
      selectionId,
      selectionName,
      fundSource,
    });

    const exposureCheck = calculateExposureRisk({
      matchId,
      marketId,
      stake: effectiveStake,
      odds,
      maxLiabilityLimit: liabilityLimitForMarket(marketId),
    });
    if (exposureCheck?.exceedsMaxLiability) {
      throw Object.assign(
        new Error(
          `RISK_REJECTED: Market liability full — max remaining capacity ₹${Math.floor(exposureCheck.remainingCapacity || 0)}`,
        ),
        { code: 'MARKET_LIABILITY_FULL' },
      );
    }

    const decision = await globalRiskOrchestrator.evaluateBetRequest({
      userId,
      matchId,
      marketId,
      selectionId,
      clientOdds: odds,
      serverOdds: odds,
      stake: effectiveStake,
    });

    if (decision.decision !== 'ACCEPT') {
      const reason = decision.reason || decision.decision;
      throw Object.assign(
        new Error(`RISK_REJECTED: ${reason}`),
        { code: decision.decision, decision },
      );
    }
  }

  return effectiveStake;
}
