/**
 * Canonical over-boundary detection using cricket over notation (not float compare).
 */

import { parseOversParts } from '../matchOverSnapshotStore.mjs';
import { getFormatRules, resolveCricketFormat } from '../odds-v3/format/CricketFormatRules.mjs';
import { oversToBallsForMatch } from '../../src/utils/cricketFormat.js';

/**
 * Legal balls completed through end of over `targetOver` in `oversStr`.
 * @returns {{ complete: boolean, completedOvers: number, ballInOver: number, totalBalls: number }}
 */
export function parseOverProgress(oversStr, match = null) {
  const parts = parseOversParts(oversStr);
  if (!parts) {
    return { complete: false, completedOvers: 0, ballInOver: 0, totalBalls: 0 };
  }

  const format = match ? resolveCricketFormat(match) : 'T20';
  const rules = getFormatRules(format) || getFormatRules('T20');
  const bpo = rules.ballsPerOver || 6;
  const totalBalls = match
    ? oversToBallsForMatch(String(oversStr), match)
    : parts.completed * bpo + parts.balls;

  return {
    completedOvers: parts.completed,
    ballInOver: parts.balls,
    totalBalls,
    bpo,
  };
}

/**
 * True when over `targetOver` has fully completed in this innings progress string.
 * 10.1–10.5 (during over 11) → not how cricket works; 10.3 means 10 overs done + ball 3 of over 11.
 * During over 10 in progress: 9.x → not complete until 10.0.
 */
export function isOverBoundaryComplete(oversStr, targetOver, match = null) {
  const target = Number(targetOver);
  if (!Number.isFinite(target) || target <= 0) return false;

  const parts = parseOversParts(oversStr);
  if (!parts) return false;

  // End of over N: completed full overs > N, or exactly N with any balls in next over (N.x, x>=0)
  if (parts.completed > target) return true;
  if (parts.completed === target) return true;
  return false;
}

/**
 * Milestone 0–N market: boundary is end of over N in the scoped innings.
 */
export function isMilestoneBoundaryReached(match, innings, targetOver) {
  const oversStr = getInningsOversString(match, innings);
  if (oversStr == null || String(oversStr).trim() === '') {
    // Innings finished without live overs string — if we're past that innings, boundary was reached
    if (innings != null && getCurrentInningsNumber(match) > innings) return true;
    return false;
  }
  return isOverBoundaryComplete(oversStr, targetOver, match);
}

export function getCurrentInningsNumber(match) {
  const ld = match?.liveDetails || {};
  const inn = Number(ld.inningsId ?? ld.innings ?? 0);
  if (inn >= 2) return 2;
  if (Number(ld.chaseRuns) > 0 || Number(ld.chaseOvers) > 0) return 2;
  return 1;
}

/**
 * Overs string for a specific innings (never use chase overs for innings 1 grading).
 */
export function getInningsOversString(match, innings) {
  const ld = match?.liveDetails || {};
  const inn = Number(innings);

  if (inn === 1) {
    return ld.firstOvers ?? ld.overs ?? match?.team1?.overs ?? match?.team2?.overs ?? null;
  }
  if (inn === 2) {
    return ld.chaseOvers ?? ld.overs2 ?? ld.overs ?? match?.team2?.overs ?? null;
  }
  if (inn == null) {
    return ld.firstOvers ?? ld.overs ?? ld.chaseOvers ?? null;
  }
  return null;
}
