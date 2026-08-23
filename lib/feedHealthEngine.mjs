/**
 * Sports feed provider health — hydration failures, stale data, failover signals.
 */

import { ProviderRegistry } from './providers/ProviderRegistry.mjs';

const FEED_EVENTS = [];
const MAX_EVENTS = 200;

export function recordFeedHydrationSuccess(providerId, meta = {}) {
  ProviderRegistry.recordSuccess(providerId);
  pushEvent({
    type: 'HYDRATION_OK',
    providerId,
    ...meta,
  });
}

export function recordFeedHydrationFailure(providerId, error, meta = {}) {
  ProviderRegistry.recordError(providerId, error);
  pushEvent({
    type: 'HYDRATION_FAIL',
    providerId,
    message: error?.message || String(error),
    ...meta,
  });
}

function pushEvent(event) {
  FEED_EVENTS.unshift({
    ...event,
    timestamp: new Date().toISOString(),
  });
  if (FEED_EVENTS.length > MAX_EVENTS) FEED_EVENTS.length = MAX_EVENTS;
}

export function getFeedHealthSnapshot() {
  const providers = ProviderRegistry.getAllProviders().map((p) => ({
    id: p.id,
    name: p.name,
    enabled: p.enabled,
    healthStatus: p.healthStatus,
    consecutiveErrors: p.consecutiveErrors || 0,
    lastSuccessAt: p.lastSuccessTimestamp
      ? new Date(p.lastSuccessTimestamp).toISOString()
      : null,
    pollIntervalMs: p.pollIntervalMs,
  }));

  const unhealthy = providers.filter((p) => p.healthStatus === 'UNHEALTHY');
  const recentFailures = FEED_EVENTS.filter((e) => e.type === 'HYDRATION_FAIL').slice(0, 10);

  return {
    healthy: unhealthy.length === 0,
    status: unhealthy.length === 0 ? 'HEALTHY' : 'DEGRADED',
    activeProvider: ProviderRegistry.getActiveProvider()?.id || null,
    providers,
    recentFailures,
    checkedAt: new Date().toISOString(),
  };
}
