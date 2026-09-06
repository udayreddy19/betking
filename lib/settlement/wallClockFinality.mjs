/**
 * Shared wall-clock "match final" inference for cricket settlement.
 *
 * Short formats (T20/ODI) may use age heuristics as a last resort.
 * Multi-day / County / Test must NEVER be inferred complete from startTime age —
 * that falsely VOIDed live next-over markets and refunded stakes.
 *
 * Score sports (handball/tennis/snooker/soccer) may treat stale "live" feeds as
 * finished when both sides scored and the board has not updated for a long time.
 * Never finalize solely because kickoff was hours ago while the feed is still fresh.
 */

import { detectCricketMatchFormat } from '../../src/utils/cricketFormat.js';

export const WALL_CLOCK_START_MAX_MS = 3.5 * 3600 * 1000;
export const WALL_CLOCK_UPDATE_MAX_MS = 15 * 60 * 1000;
/** Cricket left the live board but Redis still says LIVE — allow finality after this age. */
export const CRICKET_OFF_BOARD_STALE_MS = 20 * 60 * 1000;
/** Stale live board for non-cricket score sports (provider froze mid-match). */
export const SCORE_SPORT_STALE_LIVE_MS = 25 * 60 * 1000;
/** Longer grace during known period breaks (HT / set break / delay). */
export const SCORE_SPORT_BREAK_STALE_MS = 45 * 60 * 1000;
/** Only used together with a missing/stale update — never alone while feed is fresh. */
export const SCORE_SPORT_START_MAX_MS = 2.5 * 3600 * 1000;
export const SCORE_SPORT_NO_UPDATE_START_MS = 90 * 60 * 1000;

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

/** Halftime / set-break / delay — do not treat short freezes as finished. */
export function looksLikePeriodBreak(match) {
  if (!match) return false;
  const blob = [
    match.time,
    match.liveStatus,
    match.status,
    match.phase,
    match.period,
    match.eventPhase?.description,
    match.eventPhase?.showPhase,
    match.liveDetails?.status,
    match.liveDetails?.commentary,
    match.matchHeader?.status,
  ].filter(Boolean).join(' ');
  return /\b(ht|h\.?t\.?|half[\s-]?time|1st\s*half|2nd\s*half|intermission|break|set[\s-]?break|between[\s-]?(sets|games)|rain|delay|timeout|medical|paused|suspended|stopped)\b/i.test(blob);
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
 * Requires a stale/missing update signal — never start-age alone while feed is fresh.
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

  // Actively updating board → never invent COMPLETED.
  if (updatedAt > 0 && now - updatedAt <= SCORE_SPORT_STALE_LIVE_MS) return false;

  const onBreak = looksLikePeriodBreak(match);
  const staleThreshold = onBreak ? SCORE_SPORT_BREAK_STALE_MS : SCORE_SPORT_STALE_LIVE_MS;
  const updateStale = updatedAt > 0 && now - updatedAt > staleThreshold;
  const noUpdateButOld = !updatedAt && startTime > 0
    && now - startTime > SCORE_SPORT_NO_UPDATE_START_MS;
  const startVeryOld = startTime > 0 && now - startTime > SCORE_SPORT_START_MAX_MS;

  // Stale board + old kickoff (or no start) → treat as frozen final.
  if (updateStale && (startVeryOld || !startTime || now - startTime > 75 * 60 * 1000)) return true;
  // No updatedAt at all, but fixture is well past expected duration.
  if (noUpdateButOld && startVeryOld) return true;
  return false;
}

/**
 * Cricket dropped off the live aggregator board while Redis/cache still says LIVE.
 * Without this, match_total / most_sixes / match_winner stay open forever after
 * providers remove the fixture (no COMPLETED write-back).
 *
 * Only applies when the caller confirms the fixture is absent from the current
 * live board — never while it is still listed as in-play.
 */
export function inferOffBoardCricketStaleFinal(match, opts = {}) {
  if (!match || !isCricketishSport(match)) return false;
  if (isMultiDayCricket(match)) return false;
  if (opts.onLiveBoard === true) return false;
  if (!isFeedStillLive(match) && !opts.forceLiveFlag) return false;

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
  const ld = match.liveDetails || {};
  const hasScoreEvidence = (
    Number(ld.firstRuns || ld.chaseRuns || match.score1 || match.score2 || match.team1?.runs || match.team2?.runs || 0) > 0
    || Number(ld.wickets || ld.firstWickets || ld.chaseWickets || 0) > 0
    || (ld.overs != null && String(ld.overs).trim() !== '' && String(ld.overs) !== '0' && String(ld.overs) !== '0.0')
  );
  if (!hasScoreEvidence) return false;

  const updateStale = updatedAt > 0 && now - updatedAt >= CRICKET_OFF_BOARD_STALE_MS;
  const startVeryOld = startTime > 0 && now - startTime >= WALL_CLOCK_START_MAX_MS;
  const noUpdateButOld = !updatedAt && startTime > 0 && now - startTime >= WALL_CLOCK_START_MAX_MS;
  return Boolean(updateStale || startVeryOld || noUpdateButOld);
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

function sportAllowsDraw(match) {
  const sport = String(match?.sport || '').toLowerCase();
  return /soccer|football|esoccer|handball|hockey|ice[\s-]?hockey/.test(sport);
}

/** Mutate a match object to look completed — only call after finality is true. */
export function markInferredFinal(match) {
  if (!match) return match;
  match.status = 'COMPLETED';
  match.matchState = 'post';
  match.isCompleted = true;
  match.isLive = false;
  // Clear residual live ticker strings so isFeedStillLive / isMatchFinal do not
  // keep treating the card as in-play after off-board stale finality.
  if (/^live$/i.test(String(match.time || ''))) match.time = 'Completed';
  if (/^live$/i.test(String(match.liveStatus || ''))) match.liveStatus = 'COMPLETED';
  const { s1, s2 } = readScores(match);
  if (s1 > s2) match.winnerSide = '1';
  else if (s2 > s1) match.winnerSide = '2';
  else if (sportAllowsDraw(match)) match.winnerSide = 'X';
  return match;
}

/** Semver-ish compare for guardian stability bumps (4.10 > 4.9). */
export function compareEngineVersions(a, b) {
  const parse = (v) => String(v || '0')
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((p) => Number.parseInt(p, 10) || 0);
  const aa = parse(a);
  const bb = parse(b);
  const n = Math.max(aa.length, bb.length);
  for (let i = 0; i < n; i += 1) {
    const x = aa[i] || 0;
    const y = bb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}
