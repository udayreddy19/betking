/**
 * OddsEngineV3 — Durable Odds Persister (PostgreSQL Cold Store)
 * 
 * Safely persists observation batches into `odds_observations` table.
 * Guarantees zero pricing latency impact or financial interruption if database is slow or down.
 */

import { query } from '../../../db/pg.js';

/**
 * Persists an array of observation records in batch.
 * 
 * @param {Array<Object>} observations
 * @returns {Promise<{ insertedCount: number, error?: string }>}
 */
export async function persistObservationBatch(observations = []) {
  if (!Array.isArray(observations) || observations.length === 0) {
    return { insertedCount: 0 };
  }

  const valid = observations.filter((o) => o && o.matchId && o.marketId && o.selectionId);
  if (valid.length === 0) {
    return { insertedCount: 0 };
  }

  try {
    const valuePlaceholders = [];
    const values = [];
    let paramIndex = 1;

    for (const obs of valid) {
      const obsId = obs.observationId || `obs_${obs.matchId}_${obs.marketId}_${obs.selectionId}_${obs.timestamp || Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const ts = Number(obs.timestamp || Date.now());
      const prob = Number(obs.predictionProbability ?? obs.modelProbability ?? 0.5);
      const odds = Number(obs.publishedOdds ?? obs.newOdds ?? 2.0);
      const margin = Number(obs.margin ?? 0.05);

      valuePlaceholders.push(`(
        $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++},
        $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++},
        $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++},
        $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++},
        $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++},
        $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}
      )`);

      values.push(
        obsId,
        ts,
        String(obs.matchId),
        String(obs.sport || 'cricket').toLowerCase(),
        String(obs.league || 'general'),
        String(obs.marketId || obs.market),
        String(obs.selectionId || obs.selection),
        obs.matchState ? JSON.stringify(obs.matchState) : null,
        obs.providerInputs ? JSON.stringify(obs.providerInputs) : null,
        Number.isFinite(obs.providerOdds) ? obs.providerOdds : null,
        Number.isFinite(obs.providerConsensus) ? obs.providerConsensus : null,
        String(obs.providerUsed || 'consensus'),
        prob,
        Number.isFinite(obs.blendedProbability) ? obs.blendedProbability : prob,
        odds,
        margin,
        Number(obs.liabilityShading || 0),
        String(obs.engineVersion || '3.0.0'),
        String(obs.modelVersion || 'v3.1-prod'),
        String(obs.parameterVersion || 'params_v1.0_prod'),
        Number(obs.providerLatency || 0),
        obs.feedTimestamp ? Number(obs.feedTimestamp) : null,
        obs.processingTimestamp ? Number(obs.processingTimestamp) : null,
        obs.qualityResult ? JSON.stringify(obs.qualityResult) : null,
        Number.isFinite(obs.previousOdds) ? obs.previousOdds : null,
        Number.isFinite(obs.newOdds) ? obs.newOdds : null,
        Number.isFinite(obs.oddsDelta) ? obs.oddsDelta : null,
        Number.isFinite(obs.movementPercent) ? obs.movementPercent : null,
        obs.suspensionReason ? String(obs.suspensionReason) : null,
        String(obs.settledOutcome || 'UNKNOWN')
      );
    }

    const sql = `
      INSERT INTO odds_observations (
        observation_id, timestamp, match_id, sport, league,
        market, selection, match_state, provider_inputs, provider_odds,
        provider_consensus, provider_used, model_probability, blended_probability, published_odds,
        margin, liability_shading, engine_version, model_version, parameter_version,
        provider_latency_ms, feed_timestamp, processing_timestamp, quality_result, previous_odds,
        new_odds, odds_delta, movement_percent, suspension_reason, settled_outcome
      ) VALUES ${valuePlaceholders.join(', ')}
      ON CONFLICT (observation_id) DO NOTHING
    `;

    const res = await query(sql, values);
    return { insertedCount: res?.rowCount || valid.length };
  } catch (err) {
    // Non-blocking fallback: never throw to caller
    return { insertedCount: 0, error: err.message };
  }
}

/**
 * Queries persisted observations from PostgreSQL.
 */
export async function queryPersistedObservations({
  sport,
  market,
  matchId,
  settledOnly = false,
  limit = 500,
} = {}) {
  try {
    let sql = `SELECT * FROM odds_observations WHERE 1=1`;
    const params = [];
    let idx = 1;

    if (sport) {
      sql += ` AND sport = $${idx++}`;
      params.push(String(sport).toLowerCase());
    }
    if (market) {
      sql += ` AND market = $${idx++}`;
      params.push(String(market));
    }
    if (matchId) {
      sql += ` AND match_id = $${idx++}`;
      params.push(String(matchId));
    }
    if (settledOnly) {
      sql += ` AND settled_outcome IN ('WIN', 'LOSE', 'PUSH', 'VOID')`;
    }

    sql += ` ORDER BY timestamp DESC LIMIT $${idx++}`;
    params.push(Math.min(limit, 5000));

    const res = await query(sql, params);
    return res?.rows || [];
  } catch (err) {
    return [];
  }
}
