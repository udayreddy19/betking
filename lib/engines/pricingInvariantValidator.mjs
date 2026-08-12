/**
 * Pricing Invariant Validator (lib/engines/pricingInvariantValidator.mjs)
 * Enforces strict mathematical invariants on probabilities, fair odds, margins, and final odds.
 * Rejects invalid pricing results (NaN, Infinity, negative, zero, non-normalized probabilities).
 */

import { PRICING_CONFIG } from './pricingConfig.mjs';

export class PricingInvariantValidator {
  /**
   * Validates pricing results for a single option
   */
  validateOptionPricing(option) {
    if (!option) {
      return { valid: false, reason: 'Option object is null or undefined' };
    }

    const { odds, probability } = option;

    // Reject non-finite values
    if (typeof odds !== 'number' || !Number.isFinite(odds) || Number.isNaN(odds)) {
      return { valid: false, reason: `Invalid non-finite odds: ${odds}` };
    }

    if (typeof probability !== 'number' || !Number.isFinite(probability) || Number.isNaN(probability)) {
      return { valid: false, reason: `Invalid non-finite probability: ${probability}` };
    }

    // Probability bounds
    if (probability <= 0 || probability >= 1) {
      return { valid: false, reason: `Probability ${probability} out of open interval (0, 1)` };
    }

    // Odds bounds
    if (odds < PRICING_CONFIG.MIN_ODDS) {
      return { valid: false, reason: `Odds ${odds} less than minimum allowed odds ${PRICING_CONFIG.MIN_ODDS}` };
    }

    if (odds > PRICING_CONFIG.MAX_ODDS) {
      return { valid: false, reason: `Odds ${odds} exceed maximum allowed odds ${PRICING_CONFIG.MAX_ODDS}` };
    }

    return { valid: true };
  }

  /**
   * Validates probability sum invariant for a set of mutually exclusive outcomes
   */
  validateProbabilitySet(probabilities = {}) {
    const values = Object.values(probabilities).filter(v => typeof v === 'number' && Number.isFinite(v));
    if (values.length === 0) {
      return { valid: false, reason: 'No valid numeric probabilities provided' };
    }

    const sum = values.reduce((a, b) => a + b, 0);
    const diff = Math.abs(sum - 1.0);

    if (diff > PRICING_CONFIG.PROBABILITY_TOLERANCE) {
      return {
        valid: false,
        reason: `Probability sum ${sum.toFixed(4)} deviates from 1.0 beyond tolerance ${PRICING_CONFIG.PROBABILITY_TOLERANCE}`,
        sum,
      };
    }

    return { valid: true, sum };
  }
}

export const pricingInvariantValidator = new PricingInvariantValidator();
