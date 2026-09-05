/**
 * Build CanonicalMatchStateV4 from aggregator / match-detail blob.
 * Reuses V3 chase/format detection without inventing scores.
 */

import { createCanonicalMatchStateV4 } from './CanonicalMatchStateV4.mjs';
import {
  buildCanonicalFromMatch,
  isSecondInnings,
} from '../../odds-v3/buildCanonicalFromMatch.mjs';
import { resolveCricketOversFormat, detectCricketMatchFormat } from '../../../src/utils/cricketFormat.js';
import { getFormatRules } from '../../odds-v3/format/CricketFormatRules.mjs';

function playerSlot(p) {
  if (!p) return null;
  if (typeof p === 'string') {
    const name = p.trim();
    if (!name || /^(batter|bowler|player|tbd|n\/a|-)$/i.test(name)) return null;
    return { name, runs: 0, balls: 0 };
  }
  const name = String(p.name || '').trim();
  if (!name || /^(batter|bowler|player|tbd|n\/a|-)$/i.test(name)) return null;
  return {
    name,
    runs: Number(p.runs) || 0,
    balls: Number(p.balls) || 0,
    fours: Number(p.fours) || 0,
    sixes: Number(p.sixes) || 0,
  };
}

function mapFormat(rawFormat, match) {
  const detected = detectCricketMatchFormat(match);
  const resolved = resolveCricketOversFormat(match) || rawFormat || detected;
  if (resolved === 'LIST_A') return 'ODI';
  if (['T10', 'T20', 'ODI', 'TEST', 'THE_HUNDRED'].includes(resolved)) return resolved;
  if (String(detected) === 'LIST_A') return 'ODI';
  if (['T10', 'T20', 'ODI', 'TEST', 'THE_HUNDRED'].includes(detected)) return detected;
  return 'T20';
}

function formatConfidence(match, format) {
  const league = String(match?.league || match?.seriesName || '');
  if (/\bD50\b|\bODI\b|\bT20\b|\bT10\b|\bTEST\b/i.test(league)) return 'high';
  const ld = match?.liveDetails || {};
  const firstOvers = parseInt(String(ld.firstOvers || '0').split('.')[0], 10) || 0;
  if (format === 'ODI' && firstOvers > 20) return 'high';
  if (format === 'T10' && firstOvers === 10) return 'high';
  if (match?.matchType && String(match.matchType).toUpperCase() !== format) return 'medium';
  return 'medium';
}

/**
 * @param {object} match
 * @param {{ stateVersion?: number }} [opts]
 */
export function buildCanonicalFromMatchV4(match, opts = {}) {
  if (!match) throw new Error('buildCanonicalFromMatchV4: match required');

  // Prefer V3 builder for score/innings truth, then enrich for V4 gates.
  const v3 = buildCanonicalFromMatch(match, opts);
  const ld = match.liveDetails || {};
  const format = mapFormat(v3.format, match);
  const rules = getFormatRules(format) || getFormatRules('T20');
  const ballsPerInnings = Number(rules.ballsPerInnings) || Number(v3.ballsPerInnings) || 120;

  const chase = isSecondInnings(match, ld) || Number(v3.currentInnings) >= 2;
  const battingIsTeam1 = String(v3.battingTeamId) === String(v3.team1.id);
  const battingRuns = battingIsTeam1 ? Number(v3.team1.runs) : Number(v3.team2.runs);
  const battingWickets = battingIsTeam1 ? Number(v3.team1.wickets) : Number(v3.team2.wickets);
  const bowlingRuns = battingIsTeam1 ? Number(v3.team2.runs) : Number(v3.team1.runs);

  let ballsCompleted = Number(v3.ballsCompleted) || 0;
  // Recompute remaining against V4 format balls (fixes T20-stamped D50).
  ballsCompleted = Math.min(ballsPerInnings, Math.max(0, ballsCompleted));
  const ballsRemaining = Math.max(0, ballsPerInnings - ballsCompleted);

  const batter1 = playerSlot(ld.batter1 || v3.batter1);
  const batter2 = playerSlot(ld.batter2 || v3.batter2);
  const bowler = playerSlot(ld.bowler);
  const hasNamedBatters = Boolean(batter1?.name || batter2?.name);
  const hasBallFeed = Boolean(
    v3.hasBallFeed
    || ld.currentOverBalls?.length
    || ld.commentaryFeed?.length
    || ld.ballByBall?.length
    || hasNamedBatters
    || Number(ld.chaseBallNbr) > 0,
  );

  const phase = v3.status === 'COMPLETED'
    ? 'COMPLETED'
    : (chase ? 'CHASE' : (v3.status === 'SCHEDULED' ? 'PREMATCH' : 'INNINGS_1'));

  const firstInningsRuns = chase
    ? (Number(ld.firstRuns) >= 0 && ld.firstRuns != null
      ? Number(ld.firstRuns)
      : bowlingRuns)
    : null;
  const target = chase
    ? (v3.target != null ? Number(v3.target) : (firstInningsRuns != null ? firstInningsRuns + 1 : null))
    : null;
  const runsRequired = chase
    ? (v3.runsRequired != null
      ? Number(v3.runsRequired)
      : (target != null ? Math.max(0, target - battingRuns) : null))
    : null;

  const providerOdds = v3.odds || match.marketReferenceData?.providerOdds || match.providerOdds || null;

  return createCanonicalMatchStateV4({
    matchId: v3.matchId,
    sport: 'cricket',
    format,
    status: v3.status,
    phase,
    team1: v3.team1,
    team2: v3.team2,
    currentInnings: chase ? 2 : 1,
    battingTeamId: v3.battingTeamId,
    bowlingTeamId: v3.bowlingTeamId,
    target,
    runsRequired,
    ballsPerInnings,
    ballsCompleted,
    ballsRemaining,
    wicketsInHand: Math.max(0, 10 - battingWickets),
    battingRuns,
    battingWickets,
    firstInningsRuns,
    firstInningsWickets: chase ? (Number(ld.firstWickets) || null) : null,
    firstInningsBalls: chase ? (battingIsTeam1 ? Number(v3.team2.balls) : Number(v3.team1.balls)) : null,
    batter1,
    batter2,
    bowler,
    ballFeedAgeMs: Number(match.feedAgeMs || ld.feedAgeMs || 0),
    hasBallFeed,
    hasNamedBatters,
    formatConfidence: formatConfidence(match, format),
    providerOdds,
    league: match.league || match.seriesName || null,
    providerTimestamp: v3.providerTimestamp || Date.now(),
    stateVersion: opts.stateVersion || v3.stateVersion || 1,
    sourceMatch: match,
  });
}
