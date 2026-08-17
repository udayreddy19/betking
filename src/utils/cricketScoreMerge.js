import { normalizeCricbuzzOvers, oversToBalls } from './oversUtils';
import { flattenCricketTeamScores, resolveCricketTeamScores } from './cricketScores';
import { isPlaceholderPlayerName } from './cricketPlayers';

function batterStatWeight(player) {
  if (!player || typeof player === 'string') return 0;
  return (Number(player.runs) || 0)
    + (Number(player.balls) || 0)
    + (Number(player.fours) || 0)
    + (Number(player.sixes) || 0)
    + (Number(player.wickets) || 0);
}

function mergePlayerStats(primary, fallback) {
  if (!primary) return fallback;
  if (!fallback) return primary;
  if (typeof primary === 'string' || typeof fallback === 'string') return primary;
  return {
    ...fallback,
    ...primary,
    name: primary.name || fallback.name,
    runs: Math.max(Number(primary.runs) || 0, Number(fallback.runs) || 0),
    balls: Math.max(Number(primary.balls) || 0, Number(fallback.balls) || 0),
    fours: Math.max(Number(primary.fours) || 0, Number(fallback.fours) || 0),
    sixes: Math.max(Number(primary.sixes) || 0, Number(fallback.sixes) || 0),
    wickets: Math.max(Number(primary.wickets) || 0, Number(fallback.wickets) || 0),
    overs: primary.overs || fallback.overs,
    maidens: primary.maidens ?? fallback.maidens,
  };
}

function pickNamedPlayer(nextPlayer, prevPlayer) {
  const nextName = nextPlayer?.name || (typeof nextPlayer === 'string' ? nextPlayer : '');
  const prevName = prevPlayer?.name || (typeof prevPlayer === 'string' ? prevPlayer : '');
  const nextValid = nextName && !isPlaceholderPlayerName(nextName);
  const prevValid = prevName && !isPlaceholderPlayerName(prevName);
  if (nextValid && prevValid) {
    if (nextName.toLowerCase() === prevName.toLowerCase()) {
      return mergePlayerStats(nextPlayer, prevPlayer);
    }
    if (batterStatWeight(nextPlayer) === 0 && batterStatWeight(prevPlayer) > 0) {
      return prevPlayer;
    }
    return nextPlayer;
  }
  if (nextValid) return nextPlayer;
  if (prevValid) return prevPlayer;
  return nextPlayer || prevPlayer;
}

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

  // Check if second innings has genuinely started
  const isSecondInnings = (next.inningsId != null && next.inningsId >= 2)
    || (prev.inningsId != null && prev.inningsId >= 2)
    || (next.chaseRuns != null && next.chaseRuns > 0)
    || (prev.chaseRuns != null && prev.chaseRuns > 0)
    || (next.chaseOvers && next.chaseOvers !== '0.0')
    || (next.wickets2 != null && next.wickets2 > 0)
    || (prev.wickets2 != null && prev.wickets2 > 0);

  if (!isSecondInnings) {
    merged.chaseRuns = undefined;
    merged.chaseWickets = undefined;
    merged.chaseOvers = undefined;
    merged.score2 = 0;
    merged.wickets2 = 0;
    merged.overs2 = '0.0';

    const prevFirst = prev.firstRuns ?? prev.runs;
    const nextFirst = next.firstRuns ?? next.runs;
    merged.firstRuns = pickMonotonicInt(prevFirst, nextFirst);
    merged.runs = merged.firstRuns;
    merged.firstWickets = pickMonotonicInt(prev.firstWickets ?? prev.wickets, next.firstWickets ?? next.wickets);
    merged.wickets = merged.firstWickets;
    merged.firstOvers = pickHigherOvers(prev.firstOvers ?? prev.overs, next.firstOvers ?? next.overs);
    merged.overs = normalizeCricbuzzOvers(merged.firstOvers);
  } else {
    merged.firstRuns = pickMonotonicInt(prev.firstRuns, next.firstRuns);
    merged.firstWickets = pickMonotonicInt(prev.firstWickets, next.firstWickets);
    merged.firstOvers = pickHigherOvers(prev.firstOvers, next.firstOvers);

    if (next.chaseRuns != null) merged.chaseRuns = Number(next.chaseRuns);
    else if (prev.chaseRuns != null) merged.chaseRuns = Number(prev.chaseRuns);

    merged.chaseWickets = next.chaseWickets ?? prev.chaseWickets ?? 0;
    merged.chaseOvers = next.chaseOvers || prev.chaseOvers || '0.0';
    merged.score2 = merged.chaseRuns ?? 0;
    merged.wickets2 = merged.chaseWickets;
    merged.overs2 = normalizeCricbuzzOvers(merged.chaseOvers);
    merged.chaseBallNbr = next.chaseBallNbr ?? prev.chaseBallNbr;
    merged.inningsId = next.inningsId ?? prev.inningsId ?? 2;
    merged.runs = merged.firstRuns ?? prev.runs;
    merged.wickets = merged.firstWickets ?? prev.wickets;
    merged.overs = normalizeCricbuzzOvers(merged.firstOvers || prev.overs);
  }

  merged.batter1 = pickNamedPlayer(next.batter1, prev.batter1);
  merged.batter2 = pickNamedPlayer(next.batter2, prev.batter2);
  merged.bowler = pickNamedPlayer(next.bowler, prev.bowler);
  merged.commentary = next.commentary || prev.commentary;
  merged.commentaryFeed = next.commentaryFeed?.length ? next.commentaryFeed : prev.commentaryFeed;
  merged.commentaryList = next.commentaryList?.length ? next.commentaryList : prev.commentaryList;
  merged.currentOverBalls = next.currentOverBalls?.length ? next.currentOverBalls : prev.currentOverBalls;
  merged.extras = next.extras ?? prev.extras;
  merged.partnership = next.partnership || prev.partnership;
  merged.toss = next.toss || prev.toss;
  merged.fours = next.fours ?? prev.fours;
  merged.sixes = next.sixes ?? prev.sixes;

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
    batter1: pickNamedPlayer(next.batter1, prev.batter1),
    batter2: pickNamedPlayer(next.batter2, prev.batter2),
    bowler: pickNamedPlayer(next.bowler, prev.bowler),
    commentary: next.commentary || prev.commentary,
    currentOverBalls: next.currentOverBalls?.length ? next.currentOverBalls : prev.currentOverBalls,
  };
}
