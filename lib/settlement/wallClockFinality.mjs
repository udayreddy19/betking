/**
 * Shared wall-clock "match final" inference for cricket settlement.
 *
 * Short formats (T20/ODI) may use age heuristics as a last resort.
 * Multi-day / County / Test must NEVER be inferred complete from startTime age —
 * that falsely VOIDed live next-over markets and refunded stakes.
 *
 * Score sports (handball/tennis/snooker/soccer) may treat stale "live" feeds as
 * finished when both sides scored and the board has not updated for a long time.
 */

import { detectCricketMatchFormat } from '../../src/utils/cricketFormat.js';

export const WALL_CLOCK_START_MAX_MS = 3.5 * 3600 * 1000;
export const WALL_CLOCK_UPDATE_MAX_MS = 15 * 60 * 1000;
/** Stale live board for non-cricket score sports (provider froze mid-match). */
export const SCORE_SPORT_STALE_LIVE_MS = 25 * 60 * 1000;
export const SCORE_SPORT_START_MAX_MS = 2.5 * 3600 * 1000;

export function isMultiDayCricket(match) {
  if (!match) return false;
  const fmt = detectCricketMatchFormat(match);
  if (fmt === 'TEST' || fmt === 'FIRST_CLASS') return true;
  const text = [
    match.league,
    match.seriesName,
    match.competition,
    match.matchFormat,
    match.matchType,
    match.format,
  ].filter(Boolean).join(' ');
  return /\bCOUNTY\s*CHAMPIONSHIP\b|\bRANJI\b|\bSHEFFIELD\s*SHIELD\b|\b4[\s-]?DAY\b|\bFIRST[\s-]?CLASS\b|\bTEST\b/i.test(text);
}

export function isCricketishSport(match) {
  const sport = String(match?.sport || '').toLowerCase();
  return !sport || sport.includes('cricket');
}

/** Feed still says the fixture is in play — never invent COMPLETED for cricket. */
export function isFeedStillLive(match) {
  if (!match) return false;
  if (match.isLive === true) return true;
  const state = String(match.matchState || '').toLowerCase();
  if (state === 'in' || state === 'live') return true;
  if (String(match.time || '').toLowerCase() === 'live') return true;
  return false;
}

function readScores(match, opts = {}) {
  const s1 = opts.s1 != null
    ? Number(opts.s1)
    : Number(
      match.score1
      ?? match.live_score1
      ?? match.liveDetails?.score1
      ?? match.liveDetails?.firstRuns
      ?? match.team1?.runs
      ?? match.team1?.score
      ?? 0,
    );
  const s2 = opts.s2 != null
    ? Number(opts.s2)
    : Number(
      match.score2
      ?? match.live_score2
      ?? match.liveDetails?.score2
      ?? match.liveDetails?.chaseRuns
      ?? match.team2?.runs
      ?? match.team2?.score
      ?? 0,
    );
  return { s1, s2 };
}

/**
 * Non-cricket: provider left isLive=true but stopped updating (Belenenses case).
 * Treat as final when both scores are present and the board is stale / old.
 */
export function inferScoreSportStaleLiveFinal(match, opts = {}) {
  if (!match || isCricketishSport(match)) return false;
  const now = opts.now ?? Date.now();
  const startTime = opts.startTime != null
    ? Number(opts.startTime)
    : (match.startTime || match.start_time || match.startDate
      ? new Date(match.startTime || match.start_time || match.startDate).getTime()
      : 0);
  const updatedAt = opts.updatedAt != null
    ? Number(opts.updatedAt)
    : (match.updatedAt || match.updated_at || match.cachedAt
      ? new Date(match.updatedAt || match.updated_at || match.cachedAt).getTime()
      : 0);
  const { s1, s2 } = readScores(match, opts);
  const hasBothScores = Number.isFinite(s1) && Number.isFinite(s2) && (s1 > 0 || s2 > 0);
  if (!hasBothScores) return false;

  if (startTime > 0 && now - startTime > SCORE_SPORT_START_MAX_MS) return true;
  if (updatedAt > 0 && now - updatedAt > SCORE_SPORT_STALE_LIVE_MS) return true;
  if (!updatedAt && startTime > 0 && now - startTime > 90 * 60 * 1000) return true;
  return false;
}

/**
 * @returns {boolean} true only when wall-clock age may treat a short-format match as final
 */
export function inferWallClockMatchFinal(match, opts = {}) {
  if (!match) return false;
  if (isMultiDayCricket(match)) return false;
  if (isCricketishSport(match) && isFeedStillLive(match)) return false;
  if (!isCricketishSport(match) && inferScoreSportStaleLiveFinal(match, opts)) return true;
  if (isFeedStillLive(match)) return false;

  const now = opts.now ?? Date.now();
  const startTime = opts.startTime != null
    ? Number(opts.startTime)
    : (match.startTime || match.start_time || match.startDate
      ? new Date(match.startTime || match.start_time || match.startDate).getTime()
      : 0);
  const updatedAt = opts.updatedAt != null
    ? Number(opts.updatedAt)
    : (match.updatedAt || match.updated_at || match.cachedAt
      ? new Date(match.updatedAt || match.updated_at || match.cachedAt).getTime()
      : 0);
  const { s1, s2 } = readScores(match, opts);
  const hasBothScores = (Number.isFinite(s1) && s1 > 0) && (Number.isFinite(s2) && s2 > 0);

  if (startTime > 0 && now - startTime > WALL_CLOCK_START_MAX_MS) return true;
  if (hasBothScores && updatedAt > 0 && now - updatedAt > WALL_CLOCK_UPDATE_MAX_MS) return true;
  return false;
}

/** Mutate a match object to look completed — only call after finality is true. */
export function markInferredFinal(match) {
  if (!match) return match;
  match.status = 'COMPLETED';
  match.matchState = 'post';
  match.isCompleted = true;
  match.isLive = false;
  const { s1, s2 } = readScores(match);
  if (s1 > s2) match.winnerSide = '1';
  else if (s2 > s1) match.winnerSide = '2';
  return match;
}
