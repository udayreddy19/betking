/**
 * OddsEngineV3 — Calibration & Model Evaluation Engine
 * 
 * Computes prediction performance metrics:
 * - Brier Score: BS = mean((forecast - outcome)^2) [0.0 = perfect, 0.25 = random 50/50]
 * - Log-Loss: LL = -mean(y * ln(p) + (1-y) * ln(1-p)) [protected p in [0.0001, 0.9999]]
 * - 10-Bucket Reliability / Calibration Curves
 * - Model Drift & Telemetry
 */

const calibrationStore = [];
const MAX_CALIBRATION_RECORDS = 5000;

/**
 * Records a model prediction snapshot before an outcome is determined
 */
export function recordPrediction({
  eventId,
  sport,
  marketId,
  selectionId,
  predictedProbability,
  odds,
  modelVersion,
  timestamp = new Date().toISOString(),
}) {
  const p = Math.max(0.0001, Math.min(0.9999, Number(predictedProbability) || 0.5));
  const record = {
    id: `${eventId}:${marketId}:${selectionId}`,
    eventId,
    sport: String(sport || 'cricket').toLowerCase(),
    marketId,
    selectionId,
    predictedProbability: p,
    odds: Number(odds) || 1.9,
    modelVersion: modelVersion || 'v3_standard',
    timestamp,
    settled: false,
    outcome: null, // 1 for won, 0 for lost
  };

  calibrationStore.push(record);
  if (calibrationStore.length > MAX_CALIBRATION_RECORDS) {
    calibrationStore.shift();
  }

  return record;
}

/**
 * Updates a prediction record with its final settled outcome
 */
export function recordSettledOutcome({ eventId, marketId, selectionId, won }) {
  const targetId = `${eventId}:${marketId}:${selectionId}`;
  for (const rec of calibrationStore) {
    if (rec.id === targetId || (rec.eventId === eventId && rec.selectionId === selectionId)) {
      rec.settled = true;
      rec.outcome = won ? 1 : 0;
    }
  }
}

/**
 * Calculates Brier Score and Log-Loss calibration statistics
 */
export function calculateCalibrationMetrics(filter = {}) {
  const filtered = calibrationStore.filter((r) => {
    if (!r.settled || r.outcome == null) return false;
    if (filter.sport && r.sport !== filter.sport.toLowerCase()) return false;
    if (filter.modelVersion && r.modelVersion !== filter.modelVersion) return false;
    return true;
  });

  if (filtered.length < 5) {
    return {
      sampleSize: filtered.length,
      status: 'INSUFFICIENT_OBSERVATIONS',
      brierScore: null,
      logLoss: null,
      calibrationBuckets: [],
    };
  }

  let totalBrier = 0;
  let totalLogLoss = 0;
  const buckets = Array.from({ length: 10 }, (_, idx) => ({
    bucketMin: Number((idx * 0.1).toFixed(1)),
    bucketMax: Number(((idx + 1) * 0.1).toFixed(1)),
    count: 0,
    sumForecast: 0,
    sumOutcome: 0,
  }));

  for (const item of filtered) {
    const p = item.predictedProbability;
    const y = item.outcome;

    // Brier component
    totalBrier += Math.pow(p - y, 2);

    // Log-loss component with safe clamp
    const safeP = Math.max(0.0001, Math.min(0.9999, p));
    totalLogLoss += -(y * Math.log(safeP) + (1 - y) * Math.log(1 - safeP));

    // Bucket assignment
    const bIdx = Math.min(9, Math.floor(p * 10));
    buckets[bIdx].count += 1;
    buckets[bIdx].sumForecast += p;
    buckets[bIdx].sumOutcome += y;
  }

  const n = filtered.length;
  const brierScore = Number((totalBrier / n).toFixed(4));
  const logLoss = Number((totalLogLoss / n).toFixed(4));

  const formattedBuckets = buckets.map((b) => ({
    range: `${Math.round(b.bucketMin * 100)}%-${Math.round(b.bucketMax * 100)}%`,
    sampleCount: b.count,
    avgForecast: b.count > 0 ? Number((b.sumForecast / b.count).toFixed(3)) : 0,
    actualWinRate: b.count > 0 ? Number((b.sumOutcome / b.count).toFixed(3)) : 0,
    drift: b.count > 0 ? Number((b.sumOutcome / b.count - b.sumForecast / b.count).toFixed(3)) : 0,
  }));

  return {
    sampleSize: n,
    status: brierScore < 0.20 ? 'WELL_CALIBRATED' : (brierScore < 0.25 ? 'MODERATE' : 'MISCALIBRATED'),
    brierScore,
    logLoss,
    calibrationBuckets: formattedBuckets,
  };
}
