/**
 * OddsEngineV3 — Prediction Performance Engine
 * 
 * Calculates global and multi-dimensional segmented empirical accuracy metrics
 * (Brier Score, LogLoss, Accuracy, ECE, MCE) across sports, markets, and regimes.
 */

/**
 * Calculates global and segmented performance metrics from an array of observations.
 */
export function calculatePredictionPerformance({
  observations = [],
  minSampleGate = 1000,
} = {}) {
  const totalCount = observations.length;
  const settled = observations.filter((o) => o.settlement && o.settlement.outcome != null);
  const settledCount = settled.length;
  const unresolvedCount = totalCount - settledCount;

  if (settledCount === 0) {
    return {
      status: 'INSUFFICIENT_DATA',
      validationClass: 'NOT_VERIFIED',
      globalMetrics: {
        observationCount: totalCount,
        settledCount: 0,
        unresolvedCount: totalCount,
        brierScore: null,
        logLoss: null,
        accuracy: null,
        calibrationError: null,
        maximumCalibrationError: null,
      },
      segments: {
        bySport: {},
        byMarket: {},
        byLifecycle: {},
        byModelVersion: {},
      },
      sampleGatePassed: false,
      evaluatedAt: new Date().toISOString(),
    };
  }

  // Global calculations
  let sumBrier = 0;
  let sumLogLoss = 0;
  let correctCount = 0;
  const bucketCounts = {};
  const bucketOutcomeSums = {};
  const bucketPredSums = {};

  for (const obs of settled) {
    const y = obs.settlement.outcome;
    const p = Math.min(Math.max(obs.probability, 0.001), 0.999);
    const brier = Math.pow(p - y, 2);
    const logloss = -(y * Math.log(p) + (1 - y) * Math.log(1 - p));

    sumBrier += brier;
    sumLogLoss += logloss;
    if ((p >= 0.5 && y === 1) || (p < 0.5 && y === 0)) {
      correctCount++;
    }

    const b = obs.settlement.calibrationBucket || `[${(Math.floor(p * 10) / 10).toFixed(1)}-${((Math.floor(p * 10) + 1) / 10).toFixed(1)}]`;
    bucketCounts[b] = (bucketCounts[b] || 0) + 1;
    bucketOutcomeSums[b] = (bucketOutcomeSums[b] || 0) + y;
    bucketPredSums[b] = (bucketPredSums[b] || 0) + p;
  }

  const brierScore = Number((sumBrier / settledCount).toFixed(4));
  const logLoss = Number((sumLogLoss / settledCount).toFixed(4));
  const accuracy = Number(((correctCount / settledCount) * 100).toFixed(2));

  // Compute ECE & MCE
  let ece = 0;
  let mce = 0;
  for (const [bucket, count] of Object.entries(bucketCounts)) {
    const meanPred = bucketPredSums[bucket] / count;
    const meanOutcome = bucketOutcomeSums[bucket] / count;
    const delta = Math.abs(meanPred - meanOutcome);
    ece += (count / settledCount) * delta;
    if (delta > mce) mce = delta;
  }
  ece = Number(ece.toFixed(4));
  mce = Number(mce.toFixed(4));

  // Segmented metrics helper
  function computeSegmentMetrics(keyExtractor) {
    const groups = {};
    for (const obs of settled) {
      const key = keyExtractor(obs) || 'unknown';
      if (!groups[key]) groups[key] = { count: 0, sumBrier: 0, sumLogLoss: 0, correct: 0 };
      const y = obs.settlement.outcome;
      const p = Math.min(Math.max(obs.probability, 0.001), 0.999);
      groups[key].count++;
      groups[key].sumBrier += Math.pow(p - y, 2);
      groups[key].sumLogLoss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
      if ((p >= 0.5 && y === 1) || (p < 0.5 && y === 0)) groups[key].correct++;
    }

    const res = {};
    for (const [k, v] of Object.entries(groups)) {
      res[k] = {
        settledCount: v.count,
        brierScore: Number((v.sumBrier / v.count).toFixed(4)),
        logLoss: Number((v.sumLogLoss / v.count).toFixed(4)),
        accuracy: Number(((v.correct / v.count) * 100).toFixed(2)),
      };
    }
    return res;
  }

  const sampleGatePassed = settledCount >= minSampleGate;

  return {
    status: sampleGatePassed ? 'STATISTICALLY_SUFFICIENT' : 'INSUFFICIENT_DATA',
    validationClass: sampleGatePassed ? 'PRODUCTION_VALIDATED' : 'NOT_VERIFIED',
    globalMetrics: {
      observationCount: totalCount,
      settledCount,
      unresolvedCount,
      brierScore,
      logLoss,
      accuracy,
      calibrationError: ece,
      maximumCalibrationError: mce,
    },
    segments: {
      bySport: computeSegmentMetrics((o) => o.sport),
      byMarket: computeSegmentMetrics((o) => o.marketType || o.market),
      byLifecycle: computeSegmentMetrics((o) => o.lifecycleState || (o.isLive ? 'LIVE' : 'PRE_MATCH')),
      byModelVersion: computeSegmentMetrics((o) => o.modelVersion),
    },
    sampleGatePassed,
    evaluatedAt: new Date().toISOString(),
  };
}
