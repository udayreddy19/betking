/**
 * OSV4CalibrationEngine.mjs
 *
 * Genuine Calibration & Validation Engine for OtherSportsEngineV4.
 * Evaluates multi-sport datasets (soccer, basketball, tennis, baseball, hockey, american football).
 *
 * Supports:
 *   - Overall & Per-Sport Brier Score
 *   - Log Loss
 *   - Expected Calibration Error (ECE)
 *   - Reliability Buckets
 *   - Production Gate: N >= 1000 genuine settled observations.
 *   - Returns INSUFFICIENT_DATA if N < 1000.
 */

import {
  calculateBrierScore,
  calculateLogLoss,
  calculateCalibrationSlopeAndIntercept,
  generateReliabilityBuckets,
  MIN_PRODUCTION_SAMPLE_SIZE,
} from '../../odds-v4/calibration/V4CalibrationEngine.mjs';

export function evaluateOSV4Calibration(observations = [], options = {}) {
  const minRequired = options.minRequiredSampleSize || MIN_PRODUCTION_SAMPLE_SIZE;
  const n = Array.isArray(observations) ? observations.length : 0;

  if (n < minRequired) {
    return Object.freeze({
      status: 'INSUFFICIENT_DATA',
      isCalibrated: false,
      engine: 'OtherSportsEngineV4',
      sampleSize: n,
      minRequiredSampleSize: minRequired,
      deficit: minRequired - n,
      reason: `OSV4 calibration gate requires N >= ${minRequired} genuine settled observations. Found ${n}.`,
      sportsCovered: [],
      metrics: null,
    });
  }

  const scoredObs = observations.filter((o) => o.outcome === 'WON' || o.outcome === 'LOST');
  if (scoredObs.length === 0) {
    return Object.freeze({
      status: 'INSUFFICIENT_DATA',
      isCalibrated: false,
      sampleSize: 0,
      minRequiredSampleSize: minRequired,
      reason: 'No decisively settled (WON/LOST) observations found.',
      metrics: null,
    });
  }

  // Segment by sport
  const sportsMap = new Map();
  for (const o of scoredObs) {
    const s = o.sport || 'unknown';
    if (!sportsMap.has(s)) sportsMap.set(s, []);
    sportsMap.get(s).push(o);
  }

  const perSportMetrics = {};
  for (const [sport, sObs] of sportsMap.entries()) {
    perSportMetrics[sport] = {
      sampleSize: sObs.length,
      brierScore: calculateBrierScore(sObs),
      logLoss: calculateLogLoss(sObs),
      ece: generateReliabilityBuckets(sObs, 10).ece,
    };
  }

  const brierScore = calculateBrierScore(scoredObs);
  const logLoss = calculateLogLoss(scoredObs);
  const { slope, intercept } = calculateCalibrationSlopeAndIntercept(scoredObs);
  const { buckets, ece, mce } = generateReliabilityBuckets(scoredObs, 10);

  const isValid = ece <= 0.05 && brierScore <= 0.25;

  return Object.freeze({
    status: isValid ? 'VALIDATED' : 'CALIBRATION_NEEDS_TUNING',
    isCalibrated: isValid,
    engine: 'OtherSportsEngineV4',
    sampleSize: scoredObs.length,
    totalObservations: n,
    minRequiredSampleSize: minRequired,
    perSportMetrics: Object.freeze(perSportMetrics),
    metrics: Object.freeze({
      brierScore,
      logLoss,
      expectedCalibrationError: ece,
      maximumCalibrationError: mce,
      calibrationSlope: slope,
      calibrationIntercept: intercept,
      reliabilityBuckets: buckets,
    }),
  });
}
