/**
 * OddsEngineV3 — Champion / Challenger Shadow Validation Framework
 * 
 * Compares authoritative production model (Champion: v3.1-prod) against
 * experimental optimization candidate (Challenger: v3.2-candidate-004 / pipeline)
 * in parallel shadow execution, logging prediction vs settlement accuracy.
 * 
 * NEVER mutates live bettor odds or financial settlements.
 */

import crypto from 'crypto';

/**
 * Creates an immutable shadow comparison record for a live market prediction.
 */
export function recordChampionChallengerPrediction({
  sport = 'cricket',
  market = 'match_winner',
  selection = '1',
  canonicalState = {},
  championOutput = { probability: 0.55, odds: 1.75 },
  challengerOutput = { probability: 0.54, odds: 1.78 },
  telemetry = {},
} = {}) {
  const timestamp = new Date().toISOString();
  const canonicalStateHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalState))
    .digest('hex')
    .substring(0, 16);

  return {
    predictionId: `pred_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp,
    sport,
    market,
    selection,
    canonicalStateVersion: canonicalState.stateVersion || 1,
    canonicalStateHash,

    // Champion (v3.1-prod)
    champion: {
      modelVersion: 'v3.1-prod',
      probability: championOutput.probability,
      fairOdds: championOutput.fairOdds || Number((1 / championOutput.probability).toFixed(4)),
      offeredOdds: championOutput.odds,
      confidenceScore: championOutput.confidenceScore || 95,
      uncertaintyScore: championOutput.uncertaintyScore || 5,
      margin: championOutput.margin || 0.05,
      suspended: championOutput.suspended || false,
    },

    // Challenger (Candidate)
    challenger: {
      candidateVersion: challengerOutput.candidateVersion || 'v3.2-candidate-pipeline',
      probability: challengerOutput.probability,
      fairOdds: challengerOutput.fairOdds || Number((1 / challengerOutput.probability).toFixed(4)),
      offeredOdds: challengerOutput.odds,
      confidenceScore: challengerOutput.confidenceScore || 95,
      uncertaintyScore: challengerOutput.uncertaintyScore || 5,
      margin: challengerOutput.margin || 0.05,
      suspended: challengerOutput.suspended || false,
    },

    deltaProbability: Number((challengerOutput.probability - championOutput.probability).toFixed(4)),
    deltaOdds: Number((challengerOutput.odds - championOutput.odds).toFixed(4)),
    regime: telemetry.regime || 'NORMAL_LIVE',
    providerWeights: telemetry.providerWeights || {},
    eventContext: telemetry.matchStateEvent || null,
    explanationId: `exp_${Date.now()}`,
    settlement: null, // Populated upon settlement
  };
}

/**
 * Attaches real-world settlement outcome to a shadow prediction record.
 */
export function attachSettlementOutcome(predictionRecord, {
  settledAt = new Date().toISOString(),
  outcome = 'WIN', // 'WIN' | 'LOSE' | 'VOID'
  closingProbability = null,
  closingOdds = null,
} = {}) {
  const isWin = outcome === 'WIN';
  const y = isWin ? 1 : 0;

  const champP = predictionRecord.champion.probability;
  const challP = predictionRecord.challenger.probability;

  // Calculate individual Brier contribution: (p - y)^2
  const champBrier = Number(Math.pow(champP - y, 2).toFixed(4));
  const challBrier = Number(Math.pow(challP - y, 2).toFixed(4));

  // LogLoss contribution: -(y * ln(p) + (1-y) * ln(1-p))
  const clampP = (p) => Math.min(Math.max(p, 0.001), 0.999);
  const champLogLoss = Number((-(y * Math.log(clampP(champP)) + (1 - y) * Math.log(1 - clampP(champP)))).toFixed(4));
  const challLogLoss = Number((-(y * Math.log(clampP(challP)) + (1 - y) * Math.log(1 - clampP(challP)))).toFixed(4));

  const calibrationBucket = `[${(Math.floor(champP * 10) / 10).toFixed(1)}-${(Math.floor(champP * 10) / 10 + 0.1).toFixed(1)}]`;

  return {
    ...predictionRecord,
    settlement: {
      settledAt,
      outcome,
      correct: isWin,
      championBrier: champBrier,
      challengerBrier: challBrier,
      brierDelta: Number((challBrier - champBrier).toFixed(4)), // Negative is improvement
      championLogLoss: champLogLoss,
      challengerLogLoss: challLogLoss,
      logLossDelta: Number((challLogLoss - champLogLoss).toFixed(4)),
      calibrationBucket,
      closingProbability,
      closingOdds,
    },
  };
}
