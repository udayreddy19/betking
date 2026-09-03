/**
 * OddsEngineV3 — MarketDefinition Model
 * 
 * Defines the structure of a single market within an OddsSnapshot.
 */

/**
 * @typedef {Object} MarketDefinition
 * @property {string} marketId       - Unique market identifier (e.g. "match_winner")
 * @property {string} marketType     - Market type category (e.g. "MATCH_WINNER", "TEAM_TOTAL", "MATCH_TOTAL")
 * @property {string} name           - Human-readable market name
 * @property {'OPEN'|'SUSPENDED'|'DETERMINED'|'SETTLED'|'UNAVAILABLE'} status
 * @property {number|null} line      - The over/under line (null for winner markets)
 * @property {import('./SelectionPrice.mjs').SelectionPrice[]} selections
 */

/**
 * Creates an immutable MarketDefinition.
 */
export function createMarketDefinition({
  marketId,
  marketType,
  name,
  status,
  line = null,
  selections = [],
  category = null,
  overround = null,
}) {
  const def = {
    marketId: String(marketId),
    marketType: String(marketType),
    name: String(name),
    status: String(status),
    line: line != null ? Number(line) : null,
    selections: Object.freeze(selections.map((s) => Object.freeze({ ...s }))),
  };
  if (category) def.category = String(category);
  if (Number.isFinite(overround)) def.overround = Number(overround);
  return Object.freeze(def);
}
