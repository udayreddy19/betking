import {
  getMatchFormatHint,
  getMatchMaxBalls,
  normalizeMatchOvers,
} from './cricketFormat';
import { formatBallOutcome } from './liveFieldState';
import { isCricketSecondInnings, resolveCricketTeamScores, teamNameMatches } from './cricketScores';
import { getScorecardInningsForTeam } from './matchSquads';
import { isPlaceholderPlayerName } from './cricketPlayers';
import { enrichLivePlayersFromScorecard } from './scorecardLivePlayers';

import { formatTeamShortName } from './teamShortName';

export function getTeamShortCode(name, existingShort = '') {
  return formatTeamShortName(name, existingShort);
}

export function getTeamDisplayName(name) {
  return name.replace(/\s+W$/, '').trim();
}

export function getChaseText(match, innings, team1, _team2) {
  const ld = match?.liveDetails || {};

  if (ld.commentary && /require|need|chasing|target/i.test(ld.commentary)) {
    return ld.commentary;
  }

  if (!isCricketSecondInnings(match, ld)) return null;

  const resolved = resolveCricketTeamScores(match, ld);
  const chasingTeam = getTeamDisplayName(innings?.battingTeam || match?.team2?.name || 'Chasing team');
  const isTeam1Chasing = teamNameMatches(team1, innings?.battingTeam);

  const chaseScore = isTeam1Chasing ? resolved.team1 : resolved.team2;
  const firstScore = isTeam1Chasing ? resolved.team2 : resolved.team1;

  const chaseRuns = chaseScore.runs ?? 0;
  const chaseWickets = chaseScore.wickets ?? 0;
  const firstRuns = firstScore.runs ?? 0;

  if (firstRuns <= 0) return null;

  const target = firstRuns + 1;
  if (chaseRuns >= target) return null;

  const runsNeeded = Math.max(0, target - chaseRuns);
  const scoreLine = `${chasingTeam} (${chaseRuns}/${chaseWickets})`;

  const isUnlimited = /test|first[- ]?class/i.test(getMatchFormatHint(match));
  if (isUnlimited) {
    return `${scoreLine} require ${runsNeeded} runs to win.`;
  }

  const maxBalls = getMatchMaxBalls(match) || 300;
  const ballsBowled = Math.min(maxBalls, Math.max(0, chaseScore.balls ?? 0));
  const ballsLeft = Math.max(0, maxBalls - ballsBowled);
  const oversLeft = (ballsLeft / 6).toFixed(1);

  return `${scoreLine} require ${runsNeeded} runs from ${ballsLeft} balls (${oversLeft} ov).`;
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
    || /^batting$/i.test(player.dismissal || '')
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
export function buildScorecardInnings(match, teamName, roster, _fieldState, isBattingInnings, teamShortName = '') {
  const apiInnings = getScorecardInningsForTeam(match, teamName, teamShortName);

  if (apiInnings?.batters?.length) {
    const ld = enrichLivePlayersFromScorecard(
      match?.liveDetails || {},
      match?.scorecardInnings || [],
    );
    let players = apiInnings.batters
      .filter(hasBatted)
      .filter((b) => b.name && !isPlaceholderPlayerName(b.name))
      .map((b) => ({
        name: b.name,
        runs: b.runs,
        balls: b.balls,
        fours: b.fours ?? 0,
        sixes: b.sixes ?? 0,
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

  const ld = enrichLivePlayersFromScorecard(
    match?.liveDetails || {},
    match?.scorecardInnings || [],
  );
  return isBattingInnings ? liveBattersFromDetails(ld) : [];
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

function generateOverHistoryFromScore(match) {
  const ld = match?.liveDetails || {};
  const isChasing = isCricketSecondInnings(match, ld);
  const rawOvers = isChasing
    ? (ld.overs2 || ld.chaseOvers || ld.overs)
    : (ld.overs || ld.firstOvers);
  if (!rawOvers || rawOvers === '0.0' || rawOvers === '0') return [];

  const oversStr = normalizeMatchOvers(rawOvers, match);
  const currentOverNum = parseInt(String(oversStr).split('.')[0], 10) || 0;
  if (currentOverNum < 1) return [];

  const balls = (ld.currentOverBalls || []).map((b) => formatBallOutcome(b));
  if (!balls.length) return [];

  return [{ overNum: currentOverNum, balls, isCurrent: true }];
}

export function buildOverHistoryRows(fieldState, _matchId, match) {
  if (fieldState?.overRows?.length) return fieldState.overRows;

  const fromApi = apiOverHistoryRows(match);
  if (fromApi.length) return fromApi;

  const ld = match?.liveDetails || {};
  const balls = (ld.currentOverBalls || []).map((b) => formatBallOutcome(b));
  if (balls.length) {
    const isChasing = isCricketSecondInnings(match, ld);
    const rawOvers = isChasing
      ? (ld.overs2 || ld.chaseOvers || ld.overs || '0.0')
      : (ld.overs || ld.firstOvers || '0.0');
    const oversStr = normalizeMatchOvers(rawOvers, match);
    const overNum = Math.max(1, parseInt(String(oversStr).split('.')[0], 10) || 1);
    return [{ overNum, balls, isCurrent: true }];
  }

  return generateOverHistoryFromScore(match);
}

export function buildStatsOvers(_fieldState, match) {
  const rows = apiOverHistoryRows(match);
  const ld = match?.liveDetails || {};
  const isChasing = isCricketSecondInnings(match, ld);
  const battingScore = isChasing ? (ld.score2 ?? ld.chaseRuns ?? 0) : (ld.runs ?? ld.firstRuns ?? 0);
  const battingWickets = isChasing ? (ld.wickets2 ?? ld.chaseWickets ?? 0) : (ld.wickets ?? ld.firstWickets ?? 0);

  if (rows.length) {
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

  const currentBalls = (ld.currentOverBalls || []).map((b) => formatBallOutcome(b));
  if (!currentBalls.length) return [];
  const rawOvers = isChasing ? (ld.overs2 || ld.chaseOvers || ld.overs) : (ld.overs || ld.firstOvers);
  if (!rawOvers || rawOvers === '0.0' || rawOvers === '0') return [];
  const overNum = Math.max(1, parseInt(String(rawOvers).split('.')[0], 10) || 1);

  return [
    {
      overNum,
      summary: `${battingScore}/${battingWickets} (Over ${overNum})`,
      balls: currentBalls,
    },
  ];
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
