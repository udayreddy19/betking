/**
 * Persist batting score at cricket over boundaries so next-over markets can settle
 * as soon as that over completes (without waiting for match end).
 */

import { query } from '../db/pg.js';
import { isSecondInnings } from './odds-v3/buildCanonicalFromMatch.mjs';

let ensured = false;

export async function ensureMatchOverSnapshotsTable() {
  if (ensured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS match_over_snapshots (
      match_id VARCHAR(128) NOT NULL,
      innings INT NOT NULL DEFAULT 1,
      over_num INT NOT NULL,
      score_at_end INT NOT NULL DEFAULT 0,
      wickets_at_end INT NOT NULL DEFAULT 0,
      overs_raw VARCHAR(16),
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (match_id, innings, over_num)
    );
  `);
  ensured = true;
}

export function parseOversParts(oversStr) {
  const raw = String(oversStr ?? '').trim();
  if (!raw) return null;
  const m = raw.match(/^(\d+)(?:\.(\d+))?$/);
  if (!m) return null;
  const completed = Number(m[1]);
  const balls = Number(m[2] || 0);
  if (!Number.isFinite(completed) || completed < 0) return null;
  return { completed, balls, raw };
}

export function getBattingOversAndScore(match) {
  const ld = match?.liveDetails || {};
  const isSecond = isSecondInnings(match, ld);

  if (isSecond) {
    const chaseName = String(ld.chaseTeamName || '');
    const t1 = match?.team1?.name || '';
    const t2 = match?.team2?.name || '';
    const chaseIsTeam1 = chaseName && t1
      && (chaseName.toLowerCase() === t1.toLowerCase()
        || String(match?.team1?.shortName || '').toLowerCase() === chaseName.toLowerCase());
    const chaseIsTeam2 = chaseName && t2
      && (chaseName.toLowerCase() === t2.toLowerCase()
        || String(match?.team2?.shortName || '').toLowerCase() === chaseName.toLowerCase());
    if (chaseIsTeam1) {
      return {
        innings: 2,
        oversStr: ld.chaseOvers ?? ld.overs ?? match?.team1?.overs ?? null,
        score: Number(ld.chaseRuns ?? match?.team1?.runs ?? 0) || 0,
        wickets: Number(ld.chaseWickets ?? match?.team1?.wickets ?? 0) || 0,
      };
    }
    if (chaseIsTeam2) {
      return {
        innings: 2,
        oversStr: ld.chaseOvers ?? ld.overs2 ?? match?.team2?.overs ?? null,
        score: Number(ld.chaseRuns ?? match?.team2?.runs ?? 0) || 0,
        wickets: Number(ld.chaseWickets ?? match?.team2?.wickets ?? 0) || 0,
      };
    }
    return {
      innings: 2,
      oversStr: ld.chaseOvers ?? ld.overs2 ?? match?.team2?.overs ?? null,
      score: Number(ld.chaseRuns ?? match?.team2?.runs ?? match?.score2 ?? 0) || 0,
      wickets: Number(ld.chaseWickets ?? match?.team2?.wickets ?? 0) || 0,
    };
  }

  const firstName = String(ld.firstTeamName || '');
  const t1 = match?.team1?.name || '';
  const t2 = match?.team2?.name || '';
  const firstIsTeam2 = firstName && t2
    && (firstName.toLowerCase() === t2.toLowerCase()
      || String(match?.team2?.shortName || '').toLowerCase() === firstName.toLowerCase());
  if (firstIsTeam2) {
    return {
      innings: 1,
      oversStr: ld.firstOvers ?? ld.overs ?? match?.team2?.overs ?? null,
      score: Number(ld.firstRuns ?? ld.runs ?? match?.team2?.runs ?? 0) || 0,
      wickets: Number(ld.firstWickets ?? ld.wickets ?? match?.team2?.wickets ?? 0) || 0,
    };
  }

  // Unlabeled: prefer the side that is actually scoring
  const t1Runs = Number(match?.team1?.runs ?? 0) || 0;
  const t2Runs = Number(match?.team2?.runs ?? 0) || 0;
  if (t2Runs > 0 && t1Runs === 0) {
    return {
      innings: 1,
      oversStr: ld.firstOvers ?? ld.overs ?? match?.team2?.overs ?? null,
      score: Number(ld.firstRuns ?? ld.runs ?? t2Runs) || 0,
      wickets: Number(ld.firstWickets ?? ld.wickets ?? match?.team2?.wickets ?? 0) || 0,
    };
  }

  return {
    innings: 1,
    oversStr: ld.firstOvers ?? ld.overs ?? match?.team1?.overs ?? null,
    score: Number(ld.firstRuns ?? ld.runs ?? match?.team1?.runs ?? match?.score1 ?? 0) || 0,
    wickets: Number(ld.firstWickets ?? ld.wickets ?? match?.team1?.wickets ?? 0) || 0,
  };
}

/**
 * Record score snapshots for completed overs.
 * At 13.4 we know overs 1..13 are complete — upsert score for over 13 using current score
 * ONLY when balls===0 (exact boundary). When mid-over, only backfill earlier overs if missing
 * using previous poll memory is handled by calling this every cycle at boundaries.
 *
 * Practical approach: whenever balls===0, write that completed over's score.
 * Additionally, keep a "latest" row for over_num=0 as current mid-over marker (optional skip).
 */
export async function recordMatchOverSnapshots(match) {
  if (!match?.id && !match?.matchId) return null;
  await ensureMatchOverSnapshotsTable();

  const matchId = String(match.id || match.matchId);
  const bat = getBattingOversAndScore(match);
  const parts = parseOversParts(bat.oversStr);
  if (!parts) return null;

  // Exact over boundary: N.0 → end of over N
  if (parts.balls === 0 && parts.completed > 0) {
    await query(
      `INSERT INTO match_over_snapshots
         (match_id, innings, over_num, score_at_end, wickets_at_end, overs_raw, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (match_id, innings, over_num)
       DO UPDATE SET
         score_at_end = EXCLUDED.score_at_end,
         wickets_at_end = EXCLUDED.wickets_at_end,
         overs_raw = EXCLUDED.overs_raw,
         recorded_at = NOW()`,
      [matchId, bat.innings, parts.completed, bat.score, bat.wickets, parts.raw],
    );
  }

  // Mid-over (e.g. 13.4): we know overs 1..13 finished earlier. If over 13 snapshot is missing,
  // we cannot invent it from current score. But if over (completed) snapshot missing and we
  // just crossed into a new over (balls >= 1), backfill completed over using:
  // best-effort: only when we have overHistory on the match object.
  const history = match.overHistory || match.liveDetails?.overHistory || [];
  if (Array.isArray(history) && history.length) {
    for (const row of history) {
      const overNum = Number(row.overNum || row.over || row.number);
      if (!Number.isFinite(overNum) || overNum <= 0) continue;
      const isCurrent = row.isCurrent === true;
      if (isCurrent) continue;
      let runs = row.runs;
      if (runs == null && Array.isArray(row.balls)) {
        runs = row.balls.reduce((sum, b) => {
          const s = String(b);
          if (s === 'W' || s === '•' || s === '.') return sum;
          if (/^\d+$/.test(s)) return sum + Number(s);
          return sum;
        }, 0);
      }
      if (runs == null || !Number.isFinite(Number(runs))) continue;

      // Convert per-over runs into cumulative score_at_end using previous snapshot if present
      const prev = await query(
        `SELECT score_at_end FROM match_over_snapshots
         WHERE match_id = $1 AND innings = $2 AND over_num = $3`,
        [matchId, bat.innings, overNum - 1],
      );
      const prevScore = prev.rows[0] ? Number(prev.rows[0].score_at_end) : null;
      // If we don't have previous cumulative, store sentinel via negative over? Skip cumulative —
      // store absolute runs-in-over in a side channel by using score_at_end as cumulative only when prev exists.
      if (prevScore == null && overNum > 1) {
        // Store runs-in-over as score_at_end with wickets=-1 marker? Too hacky.
        // Instead upsert a dedicated runs row via over_num and also store in overs_raw 'runs:X'
        await query(
          `INSERT INTO match_over_snapshots
             (match_id, innings, over_num, score_at_end, wickets_at_end, overs_raw, recorded_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (match_id, innings, over_num)
           DO UPDATE SET
             score_at_end = CASE
               WHEN match_over_snapshots.wickets_at_end >= 0 THEN match_over_snapshots.score_at_end
               ELSE EXCLUDED.score_at_end
             END,
             overs_raw = COALESCE(match_over_snapshots.overs_raw, EXCLUDED.overs_raw),
             recorded_at = NOW()`,
          [matchId, bat.innings, overNum, Number(runs), -1, `runs_only:${runs}`],
        );
        continue;
      }

      const cumulative = (prevScore == null ? 0 : prevScore) + Number(runs);
      await query(
        `INSERT INTO match_over_snapshots
           (match_id, innings, over_num, score_at_end, wickets_at_end, overs_raw, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (match_id, innings, over_num)
         DO UPDATE SET
           score_at_end = EXCLUDED.score_at_end,
           wickets_at_end = GREATEST(match_over_snapshots.wickets_at_end, EXCLUDED.wickets_at_end),
           overs_raw = EXCLUDED.overs_raw,
           recorded_at = NOW()`,
        [matchId, bat.innings, overNum, cumulative, bat.wickets, `hist:${overNum}`],
      );
    }
  }

  return { matchId, innings: bat.innings, ...parts, score: bat.score };
}

/** Cumulative batting score at the end of over N (from snapshots). */
export async function getScoreAtOverEnd(matchId, overNum, innings = null) {
  await ensureMatchOverSnapshotsTable();
  const id = String(matchId);
  const over = Number(overNum);
  if (!id || !Number.isFinite(over) || over <= 0) return null;

  const res = innings != null
    ? await query(
      `SELECT score_at_end, wickets_at_end, overs_raw FROM match_over_snapshots
       WHERE match_id = $1 AND innings = $2 AND over_num = $3`,
      [id, innings, over],
    )
    : await query(
      `SELECT score_at_end, wickets_at_end, overs_raw FROM match_over_snapshots
       WHERE match_id = $1 AND over_num = $2
       ORDER BY innings DESC LIMIT 1`,
      [id, over],
    );

  const row = res.rows[0];
  if (!row) return null;
  if (Number(row.wickets_at_end) < 0 || String(row.overs_raw || '').startsWith('runs_only:')) {
    return null;
  }
  const score = Number(row.score_at_end);
  return Number.isFinite(score) ? score : null;
}

export async function getRunsInOver(matchId, overNum, innings = null) {
  await ensureMatchOverSnapshotsTable();
  const id = String(matchId);
  const over = Number(overNum);
  if (!id || !Number.isFinite(over) || over <= 0) return null;

  const inningsFilter = innings != null
    ? await query(
      `SELECT innings, over_num, score_at_end, wickets_at_end, overs_raw
       FROM match_over_snapshots
       WHERE match_id = $1 AND innings = $2 AND over_num IN ($3, $4)
       ORDER BY over_num`,
      [id, innings, over - 1, over],
    )
    : await query(
      `SELECT innings, over_num, score_at_end, wickets_at_end, overs_raw
       FROM match_over_snapshots
       WHERE match_id = $1 AND over_num IN ($2, $3)
       ORDER BY innings DESC, over_num`,
      [id, over - 1, over],
    );

  const rows = inningsFilter.rows || [];
  if (!rows.length) return null;

  // Prefer highest innings if not specified
  const inn = innings != null ? Number(innings) : Number(rows[rows.length - 1].innings);
  const scoped = rows.filter((r) => Number(r.innings) === inn);
  const end = scoped.find((r) => Number(r.over_num) === over);
  if (!end) return null;

  // runs_only marker
  if (String(end.overs_raw || '').startsWith('runs_only:') || Number(end.wickets_at_end) < 0) {
    return Number(end.score_at_end);
  }

  const start = scoped.find((r) => Number(r.over_num) === over - 1);
  const endScore = Number(end.score_at_end);
  if (over === 1) return Math.max(0, endScore);
  if (!start) return null;
  return Math.max(0, endScore - Number(start.score_at_end));
}

export function isTargetOverComplete(match, overNum) {
  const bat = getBattingOversAndScore(match);
  const parts = parseOversParts(bat.oversStr);
  if (!parts) return false;
  const target = Number(overNum);
  if (!Number.isFinite(target)) return false;
  // "13.0" / "13.4" ⇒ completed overs >= 13 ⇒ over 13 is done
  return parts.completed >= target;
}

let dismissalEnsured = false;

export async function ensureMatchDismissalSnapshotsTable() {
  if (dismissalEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS match_dismissal_snapshots (
      match_id VARCHAR(128) NOT NULL,
      innings INT NOT NULL DEFAULT 1,
      wicket_num INT NOT NULL,
      score_at_dismissal INT NOT NULL DEFAULT 0,
      overs_raw VARCHAR(16),
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (match_id, innings, wicket_num)
    );
  `);
  dismissalEnsured = true;
}

/**
 * When wickets increase, record score only for newly observed dismissal numbers.
 * Never backfill older wickets with the current total (that would mis-settle FoW markets).
 */
export async function recordMatchDismissalSnapshots(match) {
  if (!match?.id && !match?.matchId) return null;
  await ensureMatchDismissalSnapshotsTable();

  const matchId = String(match.id || match.matchId);
  const bat = getBattingOversAndScore(match);
  const wickets = Math.max(0, Number(bat.wickets) || 0);
  if (wickets <= 0) return null;

  const existing = await query(
    `SELECT COALESCE(MAX(wicket_num), 0) AS max_w
     FROM match_dismissal_snapshots
     WHERE match_id = $1 AND innings = $2`,
    [matchId, bat.innings],
  );
  const prevMax = Number(existing.rows[0]?.max_w) || 0;
  if (wickets <= prevMax) return { matchId, innings: bat.innings, wickets, score: bat.score };

  // Only the latest wicket gets the current score. Older missing wickets stay unset → VOID on settle.
  await query(
    `INSERT INTO match_dismissal_snapshots
       (match_id, innings, wicket_num, score_at_dismissal, overs_raw, recorded_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (match_id, innings, wicket_num) DO NOTHING`,
    [matchId, bat.innings, wickets, bat.score, bat.oversStr || null],
  );
  return { matchId, innings: bat.innings, wickets, score: bat.score };
}

export async function getScoreAtDismissal(matchId, wicketNum, innings = null) {
  await ensureMatchDismissalSnapshotsTable();
  const id = String(matchId);
  const w = Number(wicketNum);
  if (!id || !Number.isFinite(w) || w <= 0) return null;

  const res = innings != null
    ? await query(
      `SELECT score_at_dismissal FROM match_dismissal_snapshots
       WHERE match_id = $1 AND innings = $2 AND wicket_num = $3`,
      [id, innings, w],
    )
    : await query(
      `SELECT score_at_dismissal FROM match_dismissal_snapshots
       WHERE match_id = $1 AND wicket_num = $2
       ORDER BY innings DESC LIMIT 1`,
      [id, w],
    );

  if (!res.rows[0]) return null;
  const score = Number(res.rows[0].score_at_dismissal);
  return Number.isFinite(score) ? score : null;
}
