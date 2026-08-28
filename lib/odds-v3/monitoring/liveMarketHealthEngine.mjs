/**
 * OddsEngineV3 — Live Market Health Engine
 * 
 * Evaluates real-time health for all active betting markets.
 * Classifies market state into: HEALTHY, WATCH, DEGRADED, SUSPENDED.
 */

export const MARKET_HEALTH_STATUS = Object.freeze({
  HEALTHY: 'HEALTHY',
  WATCH: 'WATCH',
  DEGRADED: 'DEGRADED',
  SUSPENDED: 'SUSPENDED',
});

/**
 * Assesses the real-time health of a single market.
 */
export function evaluateMarketHealth({
  marketId,
  isSuspended = false,
  feedAgeMs = 120,
  providerDivergence = 0.02,
  priceVolatility = 0.05,
  margin = 0.05,
  latencyMs = 80,
} = {}) {
  if (isSuspended) {
    return {
      marketId,
      status: MARKET_HEALTH_STATUS.SUSPENDED,
      healthScore: 0,
      reason: 'Market is currently suspended by circuit breaker or admin action.',
    };
  }

  let healthScore = 100;
  const issues = [];

  if (feedAgeMs > 10000) {
    healthScore -= 55;
    issues.push(`Feed age high (${feedAgeMs}ms)`);
  } else if (feedAgeMs > 5000) {
    healthScore -= 25;
    issues.push(`Feed latency elevated (${feedAgeMs}ms)`);
  }

  if (providerDivergence > 0.15) {
    healthScore -= 35;
    issues.push(`High provider divergence (${(providerDivergence * 100).toFixed(1)}%)`);
  } else if (providerDivergence > 0.05) {
    healthScore -= 15;
    issues.push(`Moderate provider spread (${(providerDivergence * 100).toFixed(1)}%)`);
  }

  if (priceVolatility > 0.40) {
    healthScore -= 20;
    issues.push(`High price volatility (${(priceVolatility * 100).toFixed(1)}%)`);
  }

  if (margin < 0.035 || margin > 0.12) {
    healthScore -= 25;
    issues.push(`Margin bound deviation (${margin})`);
  }

  healthScore = Math.max(0, healthScore);

  let status = MARKET_HEALTH_STATUS.HEALTHY;
  if (healthScore < 50) {
    status = MARKET_HEALTH_STATUS.DEGRADED;
  } else if (healthScore < 80) {
    status = MARKET_HEALTH_STATUS.WATCH;
  }

  return {
    marketId,
    status,
    healthScore,
    issues,
    metrics: { feedAgeMs, providerDivergence, priceVolatility, margin, latencyMs },
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Batch evaluates a list of active markets.
 */
export function evaluateActiveMarketsHealth(marketsList = []) {
  const evaluations = marketsList.map(evaluateMarketHealth);
  const counts = {
    HEALTHY: 0,
    WATCH: 0,
    DEGRADED: 0,
    SUSPENDED: 0,
  };

  for (const e of evaluations) {
    counts[e.status] = (counts[e.status] || 0) + 1;
  }

  return {
    totalMarkets: marketsList.length,
    counts,
    evaluations,
    overallHealthPercent: marketsList.length > 0
      ? Number(((evaluations.reduce((sum, e) => sum + e.healthScore, 0) / (marketsList.length * 100)) * 100).toFixed(1))
      : 100,
    evaluatedAt: new Date().toISOString(),
  };
}
