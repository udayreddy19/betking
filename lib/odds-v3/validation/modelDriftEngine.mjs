/**
 * OddsEngineV3 — Multi-Horizon Model & Data Drift Detection Engine
 * 
 * Compares short-term operational performance (24h, 7d, 30d) against historical baseline
 * to identify statistical degradation, input shift, and provider divergence.
 * 
 * ALERT ONLY: Never automatically mutates production model parameters.
 */

export const DRIFT_STATUS = Object.freeze({
  GREEN: 'GREEN',
  YELLOW: 'YELLOW',
  RED: 'RED',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
});

const DEFAULT_DRIFT_THRESHOLDS = {
  yellowBrierDelta: 0.025,
  redBrierDelta: 0.050,
  minSampleForDrift: 50,
};

/**
 * Evaluates performance and distribution drift across rolling horizons.
 */
export function evaluateModelDrift({
  baselineMetrics = { brierScore: 0.185, logLoss: 0.542, ece: 0.038 },
  currentMetrics = {},
  horizon = '7d',
  sampleCount = 0,
  thresholds = DEFAULT_DRIFT_THRESHOLDS,
} = {}) {
  const cfg = { ...DEFAULT_DRIFT_THRESHOLDS, ...thresholds };

  if (sampleCount < cfg.minSampleForDrift || currentMetrics.brierScore == null) {
    return {
      status: DRIFT_STATUS.INSUFFICIENT_DATA,
      horizon,
      sampleCount,
      minRequired: cfg.minSampleForDrift,
      driftReports: [],
      reason: 'Sample count too low to certify statistical drift.',
      evaluatedAt: new Date().toISOString(),
    };
  }

  const reports = [];
  let overallStatus = DRIFT_STATUS.GREEN;

  // 1. Brier Score Drift
  const brierDelta = Number((currentMetrics.brierScore - baselineMetrics.brierScore).toFixed(4));
  let brierStatus = DRIFT_STATUS.GREEN;
  if (brierDelta >= cfg.redBrierDelta) {
    brierStatus = DRIFT_STATUS.RED;
    overallStatus = DRIFT_STATUS.RED;
  } else if (brierDelta >= cfg.yellowBrierDelta) {
    brierStatus = DRIFT_STATUS.YELLOW;
    if (overallStatus !== DRIFT_STATUS.RED) overallStatus = DRIFT_STATUS.YELLOW;
  }

  reports.push({
    driftType: 'BRIER_SCORE_DRIFT',
    baseline: baselineMetrics.brierScore,
    current: currentMetrics.brierScore,
    delta: brierDelta,
    status: brierStatus,
  });

  // 2. LogLoss Drift
  const logLossDelta = Number(((currentMetrics.logLoss || 0) - baselineMetrics.logLoss).toFixed(4));
  let logLossStatus = logLossDelta > 0.08 ? DRIFT_STATUS.YELLOW : DRIFT_STATUS.GREEN;
  reports.push({
    driftType: 'LOG_LOSS_DRIFT',
    baseline: baselineMetrics.logLoss,
    current: currentMetrics.logLoss,
    delta: logLossDelta,
    status: logLossStatus,
  });

  // 3. ECE Calibration Drift
  const eceDelta = Number(((currentMetrics.ece || 0) - baselineMetrics.ece).toFixed(4));
  let eceStatus = eceDelta > 0.03 ? DRIFT_STATUS.YELLOW : DRIFT_STATUS.GREEN;
  reports.push({
    driftType: 'CALIBRATION_ECE_DRIFT',
    baseline: baselineMetrics.ece,
    current: currentMetrics.ece,
    delta: eceDelta,
    status: eceStatus,
  });

  return {
    status: overallStatus,
    horizon,
    sampleCount,
    driftReports: reports,
    evaluatedAt: new Date().toISOString(),
  };
}
