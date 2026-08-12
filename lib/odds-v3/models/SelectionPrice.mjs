/**
 * OddsEngineV3 — SelectionPrice Model
 * 
 * Represents a single priced selection within a market.
 * Every intermediate calculation step is exposed for full transparency.
 */

/**
 * @typedef {Object} SelectionPrice
 * @property {string} selectionId
 * @property {string} name
 * @property {number} probability      - Raw model probability (0 < p < 1)
 * @property {number} fairOdds         - 1 / probability
 * @property {number} margin           - Overround applied to this selection
 * @property {number} finalProbability  - Probability after margin injection
 * @property {number} odds             - Final display odds
 */

/**
 * Creates an immutable SelectionPrice.
 */
export function createSelectionPrice({ selectionId, name, probability, fairOdds, margin, finalProbability, odds }) {
  return Object.freeze({
    selectionId: String(selectionId),
    name: String(name),
    probability: Number(probability),
    fairOdds: Number(fairOdds),
    margin: Number(margin),
    finalProbability: Number(finalProbability),
    odds: Number(odds),
  });
}
