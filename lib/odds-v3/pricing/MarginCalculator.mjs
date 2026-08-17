/**
 * OddsEngineV3 — MarginCalculator
 * 
 * Applies bookmaker overround (margin) to fair probabilities.
 * 
 * ═══════════════════════════════════════════════════════════════
 * MARGIN FORMULA (Proportional Method)
 * ═══════════════════════════════════════════════════════════════
 * 
 * Given:
 *   P1 = raw probability of selection 1
 *   P2 = raw probability of selection 2
 *   P1 + P2 = 1.0
 *   overround = configured margin (e.g. 0.05 for 5%)
 * 
 * Margined probabilities:
 *   P1_margined = P1 * (1 + overround)
 *   P2_margined = P2 * (1 + overround)
 * 
 * Margined odds:
 *   odds1 = 1 / P1_margined
 *   odds2 = 1 / P2_margined
 * 
 * Verification:
 *   (1/odds1) + (1/odds2) = P1_margined + P2_margined = 1 + overround
 * 
 * This is the standard "proportional" or "balanced" margin method
 * used by most sportsbooks. Each selection's implied probability
 * is inflated equally by the overround proportion.
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * Default margin configuration.
 * All values are overround fractions (e.g. 0.05 = 5%).
 */
export const DEFAULT_MARGIN_CONFIG = Object.freeze({
  liveMatchWinnerOverround: 0.05,
  liveTeamTotalOverround: 0.055,
  liveMatchTotalOverround: 0.055,
});

/** Decimal odds must never be 1.00 — that is a lock the book would pay at even money. */
export const MIN_DECIMAL_ODDS = 1.01;
const MAX_MARGINED_PROBABILITY = 1 / MIN_DECIMAL_ODDS;

/**
 * Applies margin to a pair of fair probabilities.
 * 
 * @param {number} probability - Raw probability for this selection (0 < p < 1)
 * @param {number} overround   - Overround fraction (e.g. 0.05)
 * @returns {{ finalProbability: number, odds: number, margin: number }}
 */
export function applyMargin(probability, overround) {
  if (typeof probability !== 'number' || !Number.isFinite(probability) || Number.isNaN(probability)) {
    throw new Error(`MarginCalculator: invalid probability ${probability} (non-finite or NaN)`);
  }
  if (probability <= 0 || probability >= 1) {
    throw new Error(`MarginCalculator: invalid probability ${probability} (must be in range (0, 1))`);
  }
  if (typeof overround !== 'number' || !Number.isFinite(overround) || Number.isNaN(overround) || overround < 0 || overround > 1) {
    throw new Error(`MarginCalculator: invalid overround ${overround}`);
  }

  // Cap so displayed odds are always >= 1.01 (never 1.00 / 1.0001 rounded to 1.00)
  const unroundedFinalP = probability * (1 + overround);
  const finalProbability = Math.min(MAX_MARGINED_PROBABILITY, unroundedFinalP);
  const odds = 1 / finalProbability;

  if (!Number.isFinite(odds) || Number.isNaN(odds) || odds <= 1.0) {
    throw new Error(`MarginCalculator: invalid calculated odds ${odds} for probability ${probability}`);
  }

  return {
    finalProbability,
    odds: Number(odds.toFixed(4)),
    margin: overround,
  };
}
