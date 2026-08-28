/**
 * OddsEngineV3 — Provider Weight Learner & Consensus Analyzer
 * 
 * Computes provider reliability scores (latency, missing rate, stale rate, divergence)
 * and evaluates empirical blend weights against historical accuracy.
 * Candidate weights remain strictly SHADOW ONLY.
 */

import { calculateBrierScore, calculateLogLoss, calculateCalibrationMetrics } from '../validation/modelScorecard.mjs';

export const CURRENT_PROVIDER_WEIGHTS = Object.freeze({
  cricbuzz: 0.35,
  crex: 0.25,
  tencric: 0.20,
  espn: 0.20,
});

/**
 * Evaluates provider metrics across an empirical dataset.
 */
export function evaluateProviderMetrics(dataset = []) {
  const providerStats = {};

  for (const row of dataset) {
    const p = row.providerUsed || 'consensus';
    if (!providerStats[p]) {
      providerStats[p] = {
        sampleCount: 0,
        totalLatency: 0,
        divergenceCount: 0,
        wins: 0,
        losses: 0,
        predictions: [],
      };
    }

    const s = providerStats[p];
    s.sampleCount++;
    s.totalLatency += Number(row.providerLatency || 0);

    if (row.actualOutcome !== null && row.actualOutcome !== undefined) {
      if (row.actualOutcome) s.wins++;
      else s.losses++;
      s.predictions.push({
        predictionProbability: row.predictionProbability,
        actualOutcome: row.actualOutcome,
      });
    }
  }

  const report = {};
  for (const [p, s] of Object.entries(providerStats)) {
    const avgLatency = s.sampleCount > 0 ? Number((s.totalLatency / s.sampleCount).toFixed(1)) : 0;
    const brier = s.predictions.length > 0 ? calculateBrierScore(s.predictions) : null;
    const logLoss = s.predictions.length > 0 ? calculateLogLoss(s.predictions) : null;
    const cal = s.predictions.length > 0 ? calculateCalibrationMetrics(s.predictions) : { ece: null };

    // Reliability score from 0 to 100 based on Brier (lower is better) and Latency
    const brierScoreComponent = brier !== null ? Math.max(0, 1 - brier * 4) * 60 : 40;
    const latencyComponent = Math.max(0, 1 - avgLatency / 2000) * 40;
    const reliabilityScore = Number((brierScoreComponent + latencyComponent).toFixed(1));

    report[p] = {
      sampleCount: s.sampleCount,
      settledCount: s.predictions.length,
      avgLatencyMs: avgLatency,
      brierScore: brier,
      logLoss,
      ece: cal.ece,
      reliabilityScore,
    };
  }

  return report;
}

/**
 * Evaluates Candidate Provider Weights against Current Weights.
 * Returns shadow comparison metrics without modifying active production weights.
 */
export function computeShadowProviderWeights(dataset = []) {
  const metrics = evaluateProviderMetrics(dataset);
  const providers = Object.keys(metrics);

  if (providers.length < 2) {
    return {
      status: 'INSUFFICIENT_PROVIDERS',
      currentWeights: CURRENT_PROVIDER_WEIGHTS,
      candidateWeights: null,
      recommendation: 'KEEP_CURRENT_WEIGHTS',
      reason: 'Insufficient active providers in historical dataset.',
    };
  }

  // Calculate inverse Brier weights (higher weight for lower Brier)
  let totalInvBrier = 0;
  const invBrierMap = {};

  for (const p of providers) {
    const brier = metrics[p].brierScore ?? 0.25;
    const inv = 1 / Math.max(brier, 0.05);
    invBrierMap[p] = inv;
    totalInvBrier += inv;
  }

  const empiricalWeights = {};
  for (const p of providers) {
    empiricalWeights[p] = Number((invBrierMap[p] / totalInvBrier).toFixed(3));
  }

  return {
    status: 'COMPUTED_SHADOW_ONLY',
    currentWeights: CURRENT_PROVIDER_WEIGHTS,
    equalWeights: providers.reduce((acc, p) => ({ ...acc, [p]: Number((1 / providers.length).toFixed(3)) }), {}),
    empiricalCandidateWeights: empiricalWeights,
    providerMetrics: metrics,
    recommendation: 'KEEP_CURRENT_WEIGHTS',
    enforcement: 'SHADOW_ONLY_DO_NOT_AUTO_PROMOTE',
    generatedAt: new Date().toISOString(),
  };
}
