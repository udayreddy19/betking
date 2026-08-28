/**
 * OddsEngineV3 — Data Availability Router
 * 
 * Determines the authoritative data source and fallback level for a given market.
 * Enforces market-specific fallback rules and prevents unauthorized synthetic/random pricing.
 */

import { globalProviderHealth, PROVIDER_STATES } from '../providers/providerHealthEngine.mjs';

export const DATA_ROUTING_DECISIONS = Object.freeze({
  REAL_PROVIDER: 'REAL_PROVIDER',
  SECONDARY_PROVIDER: 'SECONDARY_PROVIDER',
  CACHE: 'CACHE',
  DETERMINISTIC_MODEL: 'DETERMINISTIC_MODEL',
  SUSPEND: 'SUSPEND',
});

export const MARKET_CAPABILITY_RULES = Object.freeze({
  match_winner: 'ALLOW_DETERMINISTIC_IF_CANONICAL_STATE_VALID',
  totals: 'ALLOW_DETERMINISTIC_IF_CANONICAL_STATE_VALID',
  innings_totals: 'ALLOW_DETERMINISTIC_IF_CANONICAL_STATE_VALID',
  over_markets: 'REAL_FEED_REQUIRED',
  delivery_markets: 'REAL_FEED_REQUIRED',
  wicket_markets: 'ALLOW_DETERMINISTIC_IF_CANONICAL_STATE_VALID',
  player_props: 'REAL_STATS_REQUIRED',
  exotic_markets: 'REAL_PROVIDER_REQUIRED',
  live_settlement: 'VERIFIED_FINAL_RESULT_REQUIRED',
});

/**
 * Routes data source selection for an event/market.
 */
export function routeDataAvailability({
  sport = 'cricket',
  marketType = 'match_winner',
  primaryProvider = 'cricbuzz',
  secondaryProvider = 'crex',
  canonicalState = null,
  cachedSnapshot = null,
  maxCacheAgeMs = 2000,
} = {}) {
  const primaryHealth = globalProviderHealth.evaluateHealth(primaryProvider);
  const secondaryHealth = globalProviderHealth.evaluateHealth(secondaryProvider);
  const marketRule = MARKET_CAPABILITY_RULES[marketType] || 'REAL_PROVIDER_REQUIRED';

  // 1. Level 1: Primary Real Provider
  if (primaryHealth.status === PROVIDER_STATES.HEALTHY || primaryHealth.status === PROVIDER_STATES.RECOVERING) {
    return {
      decision: DATA_ROUTING_DECISIONS.REAL_PROVIDER,
      provider: primaryProvider,
      fallbackUsed: false,
      fallbackLevel: 1,
      reason: null,
      confidence: primaryHealth.confidenceScore,
      dataQualityScore: 100,
    };
  }

  // 2. Level 2: Secondary Real Provider
  if (secondaryHealth.status === PROVIDER_STATES.HEALTHY || secondaryHealth.status === PROVIDER_STATES.RECOVERING) {
    return {
      decision: DATA_ROUTING_DECISIONS.SECONDARY_PROVIDER,
      provider: secondaryProvider,
      fallbackUsed: true,
      fallbackLevel: 2,
      reason: `PRIMARY_PROVIDER_${primaryHealth.status}`,
      confidence: secondaryHealth.confidenceScore * 0.95,
      dataQualityScore: 90,
    };
  }

  // 3. Level 3: Recent Validated Cache
  if (cachedSnapshot && cachedSnapshot.generatedAt) {
    const cacheAge = Date.now() - new Date(cachedSnapshot.generatedAt).getTime();
    if (cacheAge <= maxCacheAgeMs && cachedSnapshot.status !== 'SUSPENDED') {
      return {
        decision: DATA_ROUTING_DECISIONS.CACHE,
        provider: null,
        fallbackUsed: true,
        fallbackLevel: 3,
        reason: 'REAL_PROVIDERS_UNAVAILABLE_SERVING_CACHE',
        confidence: Math.max(0.2, 0.85 - (cacheAge / maxCacheAgeMs) * 0.4),
        dataQualityScore: 80,
      };
    }
  }

  // 4. Level 4: Deterministic Internal Statistical Model (if market allows)
  if (marketRule === 'ALLOW_DETERMINISTIC_IF_CANONICAL_STATE_VALID') {
    if (canonicalState && canonicalState.sport && (canonicalState.isLive || canonicalState.isInPlay)) {
      return {
        decision: DATA_ROUTING_DECISIONS.DETERMINISTIC_MODEL,
        provider: null,
        fallbackUsed: true,
        fallbackLevel: 4,
        reason: 'REAL_PROVIDERS_UNAVAILABLE_FALLBACK_TO_DETERMINISTIC_MODEL',
        confidence: 0.70,
        dataQualityScore: 75,
      };
    }
  }

  // 5. Level 5: SUSPEND MARKET
  return {
    decision: DATA_ROUTING_DECISIONS.SUSPEND,
    provider: null,
    fallbackUsed: true,
    fallbackLevel: 5,
    reason: marketRule === 'REAL_FEED_REQUIRED' || marketRule === 'REAL_STATS_REQUIRED'
      ? 'REAL_FEED_REQUIRED_FOR_SPECIALIZED_MARKET'
      : 'ALL_DATA_SOURCES_EXHAUSTED_MARKET_SUSPENDED',
    confidence: 0.0,
    dataQualityScore: 0,
  };
}
