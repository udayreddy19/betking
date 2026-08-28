/**
 * OddsEngineV3 — Longitudinal Model & Concept Drift Engine
 * 
 * Monitors accuracy degradation, concept drift, and provider divergence over rolling time horizons
 * (24h, 7d, 30d, 90d) and generates ops alerts when statistical thresholds are breached.
 */

export const DRIFT_TYPES = Object.freeze({
  DATA_DRIFT: 'DATA_DRIFT',
  CONCEPT_DRIFT: 'CONCEPT_DRIFT',
  PROVIDER_DRIFT: 'PROVIDER_DRIFT',
  MARKET_DRIFT: 'MARKET_DRIFT',
  CALIBRATION_DRIFT: 'CALIBRATION_DRIFT',
});

const DEFAULT_THRESHOLDS = {
  brierDegradationPct: 15.0,
  eceDegradationPct: 20.0,
  providerDivergenceSpread: 0.15,
};

/**
 * Compares baseline metrics against a rolling evaluation window to detect drift.
 */
export function evaluateModelDrift({
  baselineMetrics = { brierScore: 0.185, ece: 0.038 },
  currentMetrics = { brierScore: 0.185, ece: 0.038 },
  providerMetrics = { averageSpread: 0.02 },
  thresholds = DEFAULT_THRESHOLDS,
  windowLabel = '24h',
} = {}) {
  const cfg = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const alerts = [];

  const brierBase = baselineMetrics.brierScore || 0.185;
  const brierCurr = currentMetrics.brierScore || brierBase;
  const brierDeltaPct = Number((((brierCurr - brierBase) / brierBase) * 100).toFixed(2));

  const eceBase = baselineMetrics.ece || 0.038;
  const eceCurr = currentMetrics.ece || eceBase;
  const eceDeltaPct = Number((((eceCurr - eceBase) / eceBase) * 100).toFixed(2));

  // Check 1: Concept / Model Accuracy Drift
  if (brierDeltaPct > cfg.brierDegradationPct) {
    alerts.push({
      type: DRIFT_TYPES.CONCEPT_DRIFT,
      severity: 'HIGH',
      details: `Brier score degraded by ${brierDeltaPct}% (current ${brierCurr} vs baseline ${brierBase}) in ${windowLabel}`,
    });
  }

  // Check 2: Calibration Drift
  if (eceDeltaPct > cfg.eceDegradationPct) {
    alerts.push({
      type: DRIFT_TYPES.CALIBRATION_DRIFT,
      severity: 'MEDIUM',
      details: `Expected Calibration Error increased by ${eceDeltaPct}% in ${windowLabel}`,
    });
  }

  // Check 3: Provider Drift
  if ((providerMetrics.averageSpread || 0) > cfg.providerDivergenceSpread) {
    alerts.push({
      type: DRIFT_TYPES.PROVIDER_DRIFT,
      severity: 'HIGH',
      details: `Provider divergence average spread reached ${(providerMetrics.averageSpread * 100).toFixed(1)}%`,
    });
  }

  return {
    window: windowLabel,
    hasDrift: alerts.length > 0,
    alertsCount: alerts.length,
    alerts,
    metrics: {
      brierDeltaPct,
      eceDeltaPct,
      currentBrier: brierCurr,
      currentEce: eceCurr,
    },
    status: alerts.length === 0 ? 'GREEN' : (alerts.some((a) => a.severity === 'HIGH') ? 'ALERT' : 'WATCH'),
    evaluatedAt: new Date().toISOString(),
  };
}
