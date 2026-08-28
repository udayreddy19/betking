/**
 * OddsEngineV3 — Canary Safety & Automatic Rollback Engine
 * 
 * Manages canary traffic split (e.g. 5% shadow candidate), monitors runtime degradation,
 * and automatically trips the emergency rollback breaker to protect production pricing.
 * 
 * INVARIANT:
 * Automatic rollback only disables candidate shadow routing.
 * It NEVER modifies wallet, ledger, bet placement, or settlement records.
 */

import { updateModelStatus, MODEL_STATUSES } from '../registry/modelRegistry.mjs';

const canaryState = {
  enabled: process.env.ODDS_ENGINE_CANARY_ENABLED === 'true' || false,
  canaryPercent: 5,
  activeCandidateVersion: null,
  baselineVersion: 'v3.1-prod',
  lastRollback: null,
  auditLog: [],
};

const SAFETY_THRESHOLDS = Object.freeze({
  maxBrierDegradationPct: 15.0, // 15% increase in Brier score trips rollback
  maxLogLossDegradationPct: 20.0,
  maxEceDegradationPct: 25.0,
  maxCandidateLatencyMs: 450,
  maxSuspensionRatePct: 10.0,
});

export function getCanaryStatus() {
  return { ...canaryState, safetyThresholds: SAFETY_THRESHOLDS };
}

/**
 * Configure canary candidate traffic with operator audit logging.
 */
export function configureCanary({
  enabled = false,
  canaryPercent = 5,
  candidateVersion = null,
  operator = 'ADMIN',
  reason = '',
} = {}) {
  const previous = { ...canaryState };
  canaryState.enabled = Boolean(enabled);
  canaryState.canaryPercent = Math.min(Math.max(Number(canaryPercent) || 5, 1), 20); // capped at 20% max
  canaryState.activeCandidateVersion = candidateVersion ? String(candidateVersion) : null;

  const logEntry = {
    timestamp: new Date().toISOString(),
    operator: String(operator),
    action: enabled ? 'ENABLE_CANARY' : 'DISABLE_CANARY',
    candidateVersion: canaryState.activeCandidateVersion,
    canaryPercent: canaryState.canaryPercent,
    reason: String(reason || 'Canary configuration update'),
  };

  canaryState.auditLog.push(logEntry);
  return getCanaryStatus();
}

/**
 * Evaluates candidate telemetry against safety thresholds.
 * Automatically disables candidate if degradation is detected.
 */
export function evaluateCanarySafety(candidateMetrics = {}, baselineMetrics = {}) {
  if (!canaryState.enabled || !canaryState.activeCandidateVersion) {
    return { status: 'CANARY_INACTIVE', tripped: false, reason: null };
  }

  const {
    brierScore: candBrier,
    logLoss: candLogLoss,
    ece: candEce,
    latencyMs: candLatency,
    suspensionRate: candSuspensionRate,
    invalidProbCount = 0,
  } = candidateMetrics;

  const {
    brierScore: baseBrier = 0.20,
    logLoss: baseLogLoss = 0.55,
    ece: baseEce = 0.04,
  } = baselineMetrics;

  let tripReason = null;

  if (invalidProbCount > 0) {
    tripReason = `Candidate produced ${invalidProbCount} invalid or out-of-bounds probabilities.`;
  } else if (candBrier && baseBrier && ((candBrier - baseBrier) / baseBrier) * 100 > SAFETY_THRESHOLDS.maxBrierDegradationPct) {
    tripReason = `Brier score degraded by ${(((candBrier - baseBrier) / baseBrier) * 100).toFixed(1)}% (limit: ${SAFETY_THRESHOLDS.maxBrierDegradationPct}%).`;
  } else if (candLogLoss && baseLogLoss && ((candLogLoss - baseLogLoss) / baseLogLoss) * 100 > SAFETY_THRESHOLDS.maxLogLossDegradationPct) {
    tripReason = `Log loss degraded by ${(((candLogLoss - baseLogLoss) / baseLogLoss) * 100).toFixed(1)}% (limit: ${SAFETY_THRESHOLDS.maxLogLossDegradationPct}%).`;
  } else if (candLatency && candLatency > SAFETY_THRESHOLDS.maxCandidateLatencyMs) {
    tripReason = `Candidate pricing latency (${candLatency}ms) exceeded safety ceiling (${SAFETY_THRESHOLDS.maxCandidateLatencyMs}ms).`;
  } else if (candSuspensionRate && candSuspensionRate > SAFETY_THRESHOLDS.maxSuspensionRatePct) {
    tripReason = `Candidate market suspension rate (${candSuspensionRate}%) exceeded limit (${SAFETY_THRESHOLDS.maxSuspensionRatePct}%).`;
  }

  if (tripReason) {
    // Execute Emergency Automatic Rollback
    const rolledBackVersion = canaryState.activeCandidateVersion;
    canaryState.enabled = false;
    canaryState.activeCandidateVersion = null;
    canaryState.lastRollback = {
      timestamp: new Date().toISOString(),
      candidateVersion: rolledBackVersion,
      reason: tripReason,
      trigger: 'AUTOMATIC_SAFETY_BREAKER',
    };

    canaryState.auditLog.push({
      timestamp: new Date().toISOString(),
      operator: 'AUTO_SAFETY_MONITOR',
      action: 'EMERGENCY_ROLLBACK',
      candidateVersion: rolledBackVersion,
      reason: tripReason,
    });

    try {
      updateModelStatus(rolledBackVersion, MODEL_STATUSES.REJECTED, {
        operator: 'AUTO_SAFETY_MONITOR',
        reason: `Auto-rollback tripped: ${tripReason}`,
      });
    } catch {
      // Model status update non-fatal to safety breaker
    }

    return {
      status: 'EMERGENCY_ROLLBACK_TRIPPED',
      tripped: true,
      reason: tripReason,
      rolledBackVersion,
    };
  }

  return {
    status: 'CANARY_HEALTHY',
    tripped: false,
    reason: null,
  };
}

export function resetCanaryState() {
  canaryState.enabled = false;
  canaryState.canaryPercent = 5;
  canaryState.activeCandidateVersion = null;
  canaryState.lastRollback = null;
  canaryState.auditLog.length = 0;
}
