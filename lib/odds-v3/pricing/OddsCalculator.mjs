/**
 * OddsEngineV3 — OddsCalculator
 * 
 * End-to-end pricing pipeline for a single selection:
 *   probability → fairOdds → margin → finalOdds
 * 
 * Combines FairOddsCalculator + MarginCalculator into a single call.
 */

import { calculateFairOdds } from './FairOddsCalculator.mjs';
import { applyMargin, priceExclusiveOutcomes, MIN_DECIMAL_ODDS } from './MarginCalculator.mjs';
import { createSelectionPrice } from '../models/SelectionPrice.mjs';
import { PRICING_CONFIG } from '../../engines/pricingConfig.mjs';

function applyOddsCap(margined, maxOdds = PRICING_CONFIG.MAX_ODDS) {
  const cap = Number.isFinite(maxOdds) && maxOdds > MIN_DECIMAL_ODDS
    ? maxOdds
    : PRICING_CONFIG.MAX_ODDS;
  if (margined.odds <= cap) {
    return margined;
  }
  const odds = Number(cap.toFixed(PRICING_CONFIG.DECIMAL_PRECISION));
  return {
    ...margined,
    odds,
    finalProbability: Number((1 / odds).toFixed(8)),
  };
}

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
export function priceSelection({ selectionId, name, probability, overround, maxOdds }) {
  const fairOdds = calculateFairOdds(probability);
  const margined = applyOddsCap(applyMargin(probability, overround), maxOdds);

  return createSelectionPrice({
    selectionId,
    name,
    probability,
    fairOdds,
    margin: margined.margin,
    finalProbability: margined.finalProbability,
    odds: margined.odds,
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
    selections: result.selections.map((sel) => {
      const margined = applyOddsCap({
        ...sel,
        finalProbability: sel.finalProbability ?? (1 / sel.odds),
      });
      return createSelectionPrice({
        ...sel,
        fairOdds: calculateFairOdds(sel.probability),
        odds: margined.odds,
        finalProbability: margined.finalProbability,
      });
    }),
  };
}
