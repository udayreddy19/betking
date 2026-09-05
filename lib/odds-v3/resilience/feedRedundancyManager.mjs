/**
 * OddsEngineV3 — Feed Redundancy & Telemetry Resiliency Manager
 * 
 * Tracks feed provider availability, automated failover routing, and unified pricing quality.
 * Enforces non-blocking telemetry degradation during high-traffic surges.
 */

export const REDUNDANCY_LEVELS = Object.freeze({
  REDUNDANT: 'REDUNDANT',                     // >= 3 active feeds
  PARTIALLY_REDUNDANT: 'PARTIALLY_REDUNDANT', // 2 active feeds
  SINGLE_POINT_OF_FAILURE: 'SINGLE_POINT_OF_FAILURE', // 1 active feed
});

const ACTIVE_FEEDS = new Map([
  ['cricket', ['cricbuzz', 'crex', 'tencric', 'espn', 'cricketguru', 'cricketliveline']],
  ['soccer', ['10cric', 'espn']],
  ['tennis', ['10cric', 'espn']],
  ['basketball', ['10cric', 'espn']],
]);

/**
 * Assesses feed redundancy level for a sport based on active health status.
 */
export function evaluateFeedRedundancy(sport = 'cricket', availableFeeds = []) {
  const normalizedSport = String(sport).toLowerCase();
  const configured = ACTIVE_FEEDS.get(normalizedSport) || ['10cric'];
  const activeCount = availableFeeds.length > 0
    ? availableFeeds.filter((f) => configured.includes(f)).length
    : configured.length;

  let level = REDUNDANCY_LEVELS.SINGLE_POINT_OF_FAILURE;
  if (activeCount >= 3) level = REDUNDANCY_LEVELS.REDUNDANT;
  else if (activeCount === 2) level = REDUNDANCY_LEVELS.PARTIALLY_REDUNDANT;

  return {
    sport: normalizedSport,
    redundancyLevel: level,
    configuredFeeds: configured,
    activeFeedCount: activeCount,
    failoverAvailable: activeCount > 1,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Computes a unified 5-dimension quality score (0 to 100).
 */
export function computeUnifiedQualityScore({
  inputValid = true,
  modelValid = true,
  providerDivergence = 0.03,
  priceIntegrity = 100,
  latencyMs = 120,
} = {}) {
  const inputQuality = inputValid ? 100 : 0;
  const modelQuality = modelValid ? 100 : 0;
  const providerQuality = Math.max(0, 100 - providerDivergence * 400);
  const priceQuality = Math.min(Math.max(priceIntegrity, 0), 100);
  const latencyQuality = Math.max(0, 100 - (latencyMs / 500) * 50);

  const overall = Number((
    inputQuality * 0.20 +
    modelQuality * 0.25 +
    providerQuality * 0.20 +
    priceQuality * 0.25 +
    latencyQuality * 0.10
  ).toFixed(1));

  return {
    unifiedScore: overall,
    dimensions: {
      INPUT_QUALITY: inputQuality,
      MODEL_QUALITY: modelQuality,
      PROVIDER_QUALITY: Number(providerQuality.toFixed(1)),
      PRICE_QUALITY: priceQuality,
      LATENCY_QUALITY: Number(latencyQuality.toFixed(1)),
    },
    status: overall >= 90 ? 'EXCELLENT' : (overall >= 75 ? 'GOOD' : 'DEGRADED'),
  };
}
