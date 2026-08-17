/**
 * Enterprise Provider Health Manager — OddsYra Sportsbook (lib/providerHealthManager.mjs)
 * Tracks live provider status (Cricbuzz, 10Cric, CREX, FanCode, ESPN), latency, availability %,
 * request error rates, timeouts, priority rankings, and automatic provider failover switching.
 */

const PROVIDER_HEALTH_STORE = new Map([
  ['cricbuzz', { id: 'cricbuzz', name: 'Cricbuzz API', priority: 1, status: 'HEALTHY', latencyMs: 120, errorCount: 0, totalRequests: 100, lastPing: Date.now() }],
  ['crex', { id: 'crex', name: 'CREX Live Provider', priority: 2, status: 'HEALTHY', latencyMs: 65, errorCount: 0, totalRequests: 100, lastPing: Date.now() }],
  ['fancode', { id: 'fancode', name: 'FanCode Stream', priority: 3, status: 'HEALTHY', latencyMs: 140, errorCount: 0, totalRequests: 100, lastPing: Date.now() }],
  ['10cric2026', { id: '10cric2026', name: '10Cric Gateway', priority: 4, status: 'HEALTHY', latencyMs: 45, errorCount: 0, totalRequests: 100, lastPing: Date.now() }],
  ['espn', { id: 'espn', name: 'ESPN Live Feed', priority: 5, status: 'HEALTHY', latencyMs: 180, errorCount: 0, totalRequests: 100, lastPing: Date.now() }],
]);

/**
 * Record API call latency and status result for a provider
 */
export function recordProviderMetric(providerId, latencyMs, isError = false) {
  let health = PROVIDER_HEALTH_STORE.get(providerId);
  if (!health) {
    health = { id: providerId, name: providerId, priority: 10, status: 'HEALTHY', latencyMs: 100, errorCount: 0, totalRequests: 0, lastPing: Date.now() };
    PROVIDER_HEALTH_STORE.set(providerId, health);
  }

  health.totalRequests += 1;
  health.latencyMs = Math.round((health.latencyMs * 0.7) + (latencyMs * 0.3));
  health.lastPing = Date.now();

  if (isError) {
    health.errorCount += 1;
  }

  const errorRate = health.totalRequests > 0 ? health.errorCount / health.totalRequests : 0;
  if (errorRate > 0.3 || health.latencyMs > 3000) {
    health.status = 'DEGRADED';
  } else if (errorRate > 0.6) {
    health.status = 'DOWN';
  } else {
    health.status = 'HEALTHY';
  }

  return health;
}

/**
 * Get active healthy provider priority queue (automatic failover ordering)
 */
export function getActiveProviderPriorityQueue() {
  return Array.from(PROVIDER_HEALTH_STORE.values())
    .filter((p) => p.status !== 'DOWN')
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Generate monitoring dashboard status summary
 */
export function getProviderHealthDashboard() {
  const providers = Array.from(PROVIDER_HEALTH_STORE.values());
  const healthyCount = providers.filter((p) => p.status === 'HEALTHY').length;

  return {
    totalProviders: providers.length,
    healthyProviders: healthyCount,
    activeQueue: getActiveProviderPriorityQueue().map((p) => p.id),
    providers,
    timestamp: Date.now(),
  };
}
