/**
 * OddsEngineV3 — Model Scorecard
 * 
 * Computes statistically rigorous scoring metrics (Brier, Log Loss, ECE, MCE)
 * and calibration curves segmented by sport, market, league, and model version.
 */

const EPSILON = 1e-6;

/**
 * Calculates Brier Score: mean squared difference between predicted prob and outcome (0 or 1).
 */
export function calculateBrierScore(predictions) {
  if (!predictions || !predictions.length) return null;
  let sum = 0;
  let validCount = 0;
  for (const item of predictions) {
    const p = Number(item.predictionProbability ?? item.probability ?? item.prob);
    const y = item.actualOutcome === true || item.actualOutcome === 1 ? 1 : 0;
    if (Number.isFinite(p)) {
      sum += Math.pow(p - y, 2);
      validCount++;
    }
  }
  return validCount > 0 ? Number((sum / validCount).toFixed(5)) : null;
}

/**
 * Calculates Binary Cross-Entropy / Log Loss with numerical stability clamping.
 */
export function calculateLogLoss(predictions) {
  if (!predictions || !predictions.length) return null;
  let sum = 0;
  let validCount = 0;
  for (const item of predictions) {
    let p = Number(item.predictionProbability ?? item.probability ?? item.prob);
    const y = item.actualOutcome === true || item.actualOutcome === 1 ? 1 : 0;
    if (Number.isFinite(p)) {
      p = Math.min(Math.max(p, EPSILON), 1 - EPSILON);
      sum += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
      validCount++;
    }
  }
  return validCount > 0 ? Number((sum / validCount).toFixed(5)) : null;
}

/**
 * Calculates Expected Calibration Error (ECE) and Maximum Calibration Error (MCE) across 10 equal bins.
 */
export function calculateCalibrationMetrics(predictions, numBins = 10) {
  if (!predictions || !predictions.length) {
    return { ece: null, mce: null, bins: [] };
  }

  const bins = Array.from({ length: numBins }, (_, i) => ({
    binIndex: i,
    lower: i / numBins,
    upper: (i + 1) / numBins,
    count: 0,
    probSum: 0,
    winCount: 0,
  }));

  for (const item of predictions) {
    const p = Number(item.predictionProbability ?? item.probability ?? item.prob);
    const y = item.actualOutcome === true || item.actualOutcome === 1 ? 1 : 0;
    if (!Number.isFinite(p)) continue;

    const clampedP = Math.min(Math.max(p, 0), 1);
    let binIdx = Math.floor(clampedP * numBins);
    if (binIdx >= numBins) binIdx = numBins - 1;

    bins[binIdx].count++;
    bins[binIdx].probSum += clampedP;
    bins[binIdx].winCount += y;
  }

  const N = predictions.length;
  let eceSum = 0;
  let mceMax = 0;

  const binResults = bins.map((b) => {
    if (b.count === 0) {
      return {
        range: `${b.lower.toFixed(1)}-${b.upper.toFixed(1)}`,
        count: 0,
        avgConfidence: Number(((b.lower + b.upper) / 2).toFixed(3)),
        empiricalAccuracy: 0,
        calibrationError: 0,
      };
    }
    const avgConfidence = b.probSum / b.count;
    const empiricalAccuracy = b.winCount / b.count;
    const calibrationError = Math.abs(empiricalAccuracy - avgConfidence);

    eceSum += (b.count / N) * calibrationError;
    if (calibrationError > mceMax) mceMax = calibrationError;

    return {
      range: `${b.lower.toFixed(1)}-${b.upper.toFixed(1)}`,
      count: b.count,
      avgConfidence: Number(avgConfidence.toFixed(4)),
      empiricalAccuracy: Number(empiricalAccuracy.toFixed(4)),
      calibrationError: Number(calibrationError.toFixed(4)),
    };
  });

  return {
    ece: Number(eceSum.toFixed(5)),
    mce: Number(mceMax.toFixed(5)),
    bins: binResults,
  };
}

/**
 * Builds a complete model scorecard from a dataset.
 */
export function buildModelScorecard(dataset, metadata = {}) {
  const settled = (dataset || []).filter((d) => d.actualOutcome !== null && d.actualOutcome !== undefined);
  const sampleCount = settled.length;

  if (sampleCount === 0) {
    return {
      status: 'INSUFFICIENT_DATA',
      sampleCount: 0,
      brierScore: null,
      logLoss: null,
      ece: null,
      mce: null,
      calibrationCurve: [],
      modelVersion: metadata.modelVersion || 'v3.1',
      dateRange: metadata.dateRange || null,
      segments: {},
    };
  }

  const brierScore = calculateBrierScore(settled);
  const logLoss = calculateLogLoss(settled);
  const { ece, mce, bins } = calculateCalibrationMetrics(settled);

  // Segment by Sport and Market
  const bySport = {};
  const byMarket = {};

  for (const item of settled) {
    const s = item.sport || 'other';
    const m = item.market || 'unknown';
    if (!bySport[s]) bySport[s] = [];
    if (!byMarket[m]) byMarket[m] = [];
    bySport[s].push(item);
    byMarket[m].push(item);
  }

  const segmentMetrics = (map) => {
    const res = {};
    for (const [key, items] of Object.entries(map)) {
      const brier = calculateBrierScore(items);
      const ll = calculateLogLoss(items);
      const cal = calculateCalibrationMetrics(items);
      res[key] = {
        sampleCount: items.length,
        brierScore: brier,
        logLoss: ll,
        ece: cal.ece,
        mce: cal.mce,
      };
    }
    return res;
  };

  return {
    status: sampleCount >= 1000 ? 'STATISTICALLY_SIGNIFICANT' : (sampleCount >= 100 ? 'OBSERVATIONAL' : 'PRELIMINARY'),
    sampleCount,
    brierScore,
    logLoss,
    ece,
    mce,
    calibrationCurve: bins,
    modelVersion: metadata.modelVersion || 'v3.1',
    dateRange: metadata.dateRange || null,
    segments: {
      bySport: segmentMetrics(bySport),
      byMarket: segmentMetrics(byMarket),
    },
    generatedAt: new Date().toISOString(),
  };
}
