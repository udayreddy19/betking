/**
 * Rounding Policies (lib/engines/roundingPolicies.mjs)
 * Standardizes display boundary rounding for odds and lines.
 * Full precision is maintained throughout internal calculation; rounding is applied ONLY at final display boundary.
 */

import { PRICING_CONFIG } from './pricingConfig.mjs';

export class OddsRoundingPolicy {
  /**
   * Rounds final calculated decimal odds to standard precision (2 decimal places)
   */
  static roundOdds(unroundedOdds) {
    if (typeof unroundedOdds !== 'number' || !Number.isFinite(unroundedOdds)) {
      return PRICING_CONFIG.MIN_ODDS;
    }
    const clamped = Math.max(PRICING_CONFIG.MIN_ODDS, Math.min(PRICING_CONFIG.MAX_ODDS, unroundedOdds));
    return Number(clamped.toFixed(PRICING_CONFIG.DECIMAL_PRECISION));
  }
}

export class LineRoundingPolicy {
  /**
   * Standardizes market total lines to 0.5 increments (e.g. 115.5, 270.5)
   */
  static roundLine(rawLine) {
    if (typeof rawLine !== 'number' || !Number.isFinite(rawLine)) {
      return 0.5;
    }
    const base = Math.floor(rawLine);
    return Number((base + PRICING_CONFIG.LINE_INCREMENT).toFixed(1));
  }
}
