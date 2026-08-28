/**
 * OddsEngineV3 — Multi-Provider Settlement Verification & Idempotent Join Engine
 * 
 * Verifies official settlement outcomes across multiple external provider feeds.
 * Flags provider disagreements as CONFLICT and guarantees idempotent append-only settlement joins.
 */

export const SETTLEMENT_STATUS = Object.freeze({
  VERIFIED: 'VERIFIED',
  CONFLICT: 'CONFLICT',
  PENDING: 'PENDING',
  REJECTED: 'REJECTED',
});

/**
 * Cross-verifies settlement outcomes from multiple provider feeds.
 */
export function verifyMultiProviderSettlement({
  matchId,
  marketType = 'match_winner',
  providerResults = {}, // { cricbuzz: '1', crex: '1', espn: '1' }
} = {}) {
  const providers = Object.keys(providerResults);
  if (providers.length === 0) {
    return {
      status: SETTLEMENT_STATUS.PENDING,
      matchId,
      marketType,
      winningSelection: null,
      reason: 'No provider settlement results available yet.',
    };
  }

  const outcomes = Object.values(providerResults);
  const uniqueOutcomes = [...new Set(outcomes)];

  if (uniqueOutcomes.length === 1) {
    // Unanimous agreement across providers
    return {
      status: SETTLEMENT_STATUS.VERIFIED,
      matchId,
      marketType,
      winningSelection: uniqueOutcomes[0],
      agreementCount: providers.length,
      verifiedAt: new Date().toISOString(),
    };
  }

  // Disagreement detected across providers
  return {
    status: SETTLEMENT_STATUS.CONFLICT,
    matchId,
    marketType,
    winningSelection: null,
    conflictingOutcomes: providerResults,
    reason: `Provider conflict detected: ${JSON.stringify(providerResults)}`,
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * Idempotently joins a verified settlement outcome to an observation.
 * If already settled, returns the existing record without duplicating metrics.
 */
export function idempotentJoinSettlement(observation, {
  winningSelection,
  settledAt = new Date().toISOString(),
  verificationStatus = SETTLEMENT_STATUS.VERIFIED,
} = {}) {
  if (observation.settlement && observation.settlement.outcome != null) {
    return {
      observation,
      isAlreadySettled: true,
      isModified: false,
    };
  }

  const isWin = observation.selection === winningSelection;
  const y = isWin ? 1 : 0;
  const p = Math.min(Math.max(observation.probability, 0.001), 0.999);

  const brierContribution = Number(Math.pow(p - y, 2).toFixed(4));
  const logLossContribution = Number((-(y * Math.log(p) + (1 - y) * Math.log(1 - p))).toFixed(4));
  const bucketMin = Math.min(0.9, Math.floor(p * 10) / 10);
  const calibrationBucket = `[${bucketMin.toFixed(1)}-${(bucketMin + 0.1).toFixed(1)}]`;

  const updatedObservation = {
    ...observation,
    settlement: {
      settledAt,
      winningSelection,
      outcome: y,
      correct: isWin,
      verificationStatus,
      brierContribution,
      logLossContribution,
      calibrationBucket,
    },
  };

  return {
    observation: updatedObservation,
    isAlreadySettled: false,
    isModified: true,
  };
}
