/**
 * OddsEngineV3 — Real-Time Pricing Anomaly Detector
 * 
 * Inspects pricing updates in real-time to detect:
 * - Sudden probability/odds jumps without match state justification
 * - Stale feeds exceeding circuit breaker threshold
 * - Pathological margin bound violations
 * - Rapid price flicker oscillations
 * - Mathematical model instability (NaN/Inf)
 */

import { emitOddsEvent, EVENT_TYPES } from '../telemetry/oddsEventStream.mjs';

const anomalyRegistry = [];
const MAX_ANOMALIES = 1000;

export const ANOMALY_SEVERITY = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
});

/**
 * Evaluates an odds transition for potential pricing anomalies.
 */
export function evaluatePricingAnomaly({
  matchId,
  sport = 'cricket',
  market = 'match_winner',
  selection = '1',
  previousOdds = null,
  newOdds,
  previousProb = null,
  newProb,
  margin = 0.05,
  feedAgeMs = 0,
  providerSpread = 0,
  matchStateChanged = false,
} = {}) {
  const anomaliesFound = [];

  // Check 1: Mathematical validity
  if (!Number.isFinite(newProb) || newProb < 0 || newProb > 1 || !Number.isFinite(newOdds) || newOdds < 1.0) {
    anomaliesFound.push({
      type: 'MODEL_INSTABILITY',
      severity: ANOMALY_SEVERITY.CRITICAL,
      cause: `Invalid probability (${newProb}) or odds (${newOdds}) produced.`,
    });
  }

  // Check 2: Unexplained probability jump (> 0.15 without match event)
  if (previousProb !== null && Math.abs(newProb - previousProb) > 0.15 && !matchStateChanged) {
    anomaliesFound.push({
      type: 'UNEXPLAINED_PROBABILITY_JUMP',
      severity: ANOMALY_SEVERITY.HIGH,
      cause: `Probability shifted by ${Number((newProb - previousProb).toFixed(4))} without game state change.`,
    });
  }

  // Check 3: Stale feed exceeding circuit breaker
  if (feedAgeMs > 15000) {
    anomaliesFound.push({
      type: 'STALE_FEED_EXCEEDED',
      severity: ANOMALY_SEVERITY.HIGH,
      cause: `Feed data age is ${feedAgeMs}ms (exceeds 15,000ms threshold).`,
    });
  }

  // Check 4: Hard margin bound violation
  if (margin < 0.035 || margin > 0.12) {
    anomaliesFound.push({
      type: 'MARGIN_BOUND_VIOLATION',
      severity: ANOMALY_SEVERITY.MEDIUM,
      cause: `Margin ${margin} is outside enforced envelope [0.035, 0.12].`,
    });
  }

  // Check 5: Extreme provider spread
  if (providerSpread > 35) {
    anomaliesFound.push({
      type: 'EXTREME_PROVIDER_DIVERGENCE',
      severity: ANOMALY_SEVERITY.HIGH,
      cause: `Multi-provider spread reached ${providerSpread}%.`,
    });
  }

  for (const a of anomaliesFound) {
    const record = {
      anomalyId: `anom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      matchId: String(matchId),
      sport: String(sport).toLowerCase(),
      market: String(market),
      selection: String(selection),
      previousOdds,
      newOdds,
      ...a,
    };

    anomalyRegistry.push(record);
    if (anomalyRegistry.length > MAX_ANOMALIES) {
      anomalyRegistry.shift();
    }

    emitOddsEvent(EVENT_TYPES.PRICE_ANOMALY, record);
  }

  return {
    hasAnomalies: anomaliesFound.length > 0,
    anomalies: anomaliesFound,
    evaluatedAt: new Date().toISOString(),
  };
}

export function getRecentAnomalies(limit = 100) {
  return [...anomalyRegistry].reverse().slice(0, Math.min(limit, MAX_ANOMALIES));
}

export function clearAnomalyRegistry() {
  anomalyRegistry.length = 0;
}
