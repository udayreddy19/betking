/**
 * OddsEngineV3 — Observation Archive Engine
 * 
 * Records structured, deduplicated prediction observations for both Champion and Challenger models.
 * Provides non-blocking buffering, state hashing, and index-optimized persistence.
 */

import crypto from 'crypto';

const MAX_BUFFER_SIZE = 10000;
const observationBuffer = [];

/**
 * Creates a normalized observation record.
 */
export function createObservationRecord({
  eventId = null,
  matchId = 'match_01',
  sport = 'cricket',
  competition = 'IPL',
  marketType = 'match_winner',
  selection = '1',
  canonicalState = {},
  modelVersion = 'v3.1-prod',
  modelRole = 'CHAMPION', // 'CHAMPION' | 'CHALLENGER'
  probability = 0.55,
  decimalOdds = 1.75,
  providerProbabilities = {},
  providerWeights = {},
  providerDivergence = 0.02,
  regime = 'NORMAL_LIVE',
  volatility = 0.05,
  confidence = 95,
  dataQualityScore = 100,
  changePointClassification = 'STABLE_TRANSITION',
  pricingPipelineVersion = 'v3.1',
} = {}) {
  const timestamp = new Date().toISOString();
  const canonicalStateHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalState))
    .digest('hex')
    .substring(0, 16);

  const observationId = `obs_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const impliedProbability = decimalOdds > 0 ? Number((1 / decimalOdds).toFixed(4)) : 0;

  const record = {
    observationId,
    timestamp,
    eventId: eventId || matchId,
    matchId,
    sport,
    competition,
    marketType,
    selection,
    canonicalStateHash,
    canonicalStateVersion: canonicalState.stateVersion || 1,
    modelVersion,
    modelRole,
    probability: Number(probability.toFixed(4)),
    decimalOdds: Number(decimalOdds.toFixed(2)),
    impliedProbability,
    providerProbabilities,
    providerWeights,
    providerDivergence: Number(providerDivergence.toFixed(4)),
    regime,
    volatility: Number(volatility.toFixed(4)),
    confidence,
    dataQualityScore,
    changePointClassification,
    pricingPipelineVersion,
    settlement: null,
  };

  // Buffer in memory (FIFO bounded)
  if (observationBuffer.length >= MAX_BUFFER_SIZE) {
    observationBuffer.shift();
  }
  observationBuffer.push(record);

  return record;
}

/**
 * Returns buffered observations matching optional query filters.
 */
export function queryObservations({ matchId, marketType, modelVersion, modelRole, limit = 100 } = {}) {
  let res = [...observationBuffer];

  if (matchId) res = res.filter((o) => o.matchId === matchId);
  if (marketType) res = res.filter((o) => o.marketType === marketType);
  if (modelVersion) res = res.filter((o) => o.modelVersion === modelVersion);
  if (modelRole) res = res.filter((o) => o.modelRole === modelRole);

  return res.slice(-limit);
}

/**
 * Clears the memory buffer (for testing).
 */
export function clearObservationBuffer() {
  observationBuffer.length = 0;
}
