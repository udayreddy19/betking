/**
 * OddsEngineV3 — Composite Model Health Rating Engine
 * 
 * Aggregates accuracy, calibration, stability, and provider telemetry into an
 * overarching 0-100 operational health score.
 */

export const MODEL_HEALTH_STATUS = Object.freeze({
  HEALTHY: 'HEALTHY',
  WATCH: 'WATCH',
  DEGRADED: 'DEGRADED',
  CRITICAL: 'CRITICAL',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
});

/**
 * Calculates composite model health score and status.
 */
export function calculateModelHealthScore({
  settledSampleCount = 0,
  brierScore = 0.185,
  expectedCalibrationError = 0.038,
  stabilityStatus = 'STABLE',
  providerHealthScore = 95.0,
  driftStatus = 'GREEN',
} = {}) {
  if (settledSampleCount === 0) {
    return {
      score: 100.0,
      status: MODEL_HEALTH_STATUS.INSUFFICIENT_DATA,
      sampleStatus: 'INSUFFICIENT_DATA',
      settledSampleCount: 0,
      components: {
        accuracyScore: null,
        calibrationScore: null,
        stabilityScore: 100,
        providerScore: providerHealthScore,
      },
      reason: 'No settled production records yet. Architecture nominal.',
      evaluatedAt: new Date().toISOString(),
    };
  }

  // Component scoring:
  // Accuracy Score (0-100): Lower Brier is better (0.15 = 100, 0.30 = 0)
  const accuracyScore = Math.max(0, Math.min(100, (0.30 - brierScore) / 0.15 * 100));

  // Calibration Score (0-100): Lower ECE is better (0.01 = 100, 0.10 = 0)
  const calibrationScore = Math.max(0, Math.min(100, (0.10 - expectedCalibrationError) / 0.09 * 100));

  // Stability Score
  const stabilityScore = stabilityStatus === 'STABLE' ? 100 : stabilityStatus === 'WATCH' ? 75 : 40;

  // Composite Score
  const compositeScore = Number((
    accuracyScore * 0.35 +
    calibrationScore * 0.25 +
    stabilityScore * 0.20 +
    providerHealthScore * 0.20
  ).toFixed(1));

  let status = MODEL_HEALTH_STATUS.HEALTHY;
  if (compositeScore < 50 || driftStatus === 'RED') {
    status = MODEL_HEALTH_STATUS.CRITICAL;
  } else if (compositeScore < 70 || driftStatus === 'YELLOW') {
    status = MODEL_HEALTH_STATUS.DEGRADED;
  } else if (compositeScore < 85) {
    status = MODEL_HEALTH_STATUS.WATCH;
  }

  return {
    score: compositeScore,
    status,
    sampleStatus: settledSampleCount >= 1000 ? 'SUFFICIENT_DATA' : 'INSUFFICIENT_DATA',
    settledSampleCount,
    components: {
      accuracyScore: Number(accuracyScore.toFixed(1)),
      calibrationScore: Number(calibrationScore.toFixed(1)),
      stabilityScore,
      providerScore: providerHealthScore,
    },
    evaluatedAt: new Date().toISOString(),
  };
}
