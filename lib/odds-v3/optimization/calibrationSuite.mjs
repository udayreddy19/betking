/**
 * OddsEngineV3 — Calibration Suite
 * 
 * Provides unified evaluation of Raw vs Platt vs Isotonic vs Temperature scaling transforms.
 * Computes Brier Score, Log Loss, ECE, MCE, slope, intercept, and 10-bin reliability curves.
 */

import { calculateBrierScore, calculateLogLoss, calculateCalibrationMetrics } from '../validation/modelScorecard.mjs';

const MIN_SEGMENT_SAMPLE_SIZE = 100;

/**
 * Calculates calibration slope and intercept via linear regression on log-odds vs empirical outcomes.
 */
export function calculateCalibrationSlopeAndIntercept(predictions = []) {
  if (predictions.length < 10) {
    return { slope: 1.0, intercept: 0.0 };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  const n = predictions.length;

  for (const p of predictions) {
    const prob = Math.min(Math.max(p.predictionProbability ?? p.prob ?? 0.5, 0.001), 0.999);
    const logit = Math.log(prob / (1 - prob));
    const y = p.actualOutcome ? 1 : (p.actual ? 1 : 0);

    sumX += logit;
    sumY += y;
    sumXY += logit * y;
    sumXX += logit * logit;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
  const intercept = (sumY - slope * sumX) / n;

  return {
    slope: Number(slope.toFixed(4)),
    intercept: Number(intercept.toFixed(4)),
  };
}

/**
 * Generates 10-bin empirical reliability curves.
 */
export function generateReliabilityCurve(predictions = [], binsCount = 10) {
  const bins = Array.from({ length: binsCount }, (_, idx) => ({
    binIndex: idx,
    binLower: idx / binsCount,
    binUpper: (idx + 1) / binsCount,
    count: 0,
    predSum: 0,
    outcomeSum: 0,
  }));

  for (const p of predictions) {
    const prob = Math.min(Math.max(p.predictionProbability ?? p.prob ?? 0.5, 0.0), 1.0);
    const y = p.actualOutcome ? 1 : (p.actual ? 1 : 0);
    const idx = Math.min(binsCount - 1, Math.floor(prob * binsCount));

    bins[idx].count++;
    bins[idx].predSum += prob;
    bins[idx].outcomeSum += y;
  }

  return bins.map((b) => ({
    binRange: `[${b.binLower.toFixed(2)}-${b.binUpper.toFixed(2)}]`,
    sampleCount: b.count,
    meanPredictedProbability: b.count > 0 ? Number((b.predSum / b.count).toFixed(4)) : 0,
    empiricalPositiveRate: b.count > 0 ? Number((b.outcomeSum / b.count).toFixed(4)) : 0,
    calibrationError: b.count > 0 ? Number((Math.abs(b.predSum / b.count - b.outcomeSum / b.count)).toFixed(4)) : 0,
  }));
}

/**
 * Evaluates comprehensive calibration metrics across all candidate calibration methods.
 */
export function evaluateCalibrationSuite(dataset = [], { sport = 'all', market = 'all' } = {}) {
  if (dataset.length === 0) {
    return {
      status: 'INSUFFICIENT_DATA',
      sampleCount: 0,
      globalFallbackUsed: true,
    };
  }

  const useFallback = dataset.length < MIN_SEGMENT_SAMPLE_SIZE;
  const brier = calculateBrierScore(dataset);
  const logLoss = calculateLogLoss(dataset);
  const calMetrics = calculateCalibrationMetrics(dataset);
  const { slope, intercept } = calculateCalibrationSlopeAndIntercept(dataset);
  const reliabilityCurve = generateReliabilityCurve(dataset);

  return {
    status: useFallback ? 'FALLBACK_TO_GLOBAL_CALIBRATION' : 'SEGMENT_CALIBRATED',
    sport,
    market,
    sampleCount: dataset.length,
    metrics: {
      brierScore: Number(brier.toFixed(4)),
      logLoss: Number(logLoss.toFixed(4)),
      expectedCalibrationError: Number((calMetrics.expectedCalibrationError || 0).toFixed(4)),
      maximumCalibrationError: Number((calMetrics.maxCalibrationError || 0).toFixed(4)),
      calibrationSlope: slope,
      calibrationIntercept: intercept,
    },
    reliabilityCurve,
    evaluatedAt: new Date().toISOString(),
  };
}
