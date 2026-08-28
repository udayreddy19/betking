import { useMemo, useRef } from 'react';
import { isPlaceholderPlayerName, parseLivePlayersFromCommentary } from '../utils/cricketPlayers';
import { isCricketSecondInnings, resolveCricketTeamScores, teamNameMatches } from '../utils/cricketScores';
import { enrichLivePlayersFromScorecard } from '../utils/scorecardLivePlayers';
import { getRosterForTeam } from '../data/cricketRosters';
import { resolveMatchSquads, squadToRoster } from '../utils/matchSquads';
import { oversToBalls } from '../utils/oversUtils';

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

function currentBattingTeamName(match, ld) {
  const t1 = match?.team1?.name || '';
  const t2 = match?.team2?.name || '';
  const isTest = ld.testInnings?.length > 0 || /test/i.test(ld.matchFormat || match?.matchFormat || '');
  if (isTest) {
    const currentInnId = ld.inningsId ?? (ld.testInnings?.length ? ld.testInnings[ld.testInnings.length - 1].inningsId : 1);
    const activeTestInn = (ld.testInnings || []).find((t) => t.inningsId === currentInnId) || (ld.testInnings || [])[(ld.testInnings || []).length - 1];
    if (activeTestInn?.batTeam) {
      return teamNameMatches(t2, activeTestInn.batTeam) ? t2 : t1;
    }
    if (currentInnId % 2 === 0) {
      return (ld.firstTeamName && teamNameMatches(t1, ld.firstTeamName)) ? t2 : t1;
    }
    return (ld.firstTeamName && teamNameMatches(t2, ld.firstTeamName)) ? t2 : t1;
  }

  if (ld.chaseTeamName) return ld.chaseTeamName;
  if (isCricketSecondInnings(match, ld)) {
    if (ld.firstTeamName && teamNameMatches(t1, ld.firstTeamName)) return t2;
    if (ld.firstTeamName && teamNameMatches(t2, ld.firstTeamName)) return t1;
    const scores = resolveCricketTeamScores(match, ld);
    return (scores.team2.balls || 0) > (scores.team1.balls || 0) ? t2 : t1;
  }
  if (ld.firstTeamName) return ld.firstTeamName;
  return t1;
}

function getBattingTeamName(match, ld) {
  return currentBattingTeamName(match, ld);
}

function emptyBatter() {
  return { name: '', runs: 0, balls: 0, fours: 0, sixes: 0 };
}

function hasLiveBatterStats(batter) {
  if (!batter?.name || isPlaceholderPlayerName(batter.name)) return false;
  return (Number(batter.runs) || 0) > 0 || (Number(batter.balls) || 0) > 0;
}

function battingSnapshot(match, ld) {
  const scores = resolveCricketTeamScores(match, ld);
  const t1 = match?.team1?.name || '';
  const t2 = match?.team2?.name || '';
  const isTest = ld.testInnings?.length > 0 || /test/i.test(ld.matchFormat || match?.matchFormat || '');
  if (isTest && ld.testInnings?.length) {
    const currentInnId = ld.inningsId ?? ld.testInnings[ld.testInnings.length - 1].inningsId;
    const activeTestInn = ld.testInnings.find((t) => t.inningsId === currentInnId) || ld.testInnings[ld.testInnings.length - 1];
    return {
      runs: Number(activeTestInn?.runs) || 0,
      wickets: Number(activeTestInn?.wickets) || 0,
      balls: oversToBalls(activeTestInn?.overs || '0.0'),
    };
  }

  let inn = scores.team1;
  if (ld.chaseTeamName) {
    inn = teamNameMatches(t1, ld.chaseTeamName) ? scores.team1 : scores.team2;
  } else if (isCricketSecondInnings(match, ld)) {
    if (ld.firstTeamName && teamNameMatches(t1, ld.firstTeamName)) inn = scores.team2;
    else if (ld.firstTeamName && teamNameMatches(t2, ld.firstTeamName)) inn = scores.team1;
    else inn = scores.team2;
  } else if (ld.firstTeamName && teamNameMatches(t2, ld.firstTeamName)) {
    inn = scores.team2;
  }
  return {
    runs: Number(inn?.runs) || 0,
    wickets: Number(inn?.wickets) || 0,
    balls: Number(inn?.balls) || oversToBalls(inn?.overs || '0.0'),
  };
}

function creaseRosterNames(match, ld) {
  const t1 = match?.team1?.name || '';
  const t2 = match?.team2?.name || '';
  const battingName = getBattingTeamName(match, ld) || t2 || t1;
  const bowlingName = teamNameMatches(battingName, t1) ? t2 : t1;
  const squads = resolveMatchSquads(match, t1, t2);
  const battingSquad = teamNameMatches(battingName, t1) ? squads.team1 : squads.team2;
  const bowlingSquad = teamNameMatches(bowlingName, t1) ? squads.team1 : squads.team2;
  const mapped = squadToRoster(battingSquad, bowlingSquad);
  const local = getRosterForTeam(battingName) || { batters: [], bowlers: [] };
  const bowlLocal = getRosterForTeam(bowlingName) || { batters: [], bowlers: [] };
  const batters = (mapped.batters?.length ? mapped.batters : local.batters) || [];
  const bowlers = (mapped.bowlers?.length ? mapped.bowlers : bowlLocal.bowlers) || [];
  return {
    striker: batters[0] && !isPlaceholderPlayerName(batters[0]) ? batters[0] : '',
    nonStriker: batters[1] && !isPlaceholderPlayerName(batters[1]) ? batters[1] : '',
    bowler: bowlers[0] && !isPlaceholderPlayerName(bowlers[0]) ? bowlers[0] : '',
  };
}

function estimateCreaseStats(snap) {
  const runs = Math.max(0, snap.runs || 0);
  const balls = Math.max(0, snap.balls || 0);
  const wkts = Math.max(0, Math.min(9, snap.wickets || 0));
  const dismissedShare = wkts / (wkts + 2);
  const partnership = Math.max(0, Math.round(runs * (1 - dismissedShare)));
  const strikerRuns = Math.max(0, Math.round(partnership * 0.58));
  const nonRuns = Math.max(0, partnership - strikerRuns);
  const partnershipBalls = balls > 0
    ? Math.max(1, Math.round(balls * (partnership / Math.max(1, runs))))
    : 0;
  const strikerBalls = Math.max(strikerRuns > 0 ? 1 : 0, Math.round(partnershipBalls * 0.58));
  const nonBalls = Math.max(nonRuns > 0 ? 1 : 0, partnershipBalls - strikerBalls);
  return {
    batter1: { runs: strikerRuns, balls: strikerBalls, fours: 0, sixes: 0 },
    batter2: { runs: nonRuns, balls: nonBalls, fours: 0, sixes: 0 },
  };
}

function countOverBoundaries(balls = []) {
  let fours = 0;
  let sixes = 0;
  let extras = 0;
  for (const ball of balls) {
    const s = String(ball);
    if (s === '4') fours += 1;
    else if (s === '6') sixes += 1;
    if (/wd|nb|lb/i.test(s)) extras += 1;
  }
  return { fours, sixes, extras };
}

function pickBatter(apiBatter, prevBatter) {
  if (hasLiveBatterStats(apiBatter)) return { ...emptyBatter(), ...apiBatter };
  if (apiBatter?.name && !isPlaceholderPlayerName(apiBatter.name)) {
    if (prevBatter?.name && apiBatter.name.toLowerCase() === prevBatter.name.toLowerCase()) {
      return {
        ...prevBatter,
        name: apiBatter.name,
        runs: Math.max(Number(apiBatter.runs) || 0, Number(prevBatter.runs) || 0),
        balls: Math.max(Number(apiBatter.balls) || 0, Number(prevBatter.balls) || 0),
        fours: Math.max(Number(apiBatter.fours) || 0, Number(prevBatter.fours) || 0),
        sixes: Math.max(Number(apiBatter.sixes) || 0, Number(prevBatter.sixes) || 0),
      };
    }
    return { ...emptyBatter(), ...apiBatter, fours: apiBatter.fours ?? 0, sixes: apiBatter.sixes ?? 0 };
  }
  return prevBatter ? { ...emptyBatter(), ...prevBatter } : emptyBatter();
}

/** Keep tracker stats moving with the innings score when the feed has no player lines. */
export function mergeFieldStateWithInnings(prev, api, match) {
  if (!api && !prev) return null;
  const ld = match?.liveDetails || {};
  const snap = battingSnapshot(match, ld);
  const overBounds = countOverBoundaries(api?.overBalls || ld.currentOverBalls || []);

  if (!prev || prev.matchId !== match?.id) {
    const names = creaseRosterNames(match, ld);
    const seeded = (!hasLiveBatterStats(api?.batter1) && snap.runs > 0)
      ? estimateCreaseStats(snap)
      : null;
    return {
      ...(api || {}),
      matchId: match?.id,
      batter1: {
        ...(seeded ? seeded.batter1 : (api?.batter1 || emptyBatter())),
        name: (api?.batter1?.name && !isPlaceholderPlayerName(api.batter1.name))
          ? api.batter1.name
          : (names.striker || ''),
      },
      batter2: {
        ...(seeded ? seeded.batter2 : (api?.batter2 || emptyBatter())),
        name: api?.batter2?.name || names.nonStriker || '',
      },
      bowler: api?.bowler || names.bowler || '',
      syncedRuns: snap.runs,
      syncedWickets: snap.wickets,
      syncedBalls: snap.balls,
      inningsFours: Math.max(api?.inningsFours || 0, overBounds.fours),
      inningsSixes: Math.max(api?.inningsSixes || 0, overBounds.sixes),
      extras: Math.max(api?.extras || 0, overBounds.extras, Number(ld.extras) || 0),
    };
  }

  const apiHasStats = hasLiveBatterStats(api?.batter1) || hasLiveBatterStats(api?.batter2);
  let batter1 = pickBatter(api?.batter1, prev.batter1);
  let batter2 = pickBatter(api?.batter2, prev.batter2);
  let strikerIdx = prev.strikerIdx ?? 0;
  let inningsFours = Math.max(api?.inningsFours || 0, prev.inningsFours || 0, overBounds.fours);
  let inningsSixes = Math.max(api?.inningsSixes || 0, prev.inningsSixes || 0, overBounds.sixes);
  let extras = Math.max(api?.extras || 0, prev.extras || 0, overBounds.extras, Number(ld.extras) || 0);
  let bowler = api?.bowler || prev.bowler || '';

  const dRuns = snap.runs - (prev.syncedRuns ?? snap.runs);
  const dBalls = snap.balls - (prev.syncedBalls ?? snap.balls);
  const dWkts = snap.wickets - (prev.syncedWickets ?? snap.wickets);

  if (!apiHasStats) {
    if ((batter1.runs || 0) + (batter2.runs || 0) === 0 && snap.runs > 0) {
      const names = creaseRosterNames(match, ld);
      const seeded = estimateCreaseStats(snap);
      batter1 = { ...batter1, ...seeded.batter1, name: batter1.name || names.striker };
      batter2 = { ...batter2, ...seeded.batter2, name: batter2.name || names.nonStriker };
      if (!bowler) bowler = names.bowler;
    }
    if (dWkts > 0) {
      if (strikerIdx === 0) batter1 = { ...batter1, runs: 0, balls: 0, fours: 0, sixes: 0 };
      else batter2 = { ...batter2, runs: 0, balls: 0, fours: 0, sixes: 0 };
    }
    const addRuns = Math.max(0, dRuns);
    const addBalls = Math.max(0, dBalls);
    if (addRuns || addBalls) {
      const striker = strikerIdx === 0 ? { ...batter1 } : { ...batter2 };
      striker.runs += addRuns;
      striker.balls += addBalls;
      if (addRuns === 4 && addBalls <= 2) {
        striker.fours += 1;
        inningsFours += 1;
      }
      if (addRuns === 6 && addBalls <= 2) {
        striker.sixes += 1;
        inningsSixes += 1;
      }
      if (strikerIdx === 0) batter1 = striker;
      else batter2 = striker;
      if (addBalls === 1 && addRuns % 2 === 1) strikerIdx = strikerIdx === 0 ? 1 : 0;
    }
  }

  return {
    ...api,
    matchId: match?.id,
    batter1,
    batter2,
    bowler: bowler || api?.bowler || prev.bowler || '',
    strikerIdx,
    inningsFours,
    inningsSixes,
    extras,
    syncedRuns: snap.runs,
    syncedWickets: snap.wickets,
    syncedBalls: snap.balls,
  };
}

/** Build field view state from API liveDetails, then keep stats in step with innings totals. */
export function buildFieldStateFromApi(match) {
  const ld = enrichLivePlayersFromScorecard(
    match?.liveDetails || {},
    match?.scorecardInnings || [],
  );
  const parsed = parseLivePlayersFromCommentary(
    ld.commentary || match?.liveDetails?.commentary || '',
    [match?.team1?.name, match?.team2?.name],
  );
  if (!ld.batter1?.name && parsed.batter1) ld.batter1 = parsed.batter1;
  if (!ld.batter2?.name && parsed.batter2) ld.batter2 = parsed.batter2;
  const scores = resolveCricketTeamScores(match, ld);
  const hasScore = (Number(scores.team1?.runs) || 0) > 0
    || (Number(scores.team2?.runs) || 0) > 0
    || (Number(scores.team1?.balls) || 0) > 0
    || (Number(scores.team2?.balls) || 0) > 0;
  if (!ld.batter1 && !ld.batter2 && !hasScore && !ld.currentOverBalls?.length) {
    return null;
  }

  const batter1 = ld.batter1 && !isPlaceholderPlayerName(ld.batter1.name)
    ? { ...ld.batter1, fours: ld.batter1.fours ?? 0, sixes: ld.batter1.sixes ?? 0 }
    : emptyBatter();

  const batter2 = ld.batter2 && !isPlaceholderPlayerName(ld.batter2.name)
    ? { ...ld.batter2, fours: ld.batter2.fours ?? 0, sixes: ld.batter2.sixes ?? 0 }
    : emptyBatter();

  const overHistory = match?.overHistory || [];
  const currentOver = overHistory.find((o) => o.isCurrent) || overHistory[overHistory.length - 1];
  const boundaries = aggregateBoundariesFromScorecard(match, getBattingTeamName(match, ld));
  const overBounds = countOverBoundaries(ld.currentOverBalls || currentOver?.balls || []);

  return {
    matchId: match?.id,
    overNum: currentOver?.overNum ?? 1,
    overBalls: ld.currentOverBalls || currentOver?.balls || [],
    recentOvers: overHistory.filter((o) => !o.isCurrent).slice(-3),
    strikerIdx: 0,
    batter1,
    batter2,
    bowler: ld.bowler?.name && !isPlaceholderPlayerName(ld.bowler.name) ? ld.bowler.name : '',
    inningsFours: ld.fours || boundaries?.fours || batter1.fours + batter2.fours || overBounds.fours,
    inningsSixes: ld.sixes || boundaries?.sixes || batter1.sixes + batter2.sixes || overBounds.sixes,
    extras: ld.extras || overBounds.extras || 0,
    fromApi: true,
  };
}

export function useLiveFieldState(match) {
  const prevRef = useRef(null);
  const ld = match?.liveDetails || {};
  const stateKey = [
    match?.id,
    ld.runs,
    ld.wickets,
    ld.overs,
    ld.score2,
    ld.chaseRuns,
    ld.chaseOvers,
    ld.wickets2,
    ld.batter1?.name,
    ld.batter1?.runs,
    ld.batter1?.balls,
    ld.batter2?.name,
    ld.batter2?.runs,
    ld.scorecardInnings?.length,
  ].join(':');

  return useMemo(() => {
    const api = match ? buildFieldStateFromApi(match) : null;
    const next = mergeFieldStateWithInnings(prevRef.current, api, match);
    prevRef.current = next;
    return next;
  }, [match, stateKey]);
}
