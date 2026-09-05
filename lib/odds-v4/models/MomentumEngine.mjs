/**
 * OddsEngineV4 — live momentum from innings RR + recent overs.
 * Hot bat → slightly higher chase expectancy; cold → lower.
 */

import { getFormatRules } from '../../odds-v3/format/CricketFormatRules.mjs';

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function parseBallRuns(token) {
  const s = String(token || '').trim().toUpperCase();
  if (!s || s === '|' || s === '•' || s === '.') return 0;
  if (s === 'W' || s.startsWith('W')) return 0;
  if (s.includes('6')) return 6;
  if (s.includes('4')) return 4;
  const n = Number.parseInt(s.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function recentOverRuns(overHistory = [], lastN = 3) {
  if (!Array.isArray(overHistory) || !overHistory.length) return null;
  const rows = overHistory.slice(-Math.max(1, lastN));
  let runs = 0;
  let balls = 0;
  for (const row of rows) {
    const ballsArr = Array.isArray(row?.balls) ? row.balls : [];
    for (const b of ballsArr) {
      const t = String(b || '').trim();
      if (!t || t === '|') continue;
      runs += parseBallRuns(t);
      balls += 1;
    }
    if (!ballsArr.length && Number.isFinite(Number(row?.runs))) {
      runs += Number(row.runs);
      balls += 6;
    }
  }
  if (balls < 6) return null;
  return { runs, balls, rpb: runs / balls };
}

/**
 * @returns {{
 *   factor: number,
 *   inningsRpb: number|null,
 *   recentRpb: number|null,
 *   phase: 'powerplay'|'middle'|'death'|'unknown',
 *   marginBump: number,
 * }}
 */
export function computeMomentum(state) {
  const rules = getFormatRules(state?.format) || getFormatRules('T20');
  const ballsPerOver = rules.ballsPerOver || 6;
  const batting = state?.battingTeamId === state?.team1?.id ? state.team1 : state.team2;
  const ballsCompleted = Number(state?.ballsCompleted) || 0;
  const ballsRemaining = Number(state?.ballsRemaining) || 0;
  const runs = Number(batting?.runs) || 0;
  const baseline = Number(rules.historicalRunsPerBall) || 1.25;

  const inningsRpb = ballsCompleted > 0 ? runs / ballsCompleted : null;
  const recent = recentOverRuns(state?.overHistory || state?.liveDetails?.overHistory, 3);
  const recentRpb = recent?.rpb ?? null;

  const blend = recentRpb != null && inningsRpb != null
    ? 0.55 * recentRpb + 0.45 * inningsRpb
    : (recentRpb ?? inningsRpb ?? baseline);

  // Conservatively damp momentum so house isn't blown by a single hot over.
  const rawFactor = blend / Math.max(0.4, baseline);
  const factor = clamp(0.88 + (rawFactor - 1) * 0.55, 0.82, 1.18);

  const totalOvers = (Number(state?.ballsPerInnings) || rules.ballsPerInnings || 120) / ballsPerOver;
  const overNum = Math.floor(ballsCompleted / ballsPerOver) + 1;
  const ppOvers = (rules.powerplayBalls || 0) / ballsPerOver;
  let phase = 'middle';
  if (ppOvers > 0 && overNum <= ppOvers) phase = 'powerplay';
  else if (ballsRemaining <= 5 * ballsPerOver) phase = 'death';
  else if (overNum <= 0) phase = 'unknown';

  let marginBump = 0;
  if (phase === 'death') marginBump = 0.03;
  else if (phase === 'powerplay') marginBump = 0.015;
  if (Number(state?.runsRequired) > 0 && Number(state.runsRequired) <= 12) {
    marginBump += 0.025;
  }

  return {
    factor,
    inningsRpb,
    recentRpb,
    phase,
    marginBump,
    debug: { blend, baseline, overNum, ballsRemaining },
  };
}

/** Apply momentum to a raw expected-runs figure (house-damped). */
export function applyMomentumToExpected(expectedRuns, momentum) {
  const f = Number(momentum?.factor);
  if (!Number.isFinite(f)) return expectedRuns;
  return Number(expectedRuns) * f;
}
