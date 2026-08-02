import { normalizeMatchOvers } from './cricketFormat';
import { formatBallOutcome } from './liveFieldState';
import { isCricketSecondInnings } from './cricketScores';
import { getScorecardInningsForTeam } from './matchSquads';
import { isPlaceholderPlayerName } from './cricketPlayers';
import { getMatchMaxBalls, oversToBallsForMatch } from './cricketFormat';

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

  const firstRuns = ld.firstRuns ?? score1;
  const chaseRuns = ld.chaseRuns ?? score2;
  const chaseWickets = ld.chaseWickets ?? wickets2;

  if (firstRuns == null || chaseRuns == null) return null;

  const target = firstRuns + 1;
  if (chaseRuns >= target) return null;

  const runsNeeded = Math.max(0, target - chaseRuns);
  const maxBalls = getMatchMaxBalls(match);
  const ballsBowled = ld.chaseBallNbr != null
    ? ld.chaseBallNbr
    : oversToBallsForMatch(innings.displayOvers, match);
  const ballsLeft = Math.max(0, maxBalls - ballsBowled);

  const commentaryMatch = ld.commentary?.match(/need (\d+) runs? in (\d+) balls?/i);
  if (commentaryMatch) {
    const commRuns = parseInt(commentaryMatch[1], 10);
    const commBalls = parseInt(commentaryMatch[2], 10);
    if (commRuns === runsNeeded) {
      return `${chasingTeam} (${chaseRuns}/${chaseWickets}) require ${runsNeeded} runs from ${commBalls} balls.`;
    }
  }

  return `${chasingTeam} (${chaseRuns}/${chaseWickets}) require ${runsNeeded} runs from ${ballsLeft} balls.`;
}

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

function liveBattersFromDetails(ld) {
  return [ld?.batter1, ld?.batter2]
    .filter((b) => b?.name && !isPlaceholderPlayerName(b.name))
    .map((b) => ({
      name: b.name,
      runs: b.runs ?? 0,
      balls: b.balls ?? 0,
      sr: b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(2) : '0.00',
      fours: b.fours ?? 0,
      sixes: b.sixes ?? 0,
      notOut: true,
      dismissal: 'batting',
      statusLabel: 'batting',
      isStriker: false,
    }));
}

export function buildScorecardInnings(match, teamName, _roster, _fieldState, isBattingInnings, teamShortName = '') {
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

  if (isBattingInnings) {
    return liveBattersFromDetails(match?.liveDetails);
  }

  return [];
}

function apiOverHistoryRows(match) {
  const rows = match?.overHistory;
  if (!Array.isArray(rows) || !rows.length) return [];

  return rows.map((row, idx) => ({
    overNum: row.overNum,
    balls: (row.balls || []).map((b) => formatBallOutcome(b)),
    isCurrent: row.isCurrent ?? idx === rows.length - 1,
  }));
}

export function buildOverHistoryRows(_fieldState, _matchId, match) {
  const fromApi = apiOverHistoryRows(match);
  if (fromApi.length) return fromApi;

  const ld = match?.liveDetails || {};
  const balls = (ld.currentOverBalls || []).map((b) => formatBallOutcome(b));
  if (!balls.length) return [];

  const isChasing = isCricketSecondInnings(match, ld);
  const rawOvers = isChasing
    ? (ld.overs2 || ld.chaseOvers || ld.overs || '0.0')
    : (ld.overs || ld.firstOvers || '0.0');
  const oversStr = normalizeMatchOvers(rawOvers, match);
  const overNum = Math.max(1, parseInt(String(oversStr).split('.')[0], 10) || 1);

  return [{ overNum, balls, isCurrent: true }];
}

export function buildStatsOvers(_fieldState, match) {
  const rows = apiOverHistoryRows(match);
  if (!rows.length) return [];

  const ld = match?.liveDetails || {};
  const isChasing = isCricketSecondInnings(match, ld);
  const battingScore = isChasing ? (ld.score2 ?? ld.chaseRuns ?? 0) : (ld.runs ?? ld.firstRuns ?? 0);
  const battingWickets = isChasing ? (ld.wickets2 ?? ld.chaseWickets ?? 0) : (ld.wickets ?? ld.firstWickets ?? 0);

  return rows.slice(-4).reverse().map((row) => {
    let overRuns = 0;
    let overWkts = 0;
    row.balls.forEach((b) => {
      if (b === 'W') overWkts += 1;
      else if (b !== '•') overRuns += parseInt(b, 10) || 0;
    });
    const wktLabel = overWkts === 1 ? 'wkt' : 'wkts';
    return {
      overNum: row.overNum,
      summary: `${battingScore}/${battingWickets} (${overRuns} runs, ${overWkts} ${wktLabel})`,
      balls: row.balls,
    };
  });
}

export function formatInningsOversLabel(oversStr, match) {
  return normalizeMatchOvers(oversStr || '0.0', match);
}

export function getWicketOvers(match) {
  const rows = match?.overHistory || [];
  const overs = new Set();
  rows.forEach((row) => {
    if ((row.balls || []).some((b) => String(b).toUpperCase() === 'W')) {
      overs.add(row.overNum);
    }
  });
  return overs;
}
