import { useMemo } from 'react';
import { isPlaceholderPlayerName } from '../utils/cricketPlayers';
import { teamNameMatches } from '../utils/cricketScores';
import { enrichLivePlayersFromScorecard } from '../utils/scorecardLivePlayers';

function aggregateBoundariesFromScorecard(match, battingTeamName) {
  const innings = match?.scorecardInnings?.find(
    (inn) => inn.batTeamName && battingTeamName && teamNameMatches(inn.batTeamName, battingTeamName),
  );
  if (!innings?.batters?.length) return null;

  return innings.batters.reduce(
    (acc, batter) => ({
      fours: acc.fours + (batter.fours ?? 0),
      sixes: acc.sixes + (batter.sixes ?? 0),
    }),
    { fours: 0, sixes: 0 },
  );
}

function getBattingTeamName(match, ld) {
  if (ld.chaseTeamName) return ld.chaseTeamName;
  if (ld.firstTeamName) return ld.firstTeamName;
  return match?.team1?.name || '';
}

/** Build field view state purely from API liveDetails — no simulation. */
export function buildFieldStateFromApi(match) {
  const ld = enrichLivePlayersFromScorecard(
    match?.liveDetails || {},
    match?.scorecardInnings || [],
  );
  if (!ld.batter1 && !ld.batter2 && ld.runs == null && ld.chaseRuns == null
    && ld.firstRuns == null && !ld.currentOverBalls?.length) {
    return null;
  }

  const batter1 = ld.batter1 && !isPlaceholderPlayerName(ld.batter1.name)
    ? { ...ld.batter1, fours: ld.batter1.fours ?? 0, sixes: ld.batter1.sixes ?? 0 }
    : { name: '', runs: 0, balls: 0, fours: 0, sixes: 0 };

  const batter2 = ld.batter2 && !isPlaceholderPlayerName(ld.batter2.name)
    ? { ...ld.batter2, fours: ld.batter2.fours ?? 0, sixes: ld.batter2.sixes ?? 0 }
    : { name: '', runs: 0, balls: 0, fours: 0, sixes: 0 };

  const overHistory = match?.overHistory || [];
  const currentOver = overHistory.find((o) => o.isCurrent) || overHistory[overHistory.length - 1];
  const boundaries = aggregateBoundariesFromScorecard(match, getBattingTeamName(match, ld));

  return {
    matchId: match?.id,
    overNum: currentOver?.overNum ?? 1,
    overBalls: ld.currentOverBalls || currentOver?.balls || [],
    recentOvers: overHistory.filter((o) => !o.isCurrent).slice(-3),
    strikerIdx: 0,
    batter1,
    batter2,
    bowler: ld.bowler?.name && !isPlaceholderPlayerName(ld.bowler.name) ? ld.bowler.name : '',
    inningsFours: ld.fours ?? boundaries?.fours ?? (batter1.fours + batter2.fours),
    inningsSixes: ld.sixes ?? boundaries?.sixes ?? (batter1.sixes + batter2.sixes),
    extras: ld.extras ?? 0,
    fromApi: true,
  };
}

export function useLiveFieldState(match) {
  return useMemo(() => buildFieldStateFromApi(match), [
    match,
    match?.id,
    match?.overHistory,
    match?.scorecardInnings,
    match?.liveDetails?.runs,
    match?.liveDetails?.wickets,
    match?.liveDetails?.overs,
    match?.liveDetails?.score2,
    match?.liveDetails?.chaseRuns,
    match?.liveDetails?.firstRuns,
    match?.liveDetails?.batter1,
    match?.liveDetails?.batter2,
    match?.liveDetails?.bowler,
    match?.liveDetails?.currentOverBalls,
    match?.liveDetails?.chaseTeamName,
    match?.liveDetails?.firstTeamName,
  ]);
}
