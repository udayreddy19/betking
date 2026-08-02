import { parseOvers, formatBallOutcome } from './liveFieldState';
import { ballsRemaining } from './oversUtils';
import { isCricketSecondInnings } from './cricketScores';

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function getTeamShortCode(name) {
  const clean = name.replace(/\s+W$/, '').trim();
  const words = clean.split(/\s+/);
  if (words.length >= 2) {
    return words.map((w) => w[0]).join('').toUpperCase().slice(0, 3);
  }
  return clean.slice(0, 3).toUpperCase();
}

export function getTeamDisplayName(name) {
  return name.replace(/\s+W$/, '').trim();
}

export function getChaseText(match, innings, team1, score1, score2, wickets2) {
  if (!isCricketSecondInnings(match, match?.liveDetails) || innings.inningsNum !== 2) return null;

  const ld = match?.liveDetails || {};
  const chasingTeam = getTeamDisplayName(innings.battingTeam);

  const commentaryMatch = ld.commentary?.match(/need (\d+) runs? in (\d+) balls?/i);
  if (commentaryMatch) {
    return `${chasingTeam} (${score2}/${wickets2}) require ${commentaryMatch[1]} runs from ${commentaryMatch[2]} balls.`;
  }

  const target = score1 + 1;
  const runsNeeded = Math.max(0, target - score2);
  const ballsLeft = ld.chaseBallNbr != null
    ? Math.max(0, 20 * 6 - ld.chaseBallNbr)
    : ballsRemaining(innings.displayOvers);

  return `${chasingTeam} (${score2}/${wickets2}) require ${runsNeeded} runs from ${ballsLeft} balls.`;
}

const DISMISSAL_TEMPLATES = [
  'LBW b {bowler}',
  'c {fielder} b {bowler}',
  'b {bowler}',
  'st {keeper} b {bowler}',
  'run out ({fielder})',
];

export function buildScorecardInnings(match, teamName, roster, fieldState, isBattingInnings, teamShortName = '') {
  const apiInnings = match?.scorecardInnings;
  if (Array.isArray(apiInnings) && apiInnings.length) {
    const teamInnings = apiInnings.filter(
      (inn) => inn.batTeamName === teamName
        || (teamShortName && inn.batTeamShortName === teamShortName),
    );
    const latest = teamInnings[teamInnings.length - 1];
    if (latest?.batters?.length) {
      return latest.batters.map((b) => ({
        name: b.name,
        runs: b.runs,
        balls: b.balls,
        sr: b.sr,
        dismissal: b.notOut ? 'NOT OUT' : (b.dismissal || 'out'),
        notOut: b.notOut,
        isStriker: false,
      }));
    }
  }

  const matchId = match?.id || 'default';
  const seed = hashSeed(`${matchId}-${teamName}`);
  const bowlers = roster.bowlers || ['Bowler'];
  const batters = roster.batters || ['Batter 1', 'Batter 2'];

  const outCount = isBattingInnings
    ? Math.min(2, Math.floor((match?.liveDetails?.wickets2 ?? match?.liveDetails?.wickets ?? 0)))
    : Math.min(5, Math.floor((match?.liveDetails?.wickets ?? 0)));

  const players = [];

  for (let i = 0; i < outCount; i += 1) {
    const name = batters[i % batters.length];
    const runs = 5 + (seed + i * 7) % 28;
    const balls = 8 + (seed + i * 3) % 18;
    const bowler = bowlers[(seed + i) % bowlers.length];
    const dismissal = DISMISSAL_TEMPLATES[(seed + i) % DISMISSAL_TEMPLATES.length]
      .replace('{bowler}', bowler)
      .replace('{fielder}', batters[(i + 1) % batters.length])
      .replace('{keeper}', 'WK');

    players.push({
      name,
      runs,
      balls,
      sr: balls > 0 ? ((runs / balls) * 100).toFixed(2) : '0.00',
      dismissal,
      notOut: false,
    });
  }

  if (isBattingInnings && fieldState) {
    const striker = fieldState.strikerIdx === 0 ? fieldState.batter1 : fieldState.batter2;
    const nonStriker = fieldState.strikerIdx === 0 ? fieldState.batter2 : fieldState.batter1;

    players.push({
      ...striker,
      sr: striker.balls > 0 ? ((striker.runs / striker.balls) * 100).toFixed(2) : '0.00',
      notOut: true,
      isStriker: fieldState.strikerIdx === (outCount % 2 === 0 ? 0 : 1),
    });
    players.push({
      ...nonStriker,
      sr: nonStriker.balls > 0 ? ((nonStriker.runs / nonStriker.balls) * 100).toFixed(2) : '0.00',
      notOut: true,
      isStriker: fieldState.strikerIdx !== (outCount % 2 === 0 ? 0 : 1),
    });
  } else if (isBattingInnings) {
    players.push(
      { name: batters[outCount % batters.length], runs: 15, balls: 11, sr: '136.36', notOut: true, isStriker: true },
      { name: batters[(outCount + 1) % batters.length], runs: 8, balls: 9, sr: '88.89', notOut: true, isStriker: false },
    );
  }

  return players;
}

function assignWicketsToOvers(matchId, totalWickets, overNums) {
  const counts = new Map(overNums.map((o) => [o, 0]));
  if (totalWickets <= 0 || overNums.length === 0) return counts;

  let placed = 0;
  let attempt = 0;
  while (placed < totalWickets && attempt < 100) {
    const over = overNums[hashSeed(`${matchId}-wkt-assign-${attempt}`) % overNums.length];
    counts.set(over, (counts.get(over) || 0) + 1);
    placed += 1;
    attempt += 1;
  }
  return counts;
}

function synthesizeOverBalls(matchId, overNum, wicketCount) {
  const balls = [];
  const wicketSlots = new Set();
  for (let w = 0; w < wicketCount; w += 1) {
    wicketSlots.add(hashSeed(`${matchId}-${overNum}-wp-${w}`) % 6);
  }

  const runOptions = ['•', '1', '1', '2', '4', '0', '1', '3'];
  for (let i = 0; i < 6; i += 1) {
    if (wicketSlots.has(i)) {
      balls.push('W');
    } else {
      balls.push(runOptions[hashSeed(`${matchId}-${overNum}-b-${i}`) % runOptions.length]);
    }
  }
  return balls;
}

export function buildOverHistoryRows(fieldState, matchId, match) {
  const ld = match?.liveDetails || {};
  const isChasing = isCricketSecondInnings(match, ld);
  const oversStr = isChasing
    ? (ld.overs2 || ld.chaseOvers || ld.overs || '0.0')
    : (ld.overs || ld.firstOvers || '0.0');

  const { over: currentOver, ball: ballsInCurrentOver } = parseOvers(oversStr);
  const safeCurrentOver = Math.max(1, currentOver || 1);
  const totalWickets = isChasing ? (ld.wickets2 ?? 0) : (ld.wickets ?? 0);

  const rows = [];
  const historyStart = Math.max(1, safeCurrentOver - 10);
  const completedOvers = [];
  for (let o = historyStart; o < safeCurrentOver; o += 1) {
    completedOvers.push(o);
  }

  const wicketByOver = assignWicketsToOvers(
    matchId,
    totalWickets,
    [...completedOvers, safeCurrentOver],
  );

  for (const o of completedOvers) {
    rows.push({
      overNum: o,
      balls: synthesizeOverBalls(matchId, o, wicketByOver.get(o) || 0),
    });
  }

  const apiCurrentBalls = (ld.currentOverBalls || []).map((b) => formatBallOutcome(b));
  let currentBalls = apiCurrentBalls.length
    ? apiCurrentBalls
    : (fieldState?.overNum === safeCurrentOver && fieldState?.overBalls?.length
      ? fieldState.overBalls
      : []);

  if (!currentBalls.length && ballsInCurrentOver > 0) {
    const wktsInCurrent = wicketByOver.get(safeCurrentOver) || 0;
    const synth = synthesizeOverBalls(matchId, safeCurrentOver, wktsInCurrent);
    currentBalls = synth.slice(0, ballsInCurrentOver);
  } else if (!currentBalls.length) {
    currentBalls = [];
  }

  rows.push({ overNum: safeCurrentOver, balls: currentBalls, isCurrent: true });

  return rows;
}

export function buildStatsOvers(fieldState, match, battingScore, battingWickets) {
  const matchId = match?.id || 'default';
  const currentOver = fieldState?.overNum ?? parseOvers(match?.liveDetails?.overs2 || match?.liveDetails?.overs || '0.0').over;
  const rows = [];

  for (let o = currentOver; o >= Math.max(1, currentOver - 3); o -= 1) {
    const balls = [];
    let overRuns = 0;
    let overWkts = 0;

    for (let i = 0; i < 6; i += 1) {
      const idx = (o - 1) * 6 + i;
      const seed = hashSeed(`${matchId}-stat-${idx}`);
      const options = ['•', '1', '1', '4', '2', 'W'];
      const ball = o === currentOver && fieldState?.overBalls?.[i]
        ? fieldState.overBalls[i]
        : options[seed % options.length];

      balls.push(ball);
      if (ball === 'W') overWkts += 1;
      else if (ball !== '•') overRuns += parseInt(ball, 10) || 0;
    }

    const cumRuns = Math.max(0, battingScore - (currentOver - o) * 8);
    rows.push({
      overNum: o,
      summary: `${cumRuns}/${battingWickets} (${overRuns} runs, ${overWkts} wkt)`,
      balls,
    });
  }

  return rows;
}

export function getWicketOvers(match, wickets, currentOver = 20) {
  const matchId = match?.id || 'm1';
  const maxOver = Math.max(1, Math.min(currentOver, 20));
  if (wickets <= 0 || maxOver <= 0) return new Set();

  const overNums = Array.from({ length: maxOver }, (_, i) => i + 1);
  const assignment = assignWicketsToOvers(matchId, wickets, overNums);
  return new Set([...assignment.entries()].filter(([, count]) => count > 0).map(([over]) => over));
}
