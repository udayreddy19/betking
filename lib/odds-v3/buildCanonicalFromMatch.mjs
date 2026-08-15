/**
 * Build CanonicalMatchState from a live aggregator / match-detail object.
 * Passes through provider odds when present; never invents scores or odds.
 */

import { createCanonicalMatchState } from './models/CanonicalMatchState.mjs';
import { getFormatRules } from './format/CricketFormatRules.mjs';

function parseOversToBalls(oversStr, ballsPerOver = 6) {
  if (oversStr == null || oversStr === '') return 0;
  const str = String(oversStr).trim();
  if (/ball/i.test(str)) return parseInt(str, 10) || 0;
  const parts = str.split('.');
  const overs = parseInt(parts[0], 10) || 0;
  const balls = parseInt(parts[1], 10) || 0;
  return overs * ballsPerOver + balls;
}

function isSecondInnings(match, ld = {}) {
  if ((Number(ld.inningsId) || 0) >= 2) return true;
  if (Number(ld.chaseRuns) > 0 || Number(ld.score2) > 0 || Number(ld.wickets2) > 0 || Number(ld.chaseWickets) > 0) {
    return true;
  }
  if (ld.chaseOvers && ld.chaseOvers !== '0.0' && ld.chaseOvers !== '0') return true;
  if (/second/i.test(String(ld.commentary || match?.time || ''))) return true;
  return false;
}

function resolveFormat(match) {
  const raw = String(match?.format || match?.matchType || match?.matchHeader?.matchFormat || match?.league || match?.seriesName || '').toLowerCase();
  if (/test|first.?class/.test(raw)) return 'TEST';
  if (/hundred|the hundred/.test(raw)) return 'THE_HUNDRED';
  if (/odi|one.?day|list a|\b50\b/.test(raw)) return 'ODI';
  if (/\bt10\b/.test(raw)) return 'T10';
  return 'T20';
}

function teamId(team, fallback) {
  return String(team?.id || team?.shortName || fallback);
}

function extractProviderOdds(match) {
  const o = match?.odds || match?.preOdds || {};
  const home = Number(o.home ?? o.team1);
  const away = Number(o.away ?? o.team2);
  if (!(home > 1) || !(away > 1)) return null;
  return {
    home,
    away,
    team1: home,
    team2: away,
    draw: o.draw != null ? Number(o.draw) : null,
  };
}

/**
 * @param {object} match
 * @param {{ stateVersion?: number }} [opts]
 * @returns {import('./models/CanonicalMatchState.mjs').CanonicalMatchState}
 */
export function buildCanonicalFromMatch(match, opts = {}) {
  if (!match) throw new Error('buildCanonicalFromMatch: match required');

  const ld = match.liveDetails || {};
  const format = resolveFormat(match);
  const rules = getFormatRules(format) || getFormatRules('T20');
  const ballsPerInnings = rules.ballsPerInnings;
  const ballsPerOver = rules.ballsPerOver || 6;

  const t1Name = match.team1?.name || match.team1 || 'Team 1';
  const t2Name = match.team2?.name || match.team2 || 'Team 2';
  const t1Id = teamId(match.team1, 'team1');
  const t2Id = teamId(match.team2, 'team2');

  const isSecond = isSecondInnings(match, ld);

  const firstRuns = Number(ld.firstRuns ?? ld.runs ?? 0);
  const firstWickets = Number(ld.firstWickets ?? ld.wickets ?? 0);
  const firstBalls = parseOversToBalls(ld.firstOvers || (!isSecond ? ld.overs : null), ballsPerOver);

  const chaseRuns = Number(ld.chaseRuns ?? ld.score2 ?? 0);
  const chaseWickets = Number(ld.chaseWickets ?? ld.wickets2 ?? 0);
  const chaseBalls = parseOversToBalls(
    ld.chaseOvers || ld.overs2 || (isSecond ? null : ld.overs),
    ballsPerOver,
  );
  // Prefer explicit chase ball count from scorecard-like fields when overs missing mid-chase.
  const chaseBallsSafe = chaseBalls > 0
    ? chaseBalls
    : (Number(ld.chaseBallNbr) > 0 ? Number(ld.chaseBallNbr) : 0);

  // Map team1/team2 by batting labels when present
  let team1Runs = firstRuns;
  let team1Wickets = firstWickets;
  let team1Balls = firstBalls;
  let team2Runs = isSecond ? chaseRuns : 0;
  let team2Wickets = isSecond ? chaseWickets : 0;
  let team2Balls = isSecond ? chaseBallsSafe : 0;

  if (ld.firstTeamName && /team2|away/i.test('') === false) {
    const firstIsTeam2 = String(ld.firstTeamName).toLowerCase() === String(t2Name).toLowerCase()
      || String(t2Name).toLowerCase().includes(String(ld.firstTeamName).toLowerCase().slice(0, 6));
    if (firstIsTeam2) {
      team1Runs = isSecond ? chaseRuns : 0;
      team1Wickets = isSecond ? chaseWickets : 0;
      team1Balls = isSecond ? chaseBalls : 0;
      team2Runs = firstRuns;
      team2Wickets = firstWickets;
      team2Balls = firstBalls;
    }
  }

  if (match.team1?.runs != null) team1Runs = Number(match.team1.runs);
  if (match.team1?.wickets != null) team1Wickets = Number(match.team1.wickets);
  if (match.team2?.runs != null) team2Runs = Number(match.team2.runs);
  if (match.team2?.wickets != null) team2Wickets = Number(match.team2.wickets);

  const currentInnings = isSecond ? 2 : 1;
  let battingTeamId = t1Id;
  let bowlingTeamId = t2Id;

  if (ld.chaseTeamName) {
    const chaseIsT1 = String(ld.chaseTeamName).toLowerCase() === String(t1Name).toLowerCase()
      || String(t1Name).toLowerCase().includes(String(ld.chaseTeamName).toLowerCase().slice(0, 6));
    battingTeamId = chaseIsT1 ? t1Id : t2Id;
    bowlingTeamId = chaseIsT1 ? t2Id : t1Id;
  } else if (isSecond) {
    battingTeamId = t2Id;
    bowlingTeamId = t1Id;
  } else if (ld.firstTeamName) {
    const firstIsT1 = String(ld.firstTeamName).toLowerCase() === String(t1Name).toLowerCase()
      || String(t1Name).toLowerCase().includes(String(ld.firstTeamName).toLowerCase().slice(0, 6));
    battingTeamId = firstIsT1 ? t1Id : t2Id;
    bowlingTeamId = firstIsT1 ? t2Id : t1Id;
  }

  const battingRuns = battingTeamId === t1Id ? team1Runs : team2Runs;
  const battingBallsRaw = battingTeamId === t1Id ? team1Balls : team2Balls;
  const ballsCompleted = Math.min(Math.max(0, battingBallsRaw), Math.max(0, ballsPerInnings - 1));
  const ballsRemaining = Math.max(1, ballsPerInnings - ballsCompleted);

  const firstInningsRuns = battingTeamId === t1Id ? team2Runs : team1Runs;
  const target = currentInnings === 2 && firstInningsRuns > 0 ? firstInningsRuns + 1 : null;
  const runsRequired = target != null ? Math.max(0, target - battingRuns) : null;

  const isLive = match.isLive === true || match.matchState === 'in' || match.status === 'LIVE';
  const isCompleted = match.matchState === 'post' || match.status === 'COMPLETED' || match.isFinished === true;
  const status = isLive ? 'LIVE' : (isCompleted ? 'COMPLETED' : 'SCHEDULED');

  const providerOdds = extractProviderOdds(match);

  return createCanonicalMatchState({
    matchId: match.id || match.matchId,
    sport: 'CRICKET',
    format,
    status,
    team1: {
      id: t1Id,
      name: String(t1Name),
      runs: team1Runs,
      wickets: team1Wickets,
      balls: team1Balls,
    },
    team2: {
      id: t2Id,
      name: String(t2Name),
      runs: team2Runs,
      wickets: team2Wickets,
      balls: team2Balls,
    },
    currentInnings,
    battingTeamId,
    bowlingTeamId,
    target,
    runsRequired,
    ballsPerInnings,
    ballsCompleted,
    ballsRemaining,
    batter1: ld.batter1 || null,
    batter2: ld.batter2 || null,
    liveDetails: {
      ...ld,
      odds: providerOdds || ld.odds || null,
    },
    odds: providerOdds,
    providerTimestamp: Date.now(),
    stateVersion: Number(opts.stateVersion || match.stateVersion || 1),
  });
}

export { extractProviderOdds };
