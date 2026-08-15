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
 * @property {number} oddsVersion
 * @property {number} generatedAt    - Unix timestamp (ms)
 * @property {string} expiresAt      - ISO timestamp
 * @property {string} status         - 'OK' | 'INVALID_STATE' | 'DETERMINED' | 'SUSPENDED' | 'NOT_AVAILABLE'
 * @property {import('./MarketDefinition.mjs').MarketDefinition[]} markets
 */

export const ENGINE_NAME = 'OddsEngineV3';
export const ENGINE_VERSION = '3.0.0';
export const DEFAULT_SNAPSHOT_TTL_MS = 10_000;

let oddsVersionSeq = 0;

/**
 * Creates an immutable OddsSnapshot.
 */
export function createOddsSnapshot({
  matchId,
  stateVersion,
  status,
  markets = [],
  oddsVersion,
  ttlMs = DEFAULT_SNAPSHOT_TTL_MS,
  suspensionReason = null,
} = {}) {
  const generatedAt = Date.now();
  const version = oddsVersion != null
    ? Number(oddsVersion)
    : (oddsVersionSeq += 1);

  return Object.freeze({
    engine: ENGINE_NAME,
    engineVersion: ENGINE_VERSION,
    matchId: String(matchId),
    stateVersion: Number(stateVersion) || 0,
    oddsVersion: version,
    generatedAt,
    expiresAt: new Date(generatedAt + Math.max(1000, ttlMs)).toISOString(),
    status: String(status),
    suspensionReason: suspensionReason || null,
    markets: Object.freeze(markets.map((m) => Object.freeze({ ...m }))),
  });
}
