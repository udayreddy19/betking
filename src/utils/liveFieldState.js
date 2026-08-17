import { isPlaceholderPlayerName } from './cricketPlayers';
import { isCricketSecondInnings, resolveCricketTeamScores } from './cricketScores';
import { oversToBalls } from './oversUtils';
import { getRosterForTeam } from '../data/cricketRosters';

const RUN_SEQUENCE = [1, 0, 2, 1, 4, 1, 0, 1, 2, 6, 1, 1, 4, 0, 2, 1, 3, 1, 0, 4];
const EXTRA_OUTCOMES = ['wd', '1wd', '2wd', 'lb', '1lb', '2lb', 'nb', '1nb', 'W'];
const WAGON_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export function parseOvers(oversStr) {
  const parts = String(oversStr || '0.0').split('.');
  const over = parseInt(parts[0], 10) || 0;
  const ball = parseInt(parts[1], 10) || 0;
  return { over, ball };
}

/** Format a ball outcome for display (runs, extras, wicket). */
export function formatBallOutcome(outcome) {
  if (outcome === 'W' || outcome === -1) return 'W';
  if (outcome === 0 || outcome === '0' || outcome === '•') return '•';
  if (typeof outcome === 'number') return String(outcome);

  const s = String(outcome).toLowerCase().trim();
  if (s === 'wd' || s === 'wide') return 'Wd';
  if (s === 'lb' || s === 'legbye') return 'Lb';
  if (s === 'nb' || s === 'noball') return 'Nb';
  const wd = s.match(/^(\d+)wd$/);
  if (wd) return `${wd[1]}Wd`;
  const lb = s.match(/^(\d+)lb$/);
  if (lb) return `${lb[1]}Lb`;
  const nb = s.match(/^(\d+)nb$/);
  if (nb) return `${nb[1]}Nb`;

  return String(outcome);
}

/** @deprecated use formatBallOutcome */
export function formatBall(run) {
  return formatBallOutcome(run);
}

export function isNonLegalDelivery(label) {
  const s = String(label).toLowerCase();
  return s.includes('wd') || s.includes('nb') || s === 'wide' || s === 'noball';
}

export function getBallDisplayKind(ball) {
  const raw = String(ball || '');
  const b = raw.toLowerCase();
  if (raw === 'W') return 'wicket';
  if (raw === '•' || raw === '0' || !raw) return 'dot';
  if (b.includes('wd')) return 'wide';
  if (b.includes('lb')) return 'legbye';
  if (b.includes('nb')) return 'noball';
  if (raw === '4' || raw === '6') return 'boundary';
  return 'run';
}

export function getBallDisplayLabel(ball) {
  if (ball === '•' || ball === '0') return '';
  return String(ball);
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function nextBallOutcome(matchId, ballIndex) {
  const seed = hashSeed(`${matchId}-${ballIndex}`);
  const roll = seed % 100;

  if (roll < 4) return 'W';
  if (roll < 7) return EXTRA_OUTCOMES[(seed >> 2) % EXTRA_OUTCOMES.length];
  return RUN_SEQUENCE[seed % RUN_SEQUENCE.length];
}



function runsToWagonAngle(runs) {
  const map = { 0: 315, 1: 270, 2: 45, 3: 90, 4: 180, 6: 0 };
  return map[runs] ?? WAGON_ANGLES[runs % WAGON_ANGLES.length];
}

function getBattingTeamIndex(match) {
  const ld = match?.liveDetails || {};
  if (match?.matchState !== 'in') return 1;

  const { team1, team2 } = resolveCricketTeamScores(match, ld);
  if (isCricketSecondInnings(match, ld)) {
    return oversToBalls(team2.overs) > oversToBalls(team1.overs) ? 2 : 1;
  }

  if (team2.balls > 0 && team1.balls === 0) return 2;
  if (team1.balls > 0) return 1;
  return (ld.score2 ?? 0) > 0 ? 2 : 1;
}

export function generateOverBalls(matchId, overNum) {
  const balls = [];
  let legal = 0;
  let idx = 0;

  while (legal < 6 && idx < 10) {
    const outcome = nextBallOutcome(matchId, (overNum - 1) * 6 + idx);
    const label = formatBallOutcome(outcome);
    balls.push(label);
    idx += 1;
    if (!isNonLegalDelivery(label)) legal += 1;
  }

  return balls;
}

export function generateCurrentOverBalls(matchId, oversStr) {
  const { over, ball } = parseOvers(oversStr);
  const currentOverNum = Math.max(1, over || 1);
  const balls = [];

  let legal = 0;
  let idx = 0;
  const targetLegal = ball;

  while (legal < targetLegal && idx < 10) {
    const outcome = nextBallOutcome(matchId, (currentOverNum - 1) * 6 + idx);
    balls.push(formatBallOutcome(outcome));
    idx += 1;
    if (!isNonLegalDelivery(balls[balls.length - 1])) legal += 1;
  }

  return { overNum: currentOverNum, balls };
}

function resolveBatterName(apiName, rosterName) {
  if (apiName && !isPlaceholderPlayerName(apiName)) return apiName.trim();
  if (rosterName && !isPlaceholderPlayerName(rosterName)) return rosterName.trim();
  return '';
}

export function buildRosterFallback(teamName) {
  const roster = getRosterForTeam(teamName);
  return {
    batters: roster?.batters?.length ? roster.batters : [],
    bowlers: roster?.bowlers?.length ? roster.bowlers : [],
  };
}

export function createFieldState(match, roster) {
  const ld = match?.liveDetails || {};
  const matchId = match?.id || 'default';
  const battingIdx = getBattingTeamIndex(match);
  const oversStr = battingIdx === 2
    ? (ld.overs2 || ld.chaseOvers || ld.overs || '0.0')
    : (ld.overs || ld.firstOvers || '0.0');

  const { overNum, balls: ballsInOver } = generateCurrentOverBalls(matchId, oversStr);

  const activeRoster = (roster?.batters?.length && !isPlaceholderPlayerName(roster.batters[0]))
    ? roster
    : { batters: [], bowlers: [] };

  const batters = Array.isArray(activeRoster.batters) ? activeRoster.batters : [];
  const bowlers = Array.isArray(activeRoster.bowlers) ? activeRoster.bowlers : [];
  const strikerIdx = 0;
  const b1Name = resolveBatterName(ld.batter1?.name, batters[strikerIdx]);
  const b2Name = resolveBatterName(ld.batter2?.name, batters[1]);

  const batter1 = {
    name: b1Name || null,
    runs: ld.batter1?.runs ?? 0,
    balls: ld.batter1?.balls ?? 0,
    fours: ld.batter1?.fours ?? 0,
    sixes: ld.batter1?.sixes ?? 0,
  };
  const batter2 = {
    name: b2Name || null,
    runs: ld.batter2?.runs ?? 0,
    balls: ld.batter2?.balls ?? 0,
    fours: ld.batter2?.fours ?? 0,
    sixes: ld.batter2?.sixes ?? 0,
  };

  const lastBall = ballsInOver.length > 0
    ? ballsInOver[ballsInOver.length - 1]
    : formatBallOutcome(nextBallOutcome(matchId, 0));
  const lastRun = lastBall === 'W' ? 0 : (lastBall === '•' ? 0 : parseInt(lastBall, 10) || 1);

  const recentOvers = [];
  if (overNum > 0 && ballsInOver.length) {
    recentOvers.push({
      overNum,
      balls: ballsInOver,
      runs: ballsInOver.reduce((sum, ball) => sum + (parseInt(ball, 10) || 0), 0),
      wickets: ballsInOver.filter((ball) => String(ball).toUpperCase() === 'W').length,
    });
  }

  return {
    matchId,
    overNum,
    overBalls: ballsInOver,
    recentOvers,
    ballIndex: ballsInOver.length,
    strikerIdx,
    batter1,
    batter2,
    bowler: resolveBatterName(ld.bowler?.name, roster?.bowlers?.[0]),
    lastBallRun: lastRun,
    wagonAngle: runsToWagonAngle(lastRun),
    inningsFours: ld.fours ?? 0,
    inningsSixes: ld.sixes ?? 0,
    extras: ld.extras ?? 0,
    syncedRuns: ld.firstRuns ?? ld.runs ?? 0,
    syncedScore2: ld.chaseRuns ?? ld.score2 ?? 0,
    syncedOvers: oversStr,
    syncedWickets: ld.wickets ?? 0,
    lastTickAt: Date.now(),
  };
}

export function tickFieldState(state, match, roster) {
  if (!state || !match) return state;

  const matchId = match.id || 'default';
  const isLive = match.matchState === 'in' || match.isLive;

  if (!isLive) return state;

  const nextBallIndex = state.ballIndex + 1;
  const outcome = nextBallOutcome(matchId, nextBallIndex);
  const ballLabel = formatBallOutcome(outcome);

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

  if (!isNonLegalDelivery(ballLabel)) {
    const legalCount = overBalls.filter((b) => !isNonLegalDelivery(b)).length;
    if (legalCount >= 6) {
      let overRuns = 0;
      let overWkts = 0;
      overBalls.forEach((b) => {
        if (b === 'W') overWkts += 1;
        else if (b !== '•' && !isNonLegalDelivery(b)) overRuns += parseInt(b, 10) || 0;
      });
      recentOvers = [...recentOvers.slice(-3), { overNum, balls: [...overBalls], runs: overRuns, wickets: overWkts }];
      overBalls = [];
      overNum += 1;
      bowler = bowlers[overNum % Math.max(bowlers.length, 1)] || bowler;
    }
  } else {
    extras += 1;
  }

  if (outcome === 'W') {
    const outIdx = strikerIdx;
    const nextBatter = batters.length
      ? batters[(outIdx + 2) % batters.length]
      : 'Batter';
    if (outIdx === 0) batter1 = { name: nextBatter, runs: 0, balls: 0, fours: 0, sixes: 0 };
    else batter2 = { name: nextBatter, runs: 0, balls: 0, fours: 0, sixes: 0 };
  } else if (!isNonLegalDelivery(ballLabel)) {
    const numericRun = typeof outcome === 'number' ? outcome : parseInt(ballLabel, 10) || 0;
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

  const lastRun = outcome === 'W' ? 0 : (outcome === 0 ? 0 : (typeof outcome === 'number' ? outcome : parseInt(ballLabel, 10) || 0));

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
  const battingIdx = getBattingTeamIndex(match);
  const oversStr = battingIdx === 2
    ? (ld.overs2 || ld.chaseOvers || ld.overs || '0.0')
    : (ld.overs || ld.firstOvers || '0.0');
  const chaseScore = ld.chaseRuns ?? ld.score2 ?? 0;
  const firstScore = ld.firstRuns ?? ld.runs ?? 0;

  return (
    state.syncedRuns !== firstScore
    || state.syncedScore2 !== chaseScore
    || state.syncedOvers !== oversStr
    || state.syncedWickets !== (ld.wickets ?? 0)
    || (ld.batter1?.name && state.batter1?.name !== ld.batter1.name)
    || (ld.batter2?.name && state.batter2?.name !== ld.batter2.name)
    || (ld.bowler?.name && state.bowler !== ld.bowler.name)
    || (ld.batter1?.runs != null && state.batter1?.runs !== ld.batter1.runs)
    || (ld.batter2?.runs != null && state.batter2?.runs !== ld.batter2.runs)
  );
}

export function syncFieldStateFromMatch(state, match, roster) {
  const ld = match?.liveDetails || {};
  const fresh = createFieldState(match, roster);

  if (!state || state.matchId !== match.id) return fresh;

  const battingIdx = getBattingTeamIndex(match);
  const oversStr = battingIdx === 2
    ? (ld.overs2 || ld.chaseOvers || ld.overs || '0.0')
    : (ld.overs || ld.firstOvers || '0.0');
  const oversChanged = state.syncedOvers !== oversStr;

  return {
    ...fresh,
    overBalls: (() => {
      const apiBalls = (ld.currentOverBalls || []).map(formatBallOutcome);
      return apiBalls.length ? apiBalls : fresh.overBalls;
    })(),
    batter1: ld.batter1 ? { ...fresh.batter1, ...ld.batter1 } : fresh.batter1,
    batter2: ld.batter2 ? { ...fresh.batter2, ...ld.batter2 } : fresh.batter2,
    bowler: ld.bowler?.name || fresh.bowler,
    ballIndex: oversChanged ? fresh.ballIndex : Math.max(state.ballIndex, fresh.ballIndex),
    lastTickAt: Date.now(),
  };
}

export { runsToWagonAngle, WAGON_ANGLES };
