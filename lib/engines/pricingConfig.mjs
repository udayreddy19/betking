/**
 * Centralized Pricing Configuration (lib/engines/pricingConfig.mjs)
 * Hardened operational parameters, risk bounds, margin policies, TTLs, and rounding rules.
 */

export const PRICING_CONFIG = {
  // Bounds
  MIN_PROBABILITY: 0.01,
  MAX_PROBABILITY: 0.99,
  MIN_ODDS: 1.05,
  MAX_ODDS: 500.0,
  MAX_RISK_SHIFT: 0.08,

  // TTL & Expiry
  DEFAULT_TTL_MS: 10000, // 10 seconds price TTL
  MAX_PROVIDER_AGE_MS: 30000, // 30 seconds provider staleness threshold

  // Tolerances
  PROBABILITY_TOLERANCE: 0.005, // Probability sum tolerance for mutually exclusive outcomes

  // Margin Policies per sport/status
  MARGINS: {
    CRICKET_PREMATCH: 4.5,
    CRICKET_LIVE: 5.0,
    SOCCER_MAIN: 5.0,
    DEFAULT: 5.0,
  },

  // Display Precision & Increments
  DECIMAL_PRECISION: 2,
  LINE_INCREMENT: 0.5,
};
