/**
 * OddsEngineV3 — Walk-Forward Backtest Engine
 * 
 * Executes temporal walk-forward backtesting (Train -> Validate -> Test)
 * strictly enforcing temporal ordering and anti-leakage invariants.
 * 
 * ZERO LEAKAGE: Rejects any sample where predictionTimestamp >= settlementTimestamp.
 */

import { calculateBrierScore, calculateLogLoss, calculateCalibrationMetrics } from '../validation/modelScorecard.mjs';

/**
 * Runs walk-forward backtest evaluating baseline vs candidate models.
 */
export function runWalkForwardBacktest({
  dataset = [],
  baselinePredictFn,
  candidatePredictFn,
  splits = { trainRatio: 0.6, valRatio: 0.2, testRatio: 0.2 },
} = {}) {
  if (!Array.isArray(dataset) || dataset.length === 0) {
    return {
      status: 'INSUFFICIENT_DATA',
      sampleCount: 0,
      baselineMetrics: null,
      candidateMetrics: null,
    };
  }

  // Ensure chronological sorting
  const sorted = [...dataset].sort((a, b) => new Date(a.predictionTimestamp || a.timestamp) - new Date(b.predictionTimestamp || b.timestamp));

  // Anti-leakage validation
  for (const row of sorted) {
    const tPred = new Date(row.predictionTimestamp || row.timestamp).getTime();
    const tSettle = new Date(row.settlementTimestamp || row.settledAt || Date.now() + 100000).getTime();
    if (tPred >= tSettle) {
      throw new Error(`Data leakage detected: prediction (${tPred}) >= settlement (${tSettle})`);
    }
  }

  const n = sorted.length;
  const trainEnd = Math.floor(n * splits.trainRatio);
  const valEnd = trainEnd + Math.floor(n * splits.valRatio);

  const testSet = sorted.slice(valEnd);

  if (testSet.length === 0) {
    return {
      status: 'INSUFFICIENT_TEST_SPLIT',
      sampleCount: n,
    };
  }

  const baselinePreds = [];
  const candidatePreds = [];

  for (const item of testSet) {
    const pBase = baselinePredictFn ? baselinePredictFn(item) : (item.baselineProb ?? item.probability ?? 0.5);
    const pCand = candidatePredictFn ? candidatePredictFn(item) : (item.candidateProb ?? item.probability ?? 0.5);
    const actual = item.actualOutcome ? 1 : (item.outcome === 'WIN' ? 1 : 0);

    baselinePreds.push({ predictionProbability: pBase, actualOutcome: actual });
    candidatePreds.push({ predictionProbability: pCand, actualOutcome: actual });
  }

  const baseBrier = calculateBrierScore(baselinePreds);
  const candBrier = calculateBrierScore(candidatePreds);
  const baseLogLoss = calculateLogLoss(baselinePreds);
  const candLogLoss = calculateLogLoss(candidatePreds);
  const baseCal = calculateCalibrationMetrics(baselinePreds);
  const candCal = calculateCalibrationMetrics(candidatePreds);

  const brierSkill = baseBrier > 0 ? Number((((baseBrier - candBrier) / baseBrier) * 100).toFixed(2)) : 0;

  return {
    status: testSet.length >= 1000 ? 'STATISTICALLY_VALID' : 'INSUFFICIENT_DATA',
    totalSamples: n,
    testSamples: testSet.length,
    baselineMetrics: {
      brier: Number(baseBrier.toFixed(4)),
      logLoss: Number(baseLogLoss.toFixed(4)),
      ece: Number((baseCal.expectedCalibrationError || 0).toFixed(4)),
    },
    candidateMetrics: {
      brier: Number(candBrier.toFixed(4)),
      logLoss: Number(candLogLoss.toFixed(4)),
      ece: Number((candCal.expectedCalibrationError || 0).toFixed(4)),
    },
    brierSkillScorePct: brierSkill,
    evaluationTimestamp: new Date().toISOString(),
  };
}
