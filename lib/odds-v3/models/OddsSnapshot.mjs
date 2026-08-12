/**
 * OddsEngineV3 — OddsSnapshot Model
 * 
 * The single, immutable output contract for OddsEngineV3.
 */

/**
 * @typedef {Object} OddsSnapshot
 * @property {'OddsEngineV3'} engine
 * @property {'3.0.0'} engineVersion
 * @property {string} matchId
 * @property {number} stateVersion
 * @property {number} generatedAt    - Unix timestamp (ms)
 * @property {string} status         - 'OK' | 'INVALID_STATE' | 'DETERMINED'
 * @property {import('./MarketDefinition.mjs').MarketDefinition[]} markets
 */

export const ENGINE_NAME = 'OddsEngineV3';
export const ENGINE_VERSION = '3.0.0';

/**
 * Creates an immutable OddsSnapshot.
 */
export function createOddsSnapshot({ matchId, stateVersion, status, markets = [] }) {
  return Object.freeze({
    engine: ENGINE_NAME,
    engineVersion: ENGINE_VERSION,
    matchId: String(matchId),
    stateVersion: Number(stateVersion),
    generatedAt: Date.now(),
    status: String(status),
    markets: Object.freeze(markets.map(m => Object.freeze({ ...m }))),
  });
}
