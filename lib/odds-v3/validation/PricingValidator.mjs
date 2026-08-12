/**
 * OddsEngineV3 — PricingValidator
 * 
 * Validates the mathematical invariants of pricing output.
 * Every selection must satisfy strict numerical constraints.
 */

/**
 * Validates a single selection's pricing.
 * @param {import('../models/SelectionPrice.mjs').SelectionPrice} selection
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSelectionPrice(selection) {
  const errors = [];

  if (!Number.isFinite(selection.probability)) errors.push('probability is not finite');
  else if (selection.probability <= 0 || selection.probability >= 1) errors.push(`probability out of range (0,1): ${selection.probability}`);

  if (!Number.isFinite(selection.fairOdds)) errors.push('fairOdds is not finite');
  else if (selection.fairOdds <= 1) errors.push(`fairOdds must be > 1: ${selection.fairOdds}`);

  if (!Number.isFinite(selection.odds)) errors.push('odds is not finite');
  else if (selection.odds < 1.01) errors.push(`odds must be >= 1.01: ${selection.odds}`);

  if (!Number.isFinite(selection.finalProbability)) errors.push('finalProbability is not finite');

  if (!Number.isFinite(selection.margin)) errors.push('margin is not finite');

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a two-way market's probability sum equals 1.0 (within tolerance).
 * @param {number[]} probabilities - Raw model probabilities
 * @param {number} tolerance - Default 0.001
 * @returns {{ valid: boolean, sum: number, error?: string }}
 */
export function validateProbabilitySum(probabilities, tolerance = 0.001) {
  const sum = probabilities.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1.0) > tolerance) {
    return { valid: false, sum, error: `probability sum ${sum} deviates from 1.0 by more than ${tolerance}` };
  }
  return { valid: true, sum };
}

/**
 * Validates that implied probability sum matches expected overround.
 * @param {number[]} finalOdds - Array of final display odds
 * @param {number} configuredOverround - e.g. 0.05
 * @param {number} tolerance - Default 0.01
 * @returns {{ valid: boolean, impliedSum: number, expectedSum: number, error?: string }}
 */
export function validateOverround(finalOdds, configuredOverround, tolerance = 0.05) {
  const impliedSum = finalOdds.reduce((sum, o) => sum + (1 / o), 0);
  const expectedSum = 1 + configuredOverround;
  if (Math.abs(impliedSum - expectedSum) > tolerance) {
    return {
      valid: false,
      impliedSum,
      expectedSum,
      error: `implied sum ${impliedSum.toFixed(6)} does not match expected ${expectedSum.toFixed(6)}`,
    };
  }
  return { valid: true, impliedSum, expectedSum };
}
