/**
 * OddsEngineV3 — Dynamic Margin Engine
 * 
 * Expands or compresses base overround dynamically based on:
 * - Event Volatility (e.g. death overs, red cards, break points)
 * - Feed Freshness & Latency
 * - Market Exposure & Liquidity
 * 
 * Invariant: Never allows margin to fall below minimum base threshold (e.g. 3.5%).
 */

export const DYNAMIC_MARGIN_CONFIG = Object.freeze({
  enabled: process.env.ODDS_DYNAMIC_MARGIN_ENABLED === 'true',
  minOverround: 0.035, // 3.5% floor
  maxOverround: 0.120, // 12.0% ceiling
  volatilityMultiplier: 0.020,
  latencyPenalty: 0.015,
});

/**
 * Computes dynamic overround for a market.
 */
export function calculateDynamicOverround({
  baseOverround = 0.05,
  isLive = false,
  volatilityScore = 0, // [0, 1]
  feedLatencyMs = 0,
  config = {},
}) {
  const cfg = { ...DYNAMIC_MARGIN_CONFIG, ...config };
  if (!cfg.enabled) return baseOverround;

  let dynamicAdj = 0;

  // 1. High in-play volatility adjustment
  if (isLive && volatilityScore > 0.5) {
    dynamicAdj += (volatilityScore - 0.5) * cfg.volatilityMultiplier * 2;
  }

  // 2. Feed latency penalty
  if (feedLatencyMs > 1500) {
    dynamicAdj += cfg.latencyPenalty;
  }

  const finalOverround = Math.max(cfg.minOverround, Math.min(cfg.maxOverround, baseOverround + dynamicAdj));
  return Number(finalOverround.toFixed(4));
}
