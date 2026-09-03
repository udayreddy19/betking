/**
 * Shared wall-clock "match final" inference for cricket settlement.
 *
 * Short formats (T20/ODI) may use age heuristics as a last resort.
 * Multi-day / County / Test must NEVER be inferred complete from startTime age —
 * that falsely VOIDed live next-over markets and refunded stakes.
 */

import { detectCricketMatchFormat } from '../../src/utils/cricketFormat.js';

export const WALL_CLOCK_START_MAX_MS = 3.5 * 3600 * 1000;
export const WALL_CLOCK_UPDATE_MAX_MS = 15 * 60 * 1000;

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

/** Feed still says the fixture is in play — never invent COMPLETED. */
export function isFeedStillLive(match) {
  if (!match) return false;
  if (match.isLive === true) return true;
  const state = String(match.matchState || '').toLowerCase();
  if (state === 'in' || state === 'live') return true;
  if (String(match.time || '').toLowerCase() === 'live') return true;
  return false;
}

/**
 * @returns {boolean} true only when wall-clock age may treat a short-format match as final
 */
export function inferWallClockMatchFinal(match, opts = {}) {
  if (!match) return false;
  if (isMultiDayCricket(match)) return false;
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
  const s1 = opts.s1 != null
    ? Number(opts.s1)
    : Number(
      match.score1
      ?? match.live_score1
      ?? match.liveDetails?.score1
      ?? match.liveDetails?.firstRuns
      ?? match.team1?.runs
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
      ?? 0,
    );
  const hasBothScores = (Number.isFinite(s1) && s1 > 0) && (Number.isFinite(s2) && s2 > 0);

  if (startTime > 0 && now - startTime > WALL_CLOCK_START_MAX_MS) return true;
  if (hasBothScores && updatedAt > 0 && now - updatedAt > WALL_CLOCK_UPDATE_MAX_MS) return true;
  return false;
}

/** Mutate a match object to look completed — only call after inferWallClockMatchFinal is true. */
export function markInferredFinal(match) {
  if (!match) return match;
  match.status = 'COMPLETED';
  match.matchState = 'post';
  match.isCompleted = true;
  match.isLive = false;
  return match;
}
