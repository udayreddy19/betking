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

/**
 * Applies margin to a pair of fair probabilities.
 * 
 * @param {number} probability - Raw probability for this selection (0 < p < 1)
 * @param {number} overround   - Overround fraction (e.g. 0.05)
 * @returns {{ finalProbability: number, odds: number, margin: number }}
 */
export function applyMargin(probability, overround) {
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) {
    throw new Error(`MarginCalculator: invalid probability ${probability}`);
  }
  if (!Number.isFinite(overround) || overround < 0 || overround > 1) {
    throw new Error(`MarginCalculator: invalid overround ${overround}`);
  }

  const finalProbability = probability * (1 + overround);
  // Floor: odds must always be > 1.0 (minimum 1.01)
  const rawOdds = 1 / finalProbability;
  const odds = Math.max(1.01, rawOdds);

  return {
    finalProbability: Math.min(finalProbability, 1 / 1.01), // Cap at odds floor
    odds,
    margin: overround,
  };
}
