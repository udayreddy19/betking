/**
 * Pre-placement risk gates — stake/win/liability limits and orchestrator decisions.
 * Liability caps hard-reject when remaining capacity cannot cover the stake.
 */

import { validateBetRisk } from './riskEngine.mjs';
import { globalRiskOrchestrator } from './globalRiskOrchestrator.mjs';
import { calculateExposureRisk } from './exposureEngine.mjs';
import { getSelectionLiability } from './marketLiabilityStore.mjs';

const BLOCKING_DECISIONS = new Set(['REJECT', 'MANUAL_REVIEW', 'REQUIRE_ODDS_CONFIRMATION', 'REPRICE']);
const MIN_STAKE_AFTER_CAP = 10;

export async function enforceBetRisk({
  userId,
  stake,
  validatedSelections = [],
  betType = 'SINGLE',
}) {
  if (!userId || !Array.isArray(validatedSelections) || validatedSelections.length === 0) {
    throw new Error('RISK_REJECTED: Missing bet selections for risk evaluation');
  }

  let effectiveStake = Number(stake) || 0;
  const combinedOdds = validatedSelections.reduce((acc, sel) => acc * Number(sel.odds || 1), 1);

  for (const sel of validatedSelections) {
    const legOdds = Number(sel.odds) || 1;
    const riskOdds = betType === 'ACCUMULATOR' ? combinedOdds : legOdds;

    const risk = validateBetRisk({
      userId,
      matchId: sel.matchId,
      marketId: sel.marketId,
      selectionId: sel.selectionId,
      stake: effectiveStake,
      odds: riskOdds,
    });

    if (!risk.isApproved) {
      const liabilityFlag = (risk.flags || []).find((f) => String(f).includes('MATCH_LIABILITY'));
      if (liabilityFlag) {
        throw Object.assign(
          new Error(`LIABILITY_CAP: ${liabilityFlag}`),
          { code: 'LIABILITY_CAP', flags: risk.flags },
        );
      }
      throw Object.assign(
        new Error(`RISK_REJECTED: ${risk.flags.join(', ') || 'Bet exceeds risk limits'}`),
        { code: 'RISK_REJECTED', flags: risk.flags },
      );
    }

    if (effectiveStake > risk.maxAllowedStake) {
      effectiveStake = risk.maxAllowedStake;
    }

    // Hard liability cap: persisted selection liability + in-memory exposure
    const exposureCheck = calculateExposureRisk({
      matchId: sel.matchId,
      marketId: sel.marketId,
      stake: effectiveStake,
      odds: riskOdds,
    });
    const storedLiab = getSelectionLiability(sel.marketId, sel.selectionId);
    const projectedLiab = exposureCheck.newWorstCase + Math.max(0, storedLiab);
    if (projectedLiab > exposureCheck.maxLiabilityLimit) {
      const remaining = Math.max(
        0,
        exposureCheck.remainingCapacity - Math.max(0, storedLiab),
      );
      const cappedStake = Math.max(
        0,
        Math.floor(remaining / Math.max(riskOdds - 1, 0.01)),
      );
      if (cappedStake < MIN_STAKE_AFTER_CAP) {
        throw Object.assign(
          new Error(
            `LIABILITY_CAP: Match/market liability limit reached (₹${exposureCheck.maxLiabilityLimit}). Remaining capacity ₹${remaining.toFixed(0)}`,
          ),
          { code: 'LIABILITY_CAP', remainingCapacity: remaining, maxLiabilityLimit: exposureCheck.maxLiabilityLimit },
        );
      }
      effectiveStake = Math.min(effectiveStake, cappedStake);
    }

    const decision = await globalRiskOrchestrator.evaluateBetRequest({
      userId,
      matchId: sel.matchId,
      marketId: sel.marketId,
      selectionId: sel.selectionId,
      clientOdds: legOdds,
      serverOdds: legOdds,
      stake: effectiveStake,
    });

    if (BLOCKING_DECISIONS.has(decision.decision)) {
      const reason = decision.reason || decision.decision;
      throw Object.assign(
        new Error(`RISK_REJECTED: ${reason}`),
        { code: decision.decision, decision },
      );
    }

    if (decision.decision === 'ACCEPT_WITH_LIMIT' && Number.isFinite(decision.maxAllowedStake)) {
      if (decision.maxAllowedStake < MIN_STAKE_AFTER_CAP) {
        throw Object.assign(
          new Error(`LIABILITY_CAP: ${decision.reason || 'Stake exceeds maximum liability capacity for market'}`),
          { code: 'LIABILITY_CAP', decision },
        );
      }
      effectiveStake = Math.min(effectiveStake, decision.maxAllowedStake);
    }
  }

  if (betType === 'ACCUMULATOR') {
    const accaRisk = validateBetRisk({
      userId,
      matchId: validatedSelections[0]?.matchId || 'global',
      marketId: 'accumulator',
      selectionId: 'combo',
      stake: effectiveStake,
      odds: combinedOdds,
    });
    if (!accaRisk.isApproved) {
      throw Object.assign(
        new Error(`RISK_REJECTED: ${accaRisk.flags.join(', ') || 'Accumulator exceeds risk limits'}`),
        { code: 'RISK_REJECTED', flags: accaRisk.flags },
      );
    }
    if (effectiveStake > accaRisk.maxAllowedStake) {
      effectiveStake = accaRisk.maxAllowedStake;
    }
  }

  if (effectiveStake < MIN_STAKE_AFTER_CAP) {
    throw new Error('LIABILITY_CAP: Stake reduced below minimum by risk/liability limits');
  }

  return effectiveStake;
}
