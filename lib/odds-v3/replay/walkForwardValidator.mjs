/**
 * OddsEngineV3 — Chronological Walk-Forward Validator
 * 
 * Performs forward-chaining time-series cross-validation:
 * - Train Split: [0% to 60%]
 * - Validation Split: [60% to 80%]
 * - Test Split: [80% to 100%]
 * 
 * Never randomly shuffles time-series data to avoid look-ahead bias.
 * Computes: Brier Score, Log Loss, ECE (Expected Calibration Error), MCE (Max Calibration Error).
 */

import { runHistoricalBacktest } from './backtestRunner.mjs';

/**
 * Calculates Expected Calibration Error (ECE) and Maximum Calibration Error (MCE).
 */
export function computeCalibrationErrors(calibrationBuckets = []) {
  if (!calibrationBuckets.length) return { ece: null, mce: null };

  let totalCount = 0;
  let weightedErrorSum = 0;
  let maxError = 0;

  for (const b of calibrationBuckets) {
    if (b.count > 0 && b.error !== null) {
      totalCount += b.count;
      weightedErrorSum += b.count * b.error;
      if (b.error > maxError) maxError = b.error;
    }
  }

  if (totalCount === 0) return { ece: null, mce: null };

  return {
    ece: Number((weightedErrorSum / totalCount).toFixed(4)),
    mce: Number(maxError.toFixed(4)),
  };
}

/**
 * Runs walk-forward evaluation on a sorted chronological observation dataset.
 */
export function runWalkForwardValidation(observations = [], { sport = 'soccer', config = {} } = {}) {
  if (!Array.isArray(observations) || observations.length < 10) {
    return {
      status: 'INSUFFICIENT_SAMPLE',
      sampleSize: observations.length,
      trainMetrics: null,
      valMetrics: null,
      testMetrics: null,
      overallEce: null,
      overallMce: null,
    };
  }

  const sorted = [...observations].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const n = sorted.length;

  const trainEnd = Math.floor(n * 0.60);
  const valEnd = Math.floor(n * 0.80);

  const trainSet = sorted.slice(0, trainEnd);
  const valSet = sorted.slice(trainEnd, valEnd);
  const testSet = sorted.slice(valEnd);

  const trainRes = runHistoricalBacktest({ timeline: trainSet, sport, config });
  const valRes = runHistoricalBacktest({ timeline: valSet, sport, config });
  const testRes = runHistoricalBacktest({ timeline: testSet, sport, config });

  const testCalib = computeCalibrationErrors(testRes.calibrationBuckets || []);
  const overallRes = runHistoricalBacktest({ timeline: sorted, sport, config });
  const overallCalib = computeCalibrationErrors(overallRes.calibrationBuckets || []);

  return {
    status: 'COMPLETED',
    totalSamples: n,
    splits: {
      trainCount: trainSet.length,
      valCount: valSet.length,
      testCount: testSet.length,
    },
    trainMetrics: {
      brierScore: trainRes.brierScore,
      logLoss: trainRes.logLoss,
    },
    valMetrics: {
      brierScore: valRes.brierScore,
      logLoss: valRes.logLoss,
    },
    testMetrics: {
      brierScore: testRes.brierScore,
      logLoss: testRes.logLoss,
      ece: testCalib.ece,
      mce: testCalib.mce,
    },
    overallMetrics: {
      brierScore: overallRes.brierScore,
      logLoss: overallRes.logLoss,
      ece: overallCalib.ece,
      mce: overallCalib.mce,
    },
    evaluatedAt: new Date().toISOString(),
  };
}
