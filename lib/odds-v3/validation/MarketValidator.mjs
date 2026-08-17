/**
 * OddsEngineV3 — MarketValidator
 * 
 * Validates a complete MarketDefinition before it enters the snapshot.
 */

import { validateSelectionPrice, validateProbabilitySum, validateOverround } from './PricingValidator.mjs';

/**
 * Validates a market's structure and pricing integrity.
 * @param {import('../models/MarketDefinition.mjs').MarketDefinition} market
 * @param {number} configuredOverround
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateMarket(market, configuredOverround) {
  const errors = [];

  if (!market.marketId) errors.push('marketId is empty');
  if (!market.marketType) errors.push('marketType is empty');
  if (!market.name) errors.push('name is empty');

  if (market.status === 'OPEN') {
    if (!market.selections || market.selections.length === 0) {
      errors.push('OPEN market has no selections');
    } else {
      // Validate each selection
      for (const sel of market.selections) {
        const result = validateSelectionPrice(sel);
        if (!result.valid) {
          errors.push(`selection '${sel.name}': ${result.errors.join(', ')}`);
        }
      }

      // Validate probability sum
      const probs = market.selections.map(s => s.probability);
      const probResult = validateProbabilitySum(probs);
      if (!probResult.valid) {
        errors.push(probResult.error);
      }

      // Validate overround
      const odds = market.selections.map(s => s.odds);
      const effectiveOverround = Number.isFinite(configuredOverround) ? configuredOverround : (market.overround || 0.06);
      const orrResult = validateOverround(odds, effectiveOverround);
      if (!orrResult.valid) {
        errors.push(orrResult.error);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
