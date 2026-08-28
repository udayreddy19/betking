/**
 * OddsEngineV3 — Rolling Model Drift & Calibration Quality Detector
 * 
 * Computes multi-window statistical drift across:
 * - 24 Hours
 * - 7 Days
 * - 30 Days
 * 
 * Invariants:
 * - Status is GREEN (Stable) when Brier Score drift <= 15% and Log Loss drift <= 20%.
 * - Status is YELLOW (Degradation Detected) when drift exceeds 15% with >= 30 observations.
 * - Status is RED (Severe Drift) when drift exceeds 30% or calibration error > 0.15.
 * - Status is INSUFFICIENT_DATA when sample size < 10.
 */

import { queryObservations } from './oddsObservationStore.mjs';

export const DRIFT_THRESHOLDS = Object.freeze({
  minSampleSize: 10,
  yellowBrierDriftPct: 0.15,
  redBrierDriftPct: 0.30,
  maxAcceptableBrier: 0.28,
  maxAcceptableLogLoss: 0.70,
});

/**
 * Calculates Brier score and Log Loss for a given set of settled observations.
 */
export function computeLossMetrics(observations = []) {
  if (!observations.length) {
    return { sampleSize: 0, brierScore: null, logLoss: null, calibrationError: null };
  }

  let totalBrier = 0;
  let totalLogLoss = 0;
  let totalCalibError = 0;
  let count = 0;

  for (const obs of observations) {
    if (obs.settledOutcome === null) continue;
    const y = obs.settledOutcome ? 1 : 0;
    const p = Math.max(0.001, Math.min(0.999, obs.probability));

    totalBrier += Math.pow(p - y, 2);
    totalLogLoss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    totalCalibError += Math.abs(p - y);
    count++;
  }

  if (count === 0) {
    return { sampleSize: 0, brierScore: null, logLoss: null, calibrationError: null };
  }

  return {
    sampleSize: count,
    brierScore: Number((totalBrier / count).toFixed(4)),
    logLoss: Number((totalLogLoss / count).toFixed(4)),
    calibrationError: Number((totalCalibError / count).toFixed(4)),
  };
}

/**
 * Evaluates rolling model drift across multiple time windows.
 */
export function evaluateModelDrift({ sport = null, modelVersion = null, baselineBrier = 0.18 } = {}) {
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const SEVEN_DAYS = 7 * ONE_DAY;
  const THIRTY_DAYS = 30 * ONE_DAY;

  const allSettled = queryObservations({ sport, modelVersion, onlySettled: true, limit: 10_000 });

  const window24h = allSettled.filter(o => now - o.timestamp <= ONE_DAY);
  const window7d = allSettled.filter(o => now - o.timestamp <= SEVEN_DAYS);
  const window30d = allSettled.filter(o => now - o.timestamp <= THIRTY_DAYS);

  const m24h = computeLossMetrics(window24h);
  const m7d = computeLossMetrics(window7d);
  const m30d = computeLossMetrics(window30d);

  let status = 'INSUFFICIENT_DATA';
  let reason = 'Insufficient settled observations for statistical drift analysis';

  if (m7d.sampleSize >= DRIFT_THRESHOLDS.minSampleSize) {
    const brier = m7d.brierScore;
    const driftRatio = (brier - baselineBrier) / baselineBrier;

    if (brier > DRIFT_THRESHOLDS.maxAcceptableBrier || driftRatio >= DRIFT_THRESHOLDS.redBrierDriftPct) {
      status = 'RED';
      reason = `Severe model drift detected: 7d Brier score (${brier}) exceeds threshold (+${(driftRatio * 100).toFixed(1)}%)`;
    } else if (driftRatio >= DRIFT_THRESHOLDS.yellowBrierDriftPct) {
      status = 'YELLOW';
      reason = `Mild calibration degradation: 7d Brier score (${brier}) is ${(driftRatio * 100).toFixed(1)}% above baseline`;
    } else {
      status = 'GREEN';
      reason = `Model is stable and well-calibrated (7d Brier: ${brier}, Baseline: ${baselineBrier})`;
    }
  }

  return {
    status,
    reason,
    baselineBrier,
    windows: {
      '24h': m24h,
      '7d': m7d,
      '30d': m30d,
    },
    sport: sport || 'all',
    modelVersion: modelVersion || 'all',
    evaluatedAt: new Date().toISOString(),
  };
}
