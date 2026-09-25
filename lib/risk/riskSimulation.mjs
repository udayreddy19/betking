/**
 * Deterministic risk simulation — uses authoritative open-bets Postgres exposure
 * (same path as production assertPersistedMatchLiabilityCapacity).
 */

import { liabilityLimitForMarket, isSrlContext } from '../houseProtectionEngine.mjs';
import { calculateAuthoritativeExposureRisk, AUTHORITATIVE_EXPOSURE_SOURCE } from '../persistedMarketLiability.mjs';
import { resolveEffectiveRiskLimits } from './riskHierarchy.mjs';
import { VELOCITY_DEFAULTS, getBetVelocitySnapshot } from './betVelocityBreaker.mjs';

export async function simulateBetRisk({
  matchId,
  marketId,
  stake,
  odds,
  league = null,
  sport = null,
  matchName = null,
  isSrl = false,
  userId = null,
} = {}) {
  const effectiveStake = Number(stake) || 0;
  const effectiveOdds = Number(odds) || 1;
  if (effectiveStake <= 0 || effectiveOdds < 1.01) {
    return {
      ok: false,
      reasonCode: 'INVALID_INPUT',
      message: 'Stake and odds must be positive',
    };
  }

  const srl = isSrl || isSrlContext({ league, sport, matchName, isSrl });
  const maxLiabilityLimit = liabilityLimitForMarket(marketId, { isSrl: srl });
  const potentialPayout = effectiveStake * effectiveOdds;
  const potentialLiability = Math.max(0, potentialPayout - effectiveStake);

  const hierarchy = resolveEffectiveRiskLimits({
    sport,
    competition: league,
    matchId,
    marketId,
    userId,
    eventMaxLiability: maxLiabilityLimit,
  });

  const before = await calculateAuthoritativeExposureRisk({
    matchId,
    stake: 0,
    odds: effectiveOdds,
    maxLiabilityLimit,
  });

  const after = await calculateAuthoritativeExposureRisk({
    matchId,
    stake: effectiveStake,
    odds: effectiveOdds,
    maxLiabilityLimit,
  });

  const exceeds = Boolean(after?.exceedsMaxLiability);
  let riskLevel = 'NORMAL';
  const usedRatio = maxLiabilityLimit > 0
    ? (Number(after?.projectedLiability ?? after?.currentLiability ?? 0) / maxLiabilityLimit)
    : 0;
  if (exceeds || usedRatio >= 1) riskLevel = 'CRITICAL';
  else if (usedRatio >= 0.85) riskLevel = 'HIGH';
  else if (usedRatio >= 0.6) riskLevel = 'ELEVATED';

  const stakeBlocked = hierarchy.maxStake != null && effectiveStake > hierarchy.maxStake;
  const payoutBlocked = hierarchy.maxPayout != null && potentialPayout > hierarchy.maxPayout;

  return {
    ok: !exceeds && !stakeBlocked && !payoutBlocked,
    reasonCode: exceeds
      ? 'EVENT_EXPOSURE_LIMIT'
      : stakeBlocked
        ? 'USER_LIMIT'
        : payoutBlocked
          ? 'PAYOUT_LIMIT'
          : 'ACCEPTABLE',
    riskLevel,
    stake: effectiveStake,
    odds: effectiveOdds,
    potentialPayout,
    potentialLiability,
    maxLiabilityLimit,
    hierarchy,
    authoritativeExposureSource: AUTHORITATIVE_EXPOSURE_SOURCE,
    before: {
      currentLiability: Number(before.currentLiability || 0),
      remainingCapacity: Number(before.remainingCapacity ?? maxLiabilityLimit),
    },
    after: {
      projectedLiability: Number(after?.projectedLiability ?? after?.currentLiability ?? 0),
      remainingCapacity: Number(after?.remainingCapacity ?? 0),
      exceedsMaxLiability: exceeds,
    },
    velocity: getBetVelocitySnapshot(VELOCITY_DEFAULTS),
  };
}
