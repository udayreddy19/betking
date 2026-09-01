/**
 * Record settled cricket observations for death-over / player-prop calibration.
 * Shadow until productionSettledObservations is non-zero.
 */

import { query } from '../db/pg.js';

async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS odds_settlement_observations (
      observation_id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL,
      market_id TEXT NOT NULL,
      selection_id TEXT,
      regime TEXT,
      quoted_probability NUMERIC,
      outcome TEXT NOT NULL,
      settled_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => null);
}

export function classifyCricketRegime({ oversCompleted, ballsPerInnings = 120 } = {}) {
  const overs = Number(oversCompleted);
  if (!Number.isFinite(overs)) return 'UNKNOWN';
  if (overs < 6) return 'POWERPLAY';
  const deathStart = (ballsPerInnings / 6) - 4;
  if (overs >= deathStart) return 'DEATH_OVERS';
  return 'MIDDLE';
}

export async function recordSettlementObservation({
  betId,
  matchId,
  marketId,
  selectionId,
  quotedProbability,
  outcome,
  oversCompleted,
}) {
  if (!matchId || !marketId || !outcome) return null;
  await ensureSchema();
  const id = `obs_${betId || matchId}_${marketId}_${Date.now()}`;
  const regime = classifyCricketRegime({ oversCompleted });
  await query(
    `INSERT INTO odds_settlement_observations (
       observation_id, match_id, market_id, selection_id, regime, quoted_probability, outcome
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (observation_id) DO NOTHING`,
    [id, matchId, marketId, selectionId || null, regime, quotedProbability ?? null, String(outcome).toUpperCase()],
  ).catch(() => null);
  return { id, regime };
}

export async function getCalibrationSummary() {
  await ensureSchema();
  const res = await query(`
    SELECT regime, count(*)::int AS n
    FROM odds_settlement_observations
    GROUP BY regime
  `).catch(() => ({ rows: [] }));
  const total = res.rows.reduce((s, r) => s + Number(r.n || 0), 0);
  return {
    productionSettledObservations: total,
    byRegime: res.rows,
    playerPropsLive: total >= 200,
    deathOversLive: (res.rows.find((r) => r.regime === 'DEATH_OVERS')?.n || 0) >= 80,
    status: total === 0 ? 'SHADOW_EVALUATION' : 'COLLECTING',
  };
}

export async function shouldExposeDeathOverMarkets() {
  const s = await getCalibrationSummary();
  return s.deathOversLive;
}
