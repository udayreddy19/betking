/**
 * OddsEngineV3 — OddsCalculator
 * 
 * End-to-end pricing pipeline for a single selection:
 *   probability → fairOdds → margin → finalOdds
 * 
 * Combines FairOddsCalculator + MarginCalculator into a single call.
 */

import { calculateFairOdds } from './FairOddsCalculator.mjs';
import { applyMargin, priceExclusiveOutcomes } from './MarginCalculator.mjs';
import { createSelectionPrice } from '../models/SelectionPrice.mjs';

/**
 * Prices a single selection from raw probability to final odds.
 * 
 * @param {Object} params
 * @param {string} params.selectionId
 * @param {string} params.name
 * @param {number} params.probability  - Raw model probability (0 < p < 1)
 * @param {number} params.overround    - Configured overround (e.g. 0.05)
 * @returns {import('../models/SelectionPrice.mjs').SelectionPrice}
 */
export function priceSelection({ selectionId, name, probability, overround }) {
  const fairOdds = calculateFairOdds(probability);
  const { finalProbability, odds, margin } = applyMargin(probability, overround);

  return createSelectionPrice({
    selectionId,
    name,
    probability,
    fairOdds,
    margin,
    finalProbability,
    odds,
  });
}

/**
 * Price a set of mutually exclusive selections with shared margin normalization.
 */
export function priceExclusiveSelections(outcomes, overround) {
  const result = priceExclusiveOutcomes(outcomes, overround);
  if (result.suspended) {
    return result;
  }
  return {
    suspended: false,
    selections: result.selections.map((sel) => createSelectionPrice({
      ...sel,
      fairOdds: calculateFairOdds(sel.probability),
    })),
  };
}
