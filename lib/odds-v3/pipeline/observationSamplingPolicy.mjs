/**
 * OddsEngineV3 — Observation Sampling & Deduplication Policy
 * 
 * Determines whether a real-time market quote tick warrants persisting as a learning observation.
 * Generates deterministic SHA-256 fingerprints to prevent duplicate observation storage.
 */

import crypto from 'crypto';

const DEFAULT_POLICY_CONFIG = {
  minProbabilityDelta: 0.02,
  heartbeatIntervalMs: 60000,
  minVolatilityDelta: 0.05,
};

/**
 * Computes a deterministic observation fingerprint to prevent duplicate inserts.
 */
export function computeObservationFingerprint({
  canonicalEventId,
  marketType,
  selection,
  canonicalStateHash,
  modelVersion,
  probability,
}) {
  const probBucket = (Math.floor(probability * 100) / 100).toFixed(2);
  const rawKey = `${canonicalEventId}_${marketType}_${selection}_${canonicalStateHash}_${modelVersion}_${probBucket}`;
  return crypto.createHash('sha256').update(rawKey).digest('hex').substring(0, 24);
}

/**
 * Evaluates whether an observation should be sampled and persisted.
 */
export function shouldSampleObservation({
  lastObservation = null,
  currentProbability = 0.50,
  currentRegime = 'NORMAL_LIVE',
  currentVolatility = 0.05,
  canonicalStateChanged = false,
  hasChangePoint = false,
  policyConfig = DEFAULT_POLICY_CONFIG,
} = {}) {
  const cfg = { ...DEFAULT_POLICY_CONFIG, ...policyConfig };

  // First observation for this market/selection -> ALWAYS SAMPLE
  if (!lastObservation) {
    return { shouldSample: true, reason: 'INITIAL_MARKET_OBSERVATION' };
  }

  // 1. Canonical match state changed (runs, wickets, balls, goals)
  if (canonicalStateChanged) {
    return { shouldSample: true, reason: 'CANONICAL_MATCH_STATE_CHANGED' };
  }

  // 2. Change-point detector triggered
  if (hasChangePoint) {
    return { shouldSample: true, reason: 'CHANGE_POINT_DETECTED' };
  }

  // 3. Operational regime shifted (e.g., POWERPLAY -> DEATH_OVERS)
  if (lastObservation.regime && lastObservation.regime !== currentRegime) {
    return { shouldSample: true, reason: `REGIME_SHIFT_${currentRegime}` };
  }

  // 4. Probability delta exceeds threshold
  const probDelta = Math.abs(currentProbability - (lastObservation.probability || 0));
  if (probDelta >= cfg.minProbabilityDelta) {
    return { shouldSample: true, reason: `PROBABILITY_DELTA_${probDelta.toFixed(4)}` };
  }

  // 5. Heartbeat interval expired (prevent observation starvation)
  const now = Date.now();
  const lastTs = new Date(lastObservation.timestamp || 0).getTime();
  if (now - lastTs >= cfg.heartbeatIntervalMs) {
    return { shouldSample: true, reason: 'HEARTBEAT_INTERVAL_EXPIRED' };
  }

  return { shouldSample: false, reason: 'SUPPRESSED_IDENTICAL_TICK' };
}
