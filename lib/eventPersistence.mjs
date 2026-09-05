/**
 * Event Persistence & Historical Backfill Engine
 * Ensures every live match and every placed bet event is persistently
 * stored and retrievable from PostgreSQL, eliminating reliance on ephemeral memory/Redis.
 */

import { query, queryRead } from '../db/pg.js';
import { inferWallClockMatchFinal } from './settlement/wallClockFinality.mjs';

export async function upsertPersistentMatch(match) {
  if (!match) return null;
  const matchId = String(match.id || match.matchId || '').trim();
  if (!matchId) return null;

  const competition = match.competition || match.league || match.seriesName || 'Default League';
  const team1Name = match.team1?.name || match.team1 || match.homeTeam || 'Team 1';
  const team2Name = match.team2?.name || match.team2 || match.awayTeam || 'Team 2';
  const startTime = match.startTime || match.start_time || new Date().toISOString();
  const status = match.status
    || (match.isCompleted || String(match.matchState || '').toLowerCase() === 'post' ? 'COMPLETED'
      : (match.isLive ? 'LIVE' : 'SCHEDULED'));
  const score1 = String(match.liveDetails?.score1 ?? match.liveDetails?.firstRuns ?? match.liveDetails?.runs ?? match.team1?.runs ?? '');
  const score2 = String(match.liveDetails?.score2 ?? match.liveDetails?.chaseRuns ?? match.team2?.runs ?? '');

  const sql = `
    INSERT INTO matches (
      match_id, competition_id, team1_id, team2_id, start_time, status, live_score1, live_score2, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (match_id) DO UPDATE SET
      competition_id = COALESCE(EXCLUDED.competition_id, matches.competition_id),
      team1_id = COALESCE(EXCLUDED.team1_id, matches.team1_id),
      team2_id = COALESCE(EXCLUDED.team2_id, matches.team2_id),
      status = EXCLUDED.status,
      live_score1 = CASE WHEN EXCLUDED.live_score1 <> '' THEN EXCLUDED.live_score1 ELSE matches.live_score1 END,
      live_score2 = CASE WHEN EXCLUDED.live_score2 <> '' THEN EXCLUDED.live_score2 ELSE matches.live_score2 END,
      updated_at = NOW()
    RETURNING *;
  `;

  try {
    const res = await query(sql, [
      matchId,
      competition,
      team1Name,
      team2Name,
      startTime,
      status,
      score1,
      score2,
    ]);
    return res.rows[0];
  } catch (err) {
    // Non-blocking in case of concurrent writes
    return null;
  }
}

/**
 * Backfills matches table from bets.placement_snapshot and match_over_snapshots
 */
export async function backfillMatchesFromPlacedBets() {
  try {
    const betMatches = await queryRead(`
      SELECT DISTINCT
        b.match_id,
        b.placement_snapshot,
        b.created_at
      FROM bets b
      WHERE b.match_id IS NOT NULL
    `);

    let backfilled = 0;
    for (const row of betMatches.rows) {
      const matchId = row.match_id;
      const snap = row.placement_snapshot;
      const leg = snap?.legs?.[0] || {};
      
      const team1Name = leg.team1Name || 'Team 1';
      const team2Name = leg.team2Name || 'Team 2';
      const league = leg.league || snap?.league || 'Cricket League';
      const startTime = snap?.capturedAt || row.created_at || new Date().toISOString();

      const sql = `
        INSERT INTO matches (
          match_id, competition_id, team1_id, team2_id, start_time, status, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'COMPLETED', NOW())
        ON CONFLICT (match_id) DO NOTHING;
      `;
      await query(sql, [matchId, league, team1Name, team2Name, startTime]);
      backfilled++;
    }
    return { backfilled };
  } catch (err) {
    console.error('[EventPersistence] Backfill error:', err.message);
    return { backfilled: 0, error: err.message };
  }
}

export function inferPersistedSport(competition = '', team1 = '', team2 = '') {
  const text = `${competition} ${team1} ${team2}`.toLowerCase();
  if (/snooker/.test(text)) return 'snooker';
  if (/\btennis\b|\batp\b|\bwta\b/.test(text)) return 'tennis';
  if (/soccer|premier league|la liga|serie a|bundesliga|ligue|champions league|mls\b/.test(text)) return 'soccer';
  if (/nba|wnba|basket/.test(text)) return 'basketball';
  return 'cricket';
}

/**
 * Robust fallback to reconstruct a match from bets placement snapshot and snapshots
 */
export async function reconstructMatchFromDb(matchId) {
  if (!matchId) return null;
  try {
    // 1. Direct matches table query
    const mRes = await queryRead(
      `SELECT * FROM matches WHERE match_id = $1 LIMIT 1`,
      [matchId]
    );
    if (mRes.rows.length > 0) {
      const row = mRes.rows[0];
      const s1 = Number(row.live_score1) || 0;
      const s2 = Number(row.live_score2) || 0;
      const startTime = row.start_time ? new Date(row.start_time).getTime() : 0;
      const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : 0;
      const now = Date.now();
      const probe = {
        league: row.competition_id,
        competition: row.competition_id,
        status: row.status,
        startTime: row.start_time,
        updatedAt: row.updated_at,
        isLive: String(row.status || '').toUpperCase() === 'LIVE',
        matchState: String(row.status || '').toUpperCase() === 'LIVE' ? 'in' : undefined,
        score1: s1,
        score2: s2,
      };
      // Never persist wall-clock COMPLETED into matches — that permanently breaks County/Test.
      // In-memory finality only, and only for short formats via shared helper.
      const isStaleLive = inferWallClockMatchFinal(probe, { startTime, updatedAt, s1, s2, now });
      const isFinal = ['COMPLETED', 'FINISHED', 'FINAL', 'CLOSED', 'SETTLED', 'HISTORICAL'].includes(String(row.status).toUpperCase()) || isStaleLive;
      const sport = inferPersistedSport(row.competition_id, row.team1_id, row.team2_id);
      const cricket = !sport || sport.includes('cricket');

      return {
        id: row.match_id,
        matchId: row.match_id,
        sport,
        competition: row.competition_id,
        league: row.competition_id,
        team1: { id: row.team1_id, name: row.team1_id, shortName: row.team1_id },
        team2: { id: row.team2_id, name: row.team2_id, shortName: row.team2_id },
        homeTeam: { id: row.team1_id, name: row.team1_id, shortName: row.team1_id },
        awayTeam: { id: row.team2_id, name: row.team2_id, shortName: row.team2_id },
        matchName: `${row.team1_id} vs ${row.team2_id}`,
        status: isFinal ? 'COMPLETED' : row.status,
        matchState: isFinal ? 'post' : 'in',
        isLive: !isFinal,
        isCompleted: isFinal,
        startTime: row.start_time,
        score1: s1,
        score2: s2,
        liveDetails: {
          score1: row.live_score1,
          score2: row.live_score2,
          ...(cricket ? {
            firstRuns: Number(row.live_score1) || undefined,
            chaseRuns: Number(row.live_score2) || undefined,
          } : {}),
        },
        source: 'POSTGRESQL_MATCHES',
      };
    }

    // 2. Bets placement snapshot query
    const betRes = await queryRead(
      `SELECT placement_snapshot, created_at, status FROM bets WHERE match_id = $1 AND placement_snapshot IS NOT NULL LIMIT 1`,
      [matchId]
    );
    if (betRes.rows.length > 0) {
      const snap = betRes.rows[0].placement_snapshot;
      const leg = snap?.legs?.[0] || {};
      const team1 = leg.team1Name || 'Team 1';
      const team2 = leg.team2Name || 'Team 2';
      const league = leg.league || snap?.league || 'Cricket League';
      const sport = leg.sport || snap?.sport || 'cricket';

      // Check over snapshots for score
      const snapRes = await queryRead(
        `SELECT innings, over_num, score_at_end, wickets_at_end FROM match_over_snapshots WHERE match_id = $1 ORDER BY innings DESC, over_num DESC LIMIT 1`,
        [matchId]
      ).catch(() => ({ rows: [] }));

      const latestOver = snapRes.rows[0];
      const matchState = {
        id: matchId,
        matchId,
        sport,
        league,
        competition: league,
        team1: { name: team1 },
        team2: { name: team2 },
        matchName: leg.matchName || `${team1} vs ${team2}`,
        status: 'HISTORICAL',
        matchState: 'post',
        isLive: false,
        isCompleted: true,
        startTime: snap?.capturedAt || betRes.rows[0].created_at,
        liveDetails: latestOver ? {
          runs: latestOver.score_at_end,
          wickets: latestOver.wickets_at_end,
          overs: String(latestOver.over_num),
          inningsId: latestOver.innings,
          commentary: 'Historical match loaded from immutable ledger snapshots.',
        } : {
          commentary: 'Historical match loaded from placed bet snapshot.',
        },
        source: 'POSTGRESQL_PLACED_BET_SNAPSHOT',
      };

      // Also persist to matches table for future fast lookups
      await upsertPersistentMatch(matchState);
      return matchState;
    }

    return null;
  } catch (err) {
    console.error('[EventPersistence] reconstructMatchFromDb failed:', err.message);
    return null;
  }
}
