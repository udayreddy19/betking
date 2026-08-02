/** Derives and advances live cricket field-view state for the pitch widget. */

const RUN_SEQUENCE = [1, 0, 2, 1, 4, 1, 0, 1, 2, 6, 1, 1, 4, 0, 2, 1, 3, 1, 0, 4];
const WAGON_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export function parseOvers(oversStr) {
  const parts = String(oversStr || '0.0').split('.');
  const over = parseInt(parts[0], 10) || 0;
  const ball = parseInt(parts[1], 10) || 0;
  return { over, ball };
}

export function formatBall(run) {
  if (run === 'W' || run === -1) return 'W';
  if (run === 0 || run === '0' || run === '•') return '•';
  return String(run);
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function nextRun(matchId, ballIndex) {
  const seed = hashSeed(`${matchId}-${ballIndex}`);
  return RUN_SEQUENCE[seed % RUN_SEQUENCE.length];
}

function runsToWagonAngle(runs) {
  const map = { 0: 315, 1: 270, 2: 45, 3: 90, 4: 180, 6: 0 };
  return map[runs] ?? WAGON_ANGLES[runs % WAGON_ANGLES.length];
}

function getBattingTeamIndex(match) {
  const ld = match?.liveDetails || {};
  const { over: o2 } = parseOvers(ld.overs2);
  const hasSecond = (ld.score2 ?? 0) > 0 || o2 > 0;
  if (hasSecond && match?.matchState === 'in') return 2;
  return 1;
}

export function buildRosterFallback(teamName) {
  const short = teamName.replace(/\s+W$/, '').split(' ')[0];
  return {
    batters: [`${short} Batter 1`, `${short} Batter 2`, `${short} Batter 3`],
    bowlers: [`${short} Bowler`, `${short} Bowler 2`],
  };
}

export function createFieldState(match, roster) {
  const ld = match?.liveDetails || {};
  const matchId = match?.id || 'default';
  const { over, ball } = parseOvers(
    getBattingTeamIndex(match) === 2 ? (ld.overs2 || ld.overs) : ld.overs
  );

  const ballsInOver = [];
  const startBall = Math.max(0, ball);
  for (let i = 0; i < startBall; i += 1) {
    ballsInOver.push(formatBall(nextRun(matchId, over * 6 + i)));
  }

  const strikerIdx = 0;
  const batter1 = {
    name: ld.batter1?.name || roster.batters[strikerIdx],
    runs: ld.batter1?.runs ?? 12 + (over % 5) * 3,
    balls: ld.batter1?.balls ?? 8 + startBall,
    fours: ld.batter1?.fours ?? 2,
    sixes: ld.batter1?.sixes ?? 0,
  };
  const batter2 = {
    name: ld.batter2?.name || roster.batters[1],
    runs: ld.batter2?.runs ?? 8 + (over % 3) * 2,
    balls: ld.batter2?.balls ?? 6 + startBall,
    fours: ld.batter2?.fours ?? 1,
    sixes: ld.batter2?.sixes ?? 0,
  };

  const lastBall = ballsInOver.length > 0
    ? ballsInOver[ballsInOver.length - 1]
    : formatBall(nextRun(matchId, 0));
  const lastRun = lastBall === 'W' ? 0 : (lastBall === '•' ? 0 : parseInt(lastBall, 10) || 1);

  const recentOvers = [];
  if (over > 0) {
    const prevBalls = [];
    for (let i = 0; i < 6; i += 1) {
      prevBalls.push(formatBall(nextRun(matchId, (over - 1) * 6 + i)));
    }
    recentOvers.push({ overNum: over, balls: prevBalls, runs: 7, wickets: 0 });
  }

  return {
    matchId,
    overNum: Math.max(1, over || 1),
    overBalls: ballsInOver.length > 0 ? ballsInOver : [formatBall(nextRun(matchId, 0))],
    recentOvers,
    ballIndex: over * 6 + startBall,
    strikerIdx,
    batter1,
    batter2,
    bowler: ld.bowler?.name || roster.bowlers[0],
    lastBallRun: lastRun,
    wagonAngle: runsToWagonAngle(lastRun),
    inningsFours: ld.fours ?? 8 + over,
    inningsSixes: ld.sixes ?? 2 + (over % 3),
    extras: ld.extras ?? 2,
    syncedRuns: ld.runs ?? 0,
    syncedScore2: ld.score2 ?? 0,
    syncedOvers: ld.overs || '0.0',
    syncedWickets: ld.wickets ?? 0,
    lastTickAt: Date.now(),
  };
}

export function tickFieldState(state, match, roster) {
  if (!state || !match) return state;

  const matchId = match.id || 'default';
  const ld = match.liveDetails || {};
  const isLive = match.matchState === 'in' || match.isLive;

  if (!isLive) return state;

  const nextBallIndex = state.ballIndex + 1;
  let run = nextRun(matchId, nextBallIndex);

  // Occasional wicket (~6%)
  if (hashSeed(`${matchId}-w-${nextBallIndex}`) % 17 === 0) {
    run = 'W';
  }

  const ballLabel = formatBall(run);
  let overBalls = [...state.overBalls, ballLabel];
  let overNum = state.overNum;
  let strikerIdx = state.strikerIdx;
  let batter1 = { ...state.batter1 };
  let batter2 = { ...state.batter2 };
  let bowler = state.bowler;
  let recentOvers = [...(state.recentOvers || [])];
  let inningsFours = state.inningsFours ?? 0;
  let inningsSixes = state.inningsSixes ?? 0;
  let extras = state.extras ?? 0;

  if (overBalls.length > 6) {
    const completedBalls = state.overBalls;
    let overRuns = 0;
    let overWkts = 0;
    completedBalls.forEach((b) => {
      if (b === 'W') overWkts += 1;
      else if (b !== '•') overRuns += parseInt(b, 10) || 0;
    });
    recentOvers = [...recentOvers.slice(-3), { overNum, balls: completedBalls, runs: overRuns, wickets: overWkts }];
    overBalls = [ballLabel];
    overNum += 1;
    bowler = roster.bowlers[overNum % roster.bowlers.length] || bowler;
  }

  if (run === 'W') {
    const outIdx = strikerIdx;
    const nextBatter = roster.batters[(outIdx + 2) % roster.batters.length] || `${roster.batters[0]}*`;
    if (outIdx === 0) batter1 = { name: nextBatter, runs: 0, balls: 0, fours: 0, sixes: 0 };
    else batter2 = { name: nextBatter, runs: 0, balls: 0, fours: 0, sixes: 0 };
  } else {
    const numericRun = typeof run === 'number' ? run : parseInt(run, 10) || 0;
    const striker = strikerIdx === 0 ? batter1 : batter2;
    striker.runs += numericRun;
    striker.balls += 1;
    if (numericRun === 4) striker.fours += 1;
    if (numericRun === 6) striker.sixes += 1;
    if (numericRun === 4) inningsFours += 1;
    if (numericRun === 6) inningsSixes += 1;
    if (strikerIdx === 0) batter1 = { ...striker };
    else batter2 = { ...striker };

    if (numericRun % 2 === 1) {
      strikerIdx = strikerIdx === 0 ? 1 : 0;
    }
  }

  const lastRun = run === 'W' ? 0 : (run === 0 ? 0 : (typeof run === 'number' ? run : parseInt(run, 10) || 0));

  return {
    ...state,
    overNum,
    overBalls,
    recentOvers,
    ballIndex: nextBallIndex,
    strikerIdx,
    batter1,
    batter2,
    bowler,
    lastBallRun: lastRun,
    wagonAngle: runsToWagonAngle(lastRun),
    inningsFours,
    inningsSixes,
    extras,
    lastTickAt: Date.now(),
  };
}

export function needsResync(state, match) {
  if (!state || !match) return true;
  if (state.matchId !== match.id) return true;
  const ld = match.liveDetails || {};
  return (
    state.syncedRuns !== (ld.runs ?? 0)
    || state.syncedScore2 !== (ld.score2 ?? 0)
    || state.syncedOvers !== (ld.overs || '0.0')
    || state.syncedWickets !== (ld.wickets ?? 0)
  );
}

export function syncFieldStateFromMatch(state, match, roster) {
  const ld = match?.liveDetails || {};
  const fresh = createFieldState(match, roster);

  if (!state || state.matchId !== match.id) return fresh;

  const oversChanged = state.syncedOvers !== (ld.overs || '0.0');

  return {
    ...fresh,
    overBalls: ld.currentOverBalls?.map(formatBall) || fresh.overBalls,
    batter1: ld.batter1 ? { ...fresh.batter1, ...ld.batter1 } : fresh.batter1,
    batter2: ld.batter2 ? { ...fresh.batter2, ...ld.batter2 } : fresh.batter2,
    bowler: ld.bowler?.name || fresh.bowler,
    ballIndex: oversChanged ? fresh.ballIndex : Math.max(state.ballIndex, fresh.ballIndex),
    lastTickAt: Date.now(),
  };
}

export { runsToWagonAngle, WAGON_ANGLES };
