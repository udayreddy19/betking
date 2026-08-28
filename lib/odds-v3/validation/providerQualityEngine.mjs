/**
 * OddsEngineV3 — Provider Quality & Reliability Analysis Engine
 * 
 * Measures provider feed health, latency, freshness, disagreement frequency,
 * and conflict rates to detect degraded feeds without modifying production weights automatically.
 */

export const PROVIDER_HEALTH_STATUS = Object.freeze({
  KEEP: 'KEEP',
  WATCH: 'WATCH',
  DEGRADED: 'DEGRADED',
  UNTRUSTED: 'UNTRUSTED',
});

/**
 * Computes individual provider quality metrics and composite 0-100 rating.
 */
export function evaluateProviderQuality({
  providerName,
  latencyMs = 120,
  freshnessPct = 95.0,
  availabilityPct = 99.9,
  disagreementRate = 0.04,
  conflictCount = 0,
  totalEvents = 100,
} = {}) {
  // Score components:
  // Freshness (35%), Latency (25%), Availability (20%), Agreement (20%)
  const latencyScore = Math.max(0, 100 - (latencyMs / 10)); // <100ms=90+, 500ms=50
  const agreementScore = Math.max(0, 100 - (disagreementRate * 500)); // 0% dis=100, 10% dis=50

  const compositeScore = Number((
    freshnessPct * 0.35 +
    latencyScore * 0.25 +
    availabilityPct * 0.20 +
    agreementScore * 0.20
  ).toFixed(1));

  let status = PROVIDER_HEALTH_STATUS.KEEP;
  if (compositeScore < 50 || conflictCount > 5) {
    status = PROVIDER_HEALTH_STATUS.UNTRUSTED;
  } else if (compositeScore < 70) {
    status = PROVIDER_HEALTH_STATUS.DEGRADED;
  } else if (compositeScore < 85) {
    status = PROVIDER_HEALTH_STATUS.WATCH;
  }

  return {
    providerName,
    compositeScore,
    status,
    metrics: {
      latencyMs,
      freshnessPct,
      availabilityPct,
      disagreementRate,
      conflictCount,
      totalEvents,
    },
    recommendation: status === PROVIDER_HEALTH_STATUS.KEEP ? 'OPERATE_NORMALLY' : 'MONITOR_FEED_CLOSELY',
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Evaluates all configured primary sports providers.
 */
export function evaluateAllProviders(providerTelemetryMap = {}) {
  const defaults = {
    cricbuzz: { latencyMs: 110, freshnessPct: 94.5, availabilityPct: 99.8, disagreementRate: 0.03 },
    crex:     { latencyMs: 92,  freshnessPct: 89.2, availabilityPct: 99.5, disagreementRate: 0.05 },
    espn:     { latencyMs: 195, freshnessPct: 88.0, availabilityPct: 99.2, disagreementRate: 0.06 },
    tencric:  { latencyMs: 340, freshnessPct: 85.0, availabilityPct: 98.5, disagreementRate: 0.08 },
  };

  const results = {};
  for (const [name, defaultData] of Object.entries(defaults)) {
    const data = providerTelemetryMap[name] || defaultData;
    results[name] = evaluateProviderQuality({ providerName: name, ...data });
  }

  return {
    providers: results,
    overallFeedHealth: Object.values(results).every((r) => r.status === PROVIDER_HEALTH_STATUS.KEEP) ? 'EXCELLENT' : 'STABLE',
    generatedAt: new Date().toISOString(),
  };
}
