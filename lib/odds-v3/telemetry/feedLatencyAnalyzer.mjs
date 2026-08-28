/**
 * OddsEngineV3 — Feed Latency & Freshness Analyzer
 * 
 * Classifies feed latency into performance tiers and evaluates
 * impact on market suspensions and price stability:
 * - Tier 1: Ultra-Fast (< 100ms)
 * - Tier 2: Optimal (100–250ms)
 * - Tier 3: Acceptable (250–500ms)
 * - Tier 4: Elevated (500–1000ms)
 * - Tier 5: High Risk (1000–2500ms) -> Dynamic Margin expanded
 * - Tier 6: Critical / Stale (> 2500ms) -> Circuit Breaker trips to SUSPENDED
 */

export const LATENCY_TIERS = Object.freeze([
  { tier: '<100ms', min: 0, max: 100, riskLevel: 'LOW' },
  { tier: '100-250ms', min: 100, max: 250, riskLevel: 'LOW' },
  { tier: '250-500ms', min: 250, max: 500, riskLevel: 'MEDIUM' },
  { tier: '500-1000ms', min: 500, max: 1000, riskLevel: 'ELEVATED' },
  { tier: '1000-2500ms', min: 1000, max: 2500, riskLevel: 'HIGH_MARGIN_BUFFER' },
  { tier: '>2500ms', min: 2500, max: Infinity, riskLevel: 'CIRCUIT_BREAKER_SUSPENDED' },
]);

export function analyzeFeedLatency(observations = []) {
  if (!Array.isArray(observations) || observations.length === 0) {
    return {
      sampleSize: 0,
      averageLatencyMs: 0,
      p95LatencyMs: 0,
      maxLatencyMs: 0,
      staleBreakerTrips: 0,
      tierDistribution: {},
      status: 'INSUFFICIENT_DATA',
    };
  }

  const latencies = [];
  const tierDistribution = {};
  for (const t of LATENCY_TIERS) {
    tierDistribution[t.tier] = { count: 0, percentage: 0, riskLevel: t.riskLevel };
  }

  let totalLatency = 0;
  let staleTrips = 0;

  for (const obs of observations) {
    const lat = Number(obs.feedLatencyMs || obs.feedLatency || 0);
    latencies.push(lat);
    totalLatency += lat;

    if (lat > 2500) staleTrips++;

    for (const t of LATENCY_TIERS) {
      if (lat >= t.min && lat < t.max) {
        tierDistribution[t.tier].count++;
        break;
      }
    }
  }

  latencies.sort((a, b) => a - b);
  const n = latencies.length;
  const avg = totalLatency / n;
  const p95 = latencies[Math.floor(n * 0.95)] || 0;
  const max = latencies[n - 1] || 0;

  for (const tierKey in tierDistribution) {
    tierDistribution[tierKey].percentage = Number(((tierDistribution[tierKey].count / n) * 100).toFixed(2));
  }

  const status = (staleTrips / n) > 0.05 ? 'DEGRADED_FEED' : (avg > 500 ? 'ELEVATED_LATENCY' : 'HEALTHY');

  return {
    sampleSize: n,
    averageLatencyMs: Number(avg.toFixed(1)),
    p95LatencyMs: p95,
    maxLatencyMs: max,
    staleBreakerTrips: staleTrips,
    tierDistribution,
    status,
  };
}
