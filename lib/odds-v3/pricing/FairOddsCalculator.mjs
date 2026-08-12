/**
 * OddsEngineV3 — FairOddsCalculator
 * 
 * Converts raw probabilities to fair odds.
 * Formula: fairOdds = 1 / probability
 * 
 * No rounding. No margin. Pure mathematical conversion.
 */

/**
 * @param {number} probability - Must be in (0, 1)
 * @returns {number} Fair odds (always > 1)
 */
export function calculateFairOdds(probability) {
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) {
    throw new Error(`FairOddsCalculator: invalid probability ${probability}`);
  }
  return 1 / probability;
}
