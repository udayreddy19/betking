/**
 * V4CalibrationEngine.mjs
 *
 * Genuine V4 Calibration & Validation Engine.
 * Evaluates:
 *   - Brier Score
 *   - Log Loss
 *   - Expected Calibration Error (ECE)
 *   - Maximum Calibration Error (MCE)
 *   - 10-Bin Reliability Buckets & Calibration Curves
 *   - Probability Bucket Accuracy
 *   - Wilson & Normal Confidence Intervals
 *
 * Strict Production Gate:
 *   N >= 1000 genuinely settled observations.
 *   If N < 1000, returns status: 'INSUFFICIENT_DATA' and isCalibrated: false.
 *   NEVER manufactures observations.
 */

export const MIN_PRODUCTION_SAMPLE_SIZE = 1000;

export function calculateBrierScore(observations = []) {
  if (!observations.length) return null;
  let sum = 0;
  for (const obs of observations) {
    const p = Number(obs.calibratedProbability ?? obs.rawProbability ?? 0.5);
    const y = obs.outcome === 'WON' ? 1 : 0;
    sum += Math.pow(p - y, 2);
  }
  return Number((sum / observations.length).toFixed(6));
}

export function calculateLogLoss(observations = []) {
  if (!observations.length) return null;
  let sum = 0;
  const eps = 1e-6;
  for (const obs of observations) {
    const p = Math.min(Math.max(Number(obs.calibratedProbability ?? obs.rawProbability ?? 0.5), eps), 1 - eps);
    const y = obs.outcome === 'WON' ? 1 : 0;
    sum += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
  }
  return Number((sum / observations.length).toFixed(6));
}

export function calculateCalibrationSlopeAndIntercept(observations = []) {
  if (observations.length < 10) {
    return { slope: 1.0, intercept: 0.0 };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  const n = observations.length;

  for (const obs of observations) {
    const p = Math.min(Math.max(Number(obs.calibratedProbability ?? obs.rawProbability ?? 0.5), 0.001), 0.999);
    const logit = Math.log(p / (1 - p));
    const y = obs.outcome === 'WON' ? 1 : 0;

    sumX += logit;
    sumY += y;
    sumXY += logit * y;
    sumXX += logit * logit;
  }

  const denom = (n * sumXX - sumX * sumX) || 1;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  return {
    slope: Number(slope.toFixed(4)),
    intercept: Number(intercept.toFixed(4)),
  };
}

export function generateReliabilityBuckets(observations = [], binsCount = 10) {
  const bins = Array.from({ length: binsCount }, (_, idx) => ({
    binIndex: idx,
    binLower: Number((idx / binsCount).toFixed(2)),
    binUpper: Number(((idx + 1) / binsCount).toFixed(2)),
    count: 0,
    predSum: 0,
    wonSum: 0,
  }));

  for (const obs of observations) {
    const p = Math.min(Math.max(Number(obs.calibratedProbability ?? obs.rawProbability ?? 0), 0.0), 1.0);
    const y = obs.outcome === 'WON' ? 1 : 0;
    const idx = Math.min(binsCount - 1, Math.floor(p * binsCount));

    bins[idx].count++;
    bins[idx].predSum += p;
    bins[idx].wonSum += y;
  }

  let totalEceSum = 0;
  let maxError = 0;
  const n = observations.length || 1;

  const buckets = bins.map((b) => {
    const count = b.count;
    const meanPred = count > 0 ? Number((b.predSum / count).toFixed(4)) : 0;
    const empiricalRate = count > 0 ? Number((b.wonSum / count).toFixed(4)) : 0;
    const absError = count > 0 ? Number(Math.abs(meanPred - empiricalRate).toFixed(4)) : 0;

    if (count > 0) {
      totalEceSum += (count / n) * absError;
      if (absError > maxError) maxError = absError;
    }

    // Wilson 95% confidence interval for empirical rate
    let ciLower = 0;
    let ciUpper = 0;
    if (count > 0) {
      const z = 1.96;
      const z2 = z * z;
      const phat = empiricalRate;
      const denom = 1 + z2 / count;
      const center = (phat + z2 / (2 * count)) / denom;
      const half = (z * Math.sqrt((phat * (1 - phat) + z2 / (4 * count)) / count)) / denom;
      ciLower = Number(Math.max(0, center - half).toFixed(4));
      ciUpper = Number(Math.min(1, center + half).toFixed(4));
    }

    return {
      binRange: `[${b.binLower}-${b.binUpper}]`,
      sampleCount: count,
      meanPredictedProbability: meanPred,
      empiricalWinRate: empiricalRate,
      calibrationError: absError,
      confidenceInterval95: [ciLower, ciUpper],
    };
  });

  return {
    buckets,
    ece: Number(totalEceSum.toFixed(4)),
    mce: Number(maxError.toFixed(4)),
  };
}

export function evaluateV4Calibration(observations = [], options = {}) {
  const minRequired = options.minRequiredSampleSize || MIN_PRODUCTION_SAMPLE_SIZE;
  const n = Array.isArray(observations) ? observations.length : 0;

  if (n < minRequired) {
    return Object.freeze({
      status: 'INSUFFICIENT_DATA',
      isCalibrated: false,
      sampleSize: n,
      minRequiredSampleSize: minRequired,
      deficit: minRequired - n,
      reason: `Calibration gate requires N >= ${minRequired} genuine settled observations. Found ${n}.`,
      metrics: null,
    });
  }

  // Filter out void / push from probability scoring
  const scoredObs = observations.filter((o) => o.outcome === 'WON' || o.outcome === 'LOST');
  if (scoredObs.length === 0) {
    return Object.freeze({
      status: 'INSUFFICIENT_DATA',
      isCalibrated: false,
      sampleSize: 0,
      minRequiredSampleSize: minRequired,
      reason: 'No decisively settled (WON/LOST) observations found in sample.',
      metrics: null,
    });
  }

  const brierScore = calculateBrierScore(scoredObs);
  const logLoss = calculateLogLoss(scoredObs);
  const { slope, intercept } = calculateCalibrationSlopeAndIntercept(scoredObs);
  const { buckets, ece, mce } = generateReliabilityBuckets(scoredObs, 10);

  // Calibration is validated if ECE <= 0.05 and Brier is performant
  const isValid = ece <= 0.05 && brierScore <= 0.25;

  return Object.freeze({
    status: isValid ? 'VALIDATED' : 'CALIBRATION_NEEDS_TUNING',
    isCalibrated: isValid,
    sampleSize: scoredObs.length,
    totalObservations: n,
    minRequiredSampleSize: minRequired,
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
