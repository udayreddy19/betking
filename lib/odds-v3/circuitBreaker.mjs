/**
 * Market Suspension Circuit Breaker — OddsEngine V3
 *
 * Monitors live feed arrival times and latency.
 * If data feed latency exceeds the maximum threshold (e.g. 2500ms) or consecutive
 * missed tick sequences occur during active play, automatically transitions
 * markets to SUSPENDED to prevent court-siding and stale-quote exploitation.
 *
 * IMPORTANT: Only trip on real feed timestamps. Aggregator board pricing may
 * call evaluate once per poll (often >> maxStaleTickAgeMs apart). Treating
 * "time since last evaluate()" as feed staleness falsely suspends all cricket
 * match-winner odds while other-sports (no breaker) keep pricing.
 */

export const DEFAULT_CIRCUIT_BREAKER_CONFIG = {
  maxFeedLatencyMs: 2500, // Maximum allowed latency before suspension
  maxStaleTickAgeMs: 5000, // Unused for wall-clock-between-evals (kept for API compat)
  minTicksForRecovery: 2,  // Number of valid fresh ticks required to auto-recover
  autoResumeEnabled: true,
};

const MATCH_FEED_HEALTH = new Map();

function parseTickTime(timestamp) {
  if (timestamp == null || timestamp === '') return NaN;
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    // Heuristic: seconds vs ms
    return timestamp < 1e12 ? timestamp * 1000 : timestamp;
  }
  const ms = new Date(timestamp).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

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
  const tickTime = parseTickTime(tickMetadata.timestamp);
  const hasFeedTs = Number.isFinite(tickTime);
  const latencyMs = hasFeedTs ? Math.max(0, now - tickTime) : 0;

  const history = MATCH_FEED_HEALTH.get(matchId) || {
    matchId,
    lastTickTime: now,
    lastHealthyTickTime: null,
    latencyHistory: [],
    consecutiveHealthyTicks: 0,
    isSuspended: false,
    trippedReason: null,
  };

  history.lastTickTime = now;
  if (hasFeedTs) {
    history.latencyHistory.push(latencyMs);
    if (history.latencyHistory.length > 20) {
      history.latencyHistory.shift();
    }
  }

  // Latency gate — only when a real feed timestamp is present.
  if (hasFeedTs && latencyMs > config.maxFeedLatencyMs) {
    history.isSuspended = true;
    history.consecutiveHealthyTicks = 0;
    history.trippedReason = `FEED_LATENCY_EXCEEDED (${latencyMs}ms > ${config.maxFeedLatencyMs}ms)`;
    MATCH_FEED_HEALTH.set(matchId, history);
    return { isTripped: true, reason: history.trippedReason, latencyMs };
  }

  if (hasFeedTs && latencyMs <= config.maxFeedLatencyMs) {
    history.lastHealthyTickTime = now;
  }

  // No feed timestamp (typical aggregator board poll): do not invent FEED_STALE
  // from gaps between price evaluations — that blanked cricket odds in production.
  if (!hasFeedTs) {
    if (history.isSuspended && config.autoResumeEnabled) {
      // Allow recovery without requiring synthetic timestamps.
      history.consecutiveHealthyTicks += 1;
      if (history.consecutiveHealthyTicks >= config.minTicksForRecovery) {
        history.isSuspended = false;
        history.trippedReason = null;
      } else {
        MATCH_FEED_HEALTH.set(matchId, history);
        return {
          isTripped: true,
          reason: `RECOVERING (${history.consecutiveHealthyTicks}/${config.minTicksForRecovery} healthy ticks)`,
          latencyMs: 0,
        };
      }
    }
    MATCH_FEED_HEALTH.set(matchId, history);
    return { isTripped: false, reason: null, latencyMs: 0 };
  }

  // 2. Recovery check (timestamped path)
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
