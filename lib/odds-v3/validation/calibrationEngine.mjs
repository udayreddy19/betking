/**
 * OddsEngineV3 — Probability Calibration Analysis Engine
 * 
 * Partitions predictions into 10 standard reliability bins to determine whether
 * modeled probabilities match empirical outcome frequencies.
 * 
 * PURELY DIAGNOSTIC: Never modifies production model weights or curves automatically.
 */

export const CALIBRATION_CLASSIFICATIONS = Object.freeze({
  WELL_CALIBRATED: 'WELL_CALIBRATED',
  OVERCONFIDENT: 'OVERCONFIDENT',
  UNDERCONFIDENT: 'UNDERCONFIDENT',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
});

/**
 * Computes 10-bin calibration reliability statistics.
 */
export function analyzeCalibration({
  settledObservations = [],
  minBucketSample = 20,
} = {}) {
  // Initialize 10 bins
  const bins = [];
  for (let i = 0; i < 10; i++) {
    const min = Number((i * 0.1).toFixed(1));
    const max = Number(((i + 1) * 0.1).toFixed(1));
    bins.push({
      range: `[${min.toFixed(1)}-${max.toFixed(1)}]`,
      binIndex: i,
      minProb: min,
      maxProb: max,
      predictionsCount: 0,
      actualWins: 0,
      sumProb: 0,
      predictedProbabilityAverage: null,
      observedWinRate: null,
      calibrationDelta: null,
      status: CALIBRATION_CLASSIFICATIONS.INSUFFICIENT_DATA,
    });
  }

  const settled = settledObservations.filter((o) => o.settlement && o.settlement.outcome != null);

  for (const obs of settled) {
    const p = Math.min(Math.max(obs.probability, 0.0), 0.999);
    const binIdx = Math.min(9, Math.floor(p * 10));
    const bin = bins[binIdx];

    bin.predictionsCount++;
    bin.actualWins += obs.settlement.outcome === 1 ? 1 : 0;
    bin.sumProb += p;
  }

  let totalSettled = settled.length;
  let weightedEce = 0;

  for (const bin of bins) {
    if (bin.predictionsCount > 0) {
      bin.predictedProbabilityAverage = Number((bin.sumProb / bin.predictionsCount).toFixed(4));
      bin.observedWinRate = Number((bin.actualWins / bin.predictionsCount).toFixed(4));
      bin.calibrationDelta = Number((bin.predictedProbabilityAverage - bin.observedWinRate).toFixed(4));

      if (bin.predictionsCount >= minBucketSample) {
        if (Math.abs(bin.calibrationDelta) <= 0.05) {
          bin.status = CALIBRATION_CLASSIFICATIONS.WELL_CALIBRATED;
        } else if (bin.calibrationDelta > 0.05) {
          bin.status = CALIBRATION_CLASSIFICATIONS.OVERCONFIDENT;
        } else {
          bin.status = CALIBRATION_CLASSIFICATIONS.UNDERCONFIDENT;
        }
      } else {
        bin.status = CALIBRATION_CLASSIFICATIONS.INSUFFICIENT_DATA;
      }

      if (totalSettled > 0) {
        weightedEce += (bin.predictionsCount / totalSettled) * Math.abs(bin.calibrationDelta);
      }
    }
  }

  return {
    totalSettledObservations: totalSettled,
    expectedCalibrationError: totalSettled > 0 ? Number(weightedEce.toFixed(4)) : null,
    bins,
    overallCalibrationStatus: totalSettled >= 1000 ? 'VALIDATED' : 'INSUFFICIENT_DATA',
    evaluatedAt: new Date().toISOString(),
  };
}
