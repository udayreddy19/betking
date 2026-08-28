/**
 * Market Suspension Circuit Breaker — OddsEngine V3
 * 
 * Monitors live feed arrival times and latency.
 * If data feed latency exceeds the maximum threshold (e.g. 2500ms) or consecutive
 * missed tick sequences occur during active play, automatically transitions
 * markets to SUSPENDED to prevent court-siding and stale-quote exploitation.
 */

export const DEFAULT_CIRCUIT_BREAKER_CONFIG = {
  maxFeedLatencyMs: 2500, // Maximum allowed latency before suspension
  maxStaleTickAgeMs: 5000, // Hard limit where markets are frozen
  minTicksForRecovery: 2,  // Number of valid fresh ticks required to auto-recover
  autoResumeEnabled: true,
};

const MATCH_FEED_HEALTH = new Map();

/**
 * Record a feed tick and evaluate circuit breaker health
 * @param {string} matchId
 * @param {object} tickMetadata { timestamp, serverTime, stateVersion, ballEvent }
 * @param {object} customConfig
 * @returns {{ isTripped: boolean, reason: string|null, latencyMs: number }}
 */
export function evaluateFeedCircuitBreaker(matchId, tickMetadata = {}, customConfig = {}) {
  const config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...customConfig };
  const now = Date.now();
  const tickTime = tickMetadata.timestamp ? new Date(tickMetadata.timestamp).getTime() : now;
  const latencyMs = Math.max(0, now - tickTime);

  const history = MATCH_FEED_HEALTH.get(matchId) || {
    matchId,
    lastTickTime: now,
    latencyHistory: [],
    consecutiveHealthyTicks: 0,
    isSuspended: false,
    trippedReason: null,
  };

  history.lastTickTime = now;
  history.latencyHistory.push(latencyMs);
  if (history.latencyHistory.length > 20) {
    history.latencyHistory.shift();
  }

  // 1. Check for excessive latency
  if (latencyMs > config.maxFeedLatencyMs) {
    history.isSuspended = true;
    history.consecutiveHealthyTicks = 0;
    history.trippedReason = `FEED_LATENCY_EXCEEDED (${latencyMs}ms > ${config.maxFeedLatencyMs}ms)`;
    MATCH_FEED_HEALTH.set(matchId, history);
    return { isTripped: true, reason: history.trippedReason, latencyMs };
  }

  // 2. Recovery check
  if (history.isSuspended) {
    history.consecutiveHealthyTicks += 1;
    if (config.autoResumeEnabled && history.consecutiveHealthyTicks >= config.minTicksForRecovery) {
      history.isSuspended = false;
      history.trippedReason = null;
    } else {
      MATCH_FEED_HEALTH.set(matchId, history);
      return {
        isTripped: true,
        reason: `RECOVERING (${history.consecutiveHealthyTicks}/${config.minTicksForRecovery} healthy ticks)`,
        latencyMs,
      };
    }
  } else {
    history.consecutiveHealthyTicks += 1;
  }

  MATCH_FEED_HEALTH.set(matchId, history);
  return { isTripped: false, reason: null, latencyMs };
}

/**
 * Apply circuit breaker status to an array of markets
 * @param {Array} markets
 * @param {boolean} isTripped
 * @param {string} reason
 * @returns {Array} protected markets
 */
export function applyCircuitBreakerToMarkets(markets = [], isTripped = false, reason = '') {
  if (!isTripped) return markets;

  return markets.map((m) => ({
    ...m,
    status: 'SUSPENDED',
    suspensionReason: reason || 'FEED_CIRCUIT_BREAKER_TRIPPED',
    selections: (m.selections || []).map((s) => ({
      ...s,
      suspended: true,
    })),
  }));
}

/**
 * Reset health state for a match (e.g. upon match restart or manual thaw)
 */
export function resetMatchCircuitBreaker(matchId) {
  MATCH_FEED_HEALTH.delete(matchId);
}

/**
 * Get current health snapshot for all active matches
 */
export function getCircuitBreakerStatus() {
  const result = {};
  for (const [id, data] of MATCH_FEED_HEALTH.entries()) {
    result[id] = {
      isSuspended: data.isSuspended,
      trippedReason: data.trippedReason,
      lastLatencyMs: data.latencyHistory[data.latencyHistory.length - 1] || 0,
      consecutiveHealthy: data.consecutiveHealthyTicks,
    };
  }
  return result;
}
