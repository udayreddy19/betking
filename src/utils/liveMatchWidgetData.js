import { parseOvers, formatBallOutcome } from './liveFieldState';
import { ballsRemaining } from './oversUtils';
import { isCricketSecondInnings } from './cricketScores';
import { getScorecardInningsForTeam } from './matchSquads';
import { isPlaceholderPlayerName } from './cricketPlayers';

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

function formatBatterStatus(player) {
  if (!player.notOut) {
    return player.dismissal || 'out';
  }
  if (/^batting$/i.test(player.dismissal || '')) {
    return 'batting';
  }
  return 'NOT OUT';
}

function hasBatted(player) {
  return (player.balls ?? 0) > 0
    || (player.runs ?? 0) > 0
    || (!player.notOut && player.dismissal && !/^(batting|not out)$/i.test(player.dismissal));
}

function mergeLiveBatterStats(players, liveDetails) {
  const liveBatters = [liveDetails?.batter1, liveDetails?.batter2].filter(Boolean);
  if (!liveBatters.length) return players;

  return players.map((player) => {
    const live = liveBatters.find(
      (b) => b?.name && player.name && b.name.toLowerCase() === player.name.toLowerCase(),
    );
    if (!live) return player;
    const balls = live.balls ?? player.balls;
    const runs = live.runs ?? player.runs;
    return {
      ...player,
      runs,
      balls,
      fours: live.fours ?? player.fours,
      sixes: live.sixes ?? player.sixes,
      sr: balls > 0 ? ((runs / balls) * 100).toFixed(2) : player.sr,
      notOut: true,
      dismissal: 'batting',
      isStriker: !!live.isStriker,
    };
  });
}

export function buildScorecardInnings(match, teamName, roster, fieldState, isBattingInnings, teamShortName = '') {
  const apiInnings = getScorecardInningsForTeam(match, teamName, teamShortName);
  if (apiInnings?.batters?.length) {
    const ld = match?.liveDetails || {};
    let players = apiInnings.batters
      .filter(hasBatted)
      .map((b) => ({
        name: b.name,
        runs: b.runs,
        balls: b.balls,
        sr: b.sr,
        dismissal: b.dismissal,
        notOut: b.notOut,
        isStriker: false,
        statusLabel: formatBatterStatus(b),
      }));

    if (isBattingInnings) {
      players = mergeLiveBatterStats(players, ld);
      players = players.map((p) => ({
        ...p,
        statusLabel: formatBatterStatus(p),
      }));
    }

    return players;
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
      statusLabel: dismissal,
    });
  }

  if (isBattingInnings && fieldState) {
    const striker = fieldState.strikerIdx === 0 ? fieldState.batter1 : fieldState.batter2;
    const nonStriker = fieldState.strikerIdx === 0 ? fieldState.batter2 : fieldState.batter1;

    const addBatter = (batter, isStriker) => {
      if (!batter?.name || isPlaceholderPlayerName(batter.name)) return;
      if (players.some((p) => p.name.toLowerCase() === batter.name.toLowerCase())) return;
      players.push({
        ...batter,
        sr: batter.balls > 0 ? ((batter.runs / batter.balls) * 100).toFixed(2) : '0.00',
        notOut: true,
        dismissal: 'batting',
        statusLabel: 'batting',
        isStriker,
      });
    };

    addBatter(striker, fieldState.strikerIdx === (outCount % 2 === 0 ? 0 : 1));
    addBatter(nonStriker, fieldState.strikerIdx !== (outCount % 2 === 0 ? 0 : 1));
  } else if (isBattingInnings) {
    players.push(
      { name: batters[outCount % batters.length], runs: 15, balls: 11, sr: '136.36', notOut: true, statusLabel: 'batting', isStriker: true },
      { name: batters[(outCount + 1) % batters.length], runs: 8, balls: 9, sr: '88.89', notOut: true, statusLabel: 'batting', isStriker: false },
    );
  }

  return players.map((p) => ({
    ...p,
    statusLabel: p.statusLabel || formatBatterStatus(p),
  }));
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

export function buildStatsOvers(fieldState, match) {
  const ld = match?.liveDetails || {};
  const isChasing = isCricketSecondInnings(match, ld);
  const oversStr = isChasing
    ? (ld.overs2 || ld.chaseOvers || ld.overs || '0.0')
    : (ld.overs || ld.firstOvers || '0.0');
  const battingScore = isChasing ? (ld.score2 ?? 0) : (ld.runs ?? 0);
  const battingWickets = isChasing ? (ld.wickets2 ?? 0) : (ld.wickets ?? 0);
  const matchId = match?.id || 'default';

  const { over: currentOver, ball: ballsInCurrentOver } = parseOvers(oversStr);
  const safeCurrentOver = Math.max(1, currentOver || 1);
  const startOver = Math.max(1, safeCurrentOver - 3);
  const overNums = [];
  for (let o = startOver; o <= safeCurrentOver; o += 1) {
    overNums.push(o);
  }

  const wicketByOver = assignWicketsToOvers(matchId, battingWickets, overNums);
  const rows = [];
  let cumRuns = battingScore;
  let cumWkts = battingWickets;

  for (let o = safeCurrentOver; o >= startOver; o -= 1) {
    let balls;
    if (o === safeCurrentOver) {
      const apiBalls = (ld.currentOverBalls || []).map((b) => formatBallOutcome(b));
      if (apiBalls.length) {
        balls = apiBalls;
      } else if (fieldState?.overNum === o && fieldState?.overBalls?.length) {
        balls = fieldState.overBalls;
      } else if (ballsInCurrentOver > 0) {
        balls = synthesizeOverBalls(matchId, o, wicketByOver.get(o) || 0).slice(0, ballsInCurrentOver);
      } else {
        balls = [];
      }
    } else {
      balls = synthesizeOverBalls(matchId, o, wicketByOver.get(o) || 0);
    }

    let overRuns = 0;
    let overWkts = 0;
    balls.forEach((b) => {
      if (b === 'W') overWkts += 1;
      else if (b !== '•') overRuns += parseInt(b, 10) || 0;
    });

    const wktLabel = overWkts === 1 ? 'wkt' : 'wkts';
    rows.push({
      overNum: o,
      summary: `${cumRuns}/${cumWkts} (${overRuns} runs, ${overWkts} ${wktLabel})`,
      balls,
    });

    cumRuns = Math.max(0, cumRuns - overRuns);
    cumWkts = Math.max(0, cumWkts - overWkts);
  }

  return rows;
}

export function formatInningsOversLabel(oversStr) {
  const { over, ball } = parseOvers(oversStr || '0.0');
  if (over === 0 && ball === 0) return '0';
  return ball > 0 ? `${over}.${ball}` : String(over);
}

export function getWicketOvers(match, wickets, currentOver = 20) {
  const matchId = match?.id || 'm1';
  const maxOver = Math.max(1, Math.min(currentOver, 20));
  if (wickets <= 0 || maxOver <= 0) return new Set();

  const overNums = Array.from({ length: maxOver }, (_, i) => i + 1);
  const assignment = assignWicketsToOvers(matchId, wickets, overNums);
  return new Set([...assignment.entries()].filter(([, count]) => count > 0).map(([over]) => over));
}
