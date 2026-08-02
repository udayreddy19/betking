import { normalizeCricbuzzOvers, oversToBalls } from './oversUtils';
import { flattenCricketTeamScores, resolveCricketTeamScores, teamNameMatches } from './cricketScores';

function pickHigherOvers(a, b) {
  if (!a) return b || '0.0';
  if (!b) return a || '0.0';
  return oversToBalls(a) >= oversToBalls(b) ? a : b;
}

function pickMonotonicInt(prev, next) {
  if (next == null || Number.isNaN(next)) return prev ?? 0;
  if (prev == null || Number.isNaN(prev)) return next;
  return Math.max(prev, next);
}

/**
 * Merge cricket liveDetails without regressing scores when a slower/stale
 * source (full HTML scrape, list API) arrives after a fast meta poll.
 */
export function mergeCricketLiveDetails(prev = {}, next = {}, match = null) {
  const merged = { ...prev, ...next };

  const prevChase = prev.chaseRuns ?? prev.score2;
  const nextChase = next.chaseRuns ?? next.score2;
  if (prevChase != null || nextChase != null) {
    const chaseRuns = pickMonotonicInt(prevChase, nextChase);
    merged.chaseRuns = chaseRuns;
    merged.score2 = pickMonotonicInt(prev.score2, chaseRuns);
    merged.chaseWickets = pickMonotonicInt(prev.chaseWickets ?? prev.wickets2, next.chaseWickets ?? next.wickets2);
    merged.wickets2 = pickMonotonicInt(prev.wickets2, merged.chaseWickets);
    merged.chaseOvers = pickHigherOvers(prev.chaseOvers ?? prev.overs2, next.chaseOvers ?? next.overs2);
    merged.overs2 = normalizeCricbuzzOvers(pickHigherOvers(prev.overs2, merged.chaseOvers));
    merged.chaseBallNbr = pickMonotonicInt(prev.chaseBallNbr, next.chaseBallNbr);
  }

  const prevFirst = prev.firstRuns ?? prev.runs;
  const nextFirst = next.firstRuns ?? next.runs;
  if (prevFirst != null || nextFirst != null) {
    merged.firstRuns = pickMonotonicInt(prevFirst, nextFirst);
    merged.runs = pickMonotonicInt(prev.runs, merged.firstRuns);
    merged.firstWickets = pickMonotonicInt(prev.firstWickets ?? prev.wickets, next.firstWickets ?? next.wickets);
    merged.wickets = pickMonotonicInt(prev.wickets, merged.firstWickets);
    merged.firstOvers = pickHigherOvers(prev.firstOvers ?? prev.overs, next.firstOvers ?? next.overs);
    merged.overs = normalizeCricbuzzOvers(pickHigherOvers(prev.overs, merged.firstOvers));
  }

  if (next.runs != null || prev.runs != null) {
    merged.runs = pickMonotonicInt(prev.runs, next.runs);
  }
  if (next.wickets != null || prev.wickets != null) {
    merged.wickets = pickMonotonicInt(prev.wickets, next.wickets);
  }
  if (next.score2 != null || prev.score2 != null) {
    merged.score2 = pickMonotonicInt(prev.score2, next.score2);
  }
  if (next.wickets2 != null || prev.wickets2 != null) {
    merged.wickets2 = pickMonotonicInt(prev.wickets2, next.wickets2);
  }

  merged.firstTeamName = next.firstTeamName || prev.firstTeamName;
  merged.chaseTeamName = next.chaseTeamName || prev.chaseTeamName;

  if (match && merged.chaseTeamName) {
    const chasingTeam1 = teamNameMatches(match.team1?.name || '', merged.chaseTeamName);
    const slotRuns = chasingTeam1 ? merged.runs : merged.score2;
    const slotWickets = chasingTeam1 ? merged.wickets : merged.wickets2;
    const slotOvers = chasingTeam1 ? merged.overs : merged.overs2;
    if (slotRuns != null) merged.chaseRuns = pickMonotonicInt(merged.chaseRuns, slotRuns);
    if (slotWickets != null) merged.chaseWickets = pickMonotonicInt(merged.chaseWickets, slotWickets);
    merged.chaseOvers = normalizeCricbuzzOvers(pickHigherOvers(merged.chaseOvers, slotOvers));
  }

  if (match && merged.firstTeamName && merged.chaseTeamName) {
    const firstOnTeam1 = teamNameMatches(match.team1?.name || '', merged.firstTeamName);
    const firstRuns = firstOnTeam1 ? merged.runs : merged.score2;
    const firstWickets = firstOnTeam1 ? merged.wickets : merged.wickets2;
    const firstOvers = firstOnTeam1 ? merged.overs : merged.overs2;
    if (firstRuns != null) merged.firstRuns = pickMonotonicInt(merged.firstRuns, firstRuns);
    if (firstWickets != null) merged.firstWickets = pickMonotonicInt(merged.firstWickets, firstWickets);
    merged.firstOvers = normalizeCricbuzzOvers(pickHigherOvers(merged.firstOvers, firstOvers));
  }

  if (!merged.overs) merged.overs = normalizeCricbuzzOvers(pickHigherOvers(prev.overs, next.overs));
  if (!merged.overs2) merged.overs2 = normalizeCricbuzzOvers(pickHigherOvers(prev.overs2, next.overs2));

  merged.batter1 = next.batter1 || prev.batter1;
  merged.batter2 = next.batter2 || prev.batter2;
  merged.bowler = next.bowler || prev.bowler;
  merged.commentary = next.commentary || prev.commentary;
  merged.currentOverBalls = next.currentOverBalls?.length ? next.currentOverBalls : prev.currentOverBalls;

  const resolved = flattenCricketTeamScores(resolveCricketTeamScores(match, merged));
  merged.runs = resolved.runs;
  merged.wickets = resolved.wickets;
  merged.overs = resolved.overs;
  merged.score2 = resolved.score2;
  merged.wickets2 = resolved.wickets2;
  merged.overs2 = resolved.overs2;

  return merged;
}

/**
 * Full HTML scrape — only merge player names; never overwrite score fields.
 */
export function mergeCricketPlayersOnly(prev = {}, next = {}) {
  return {
    ...prev,
    batter1: next.batter1 || prev.batter1,
    batter2: next.batter2 || prev.batter2,
    bowler: next.bowler || prev.bowler,
    commentary: next.commentary || prev.commentary,
    currentOverBalls: next.currentOverBalls?.length ? next.currentOverBalls : prev.currentOverBalls,
  };
}
