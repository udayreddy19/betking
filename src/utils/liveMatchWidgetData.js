import {
  getMatchFormatHint,
  getMatchMaxBalls,
  normalizeMatchOvers,
} from './cricketFormat';
import { formatBallOutcome, parseOvers } from './liveFieldState';
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

  if (!isCricketSecondInnings(match, ld) && !/need\s+0/i.test(String(ld.commentary || ''))) {
    if (ld.commentary && /require|need|chasing|target/i.test(ld.commentary)) {
      return ld.commentary;
    }
    return null;
  }

  const resolved = resolveCricketTeamScores(match, ld);
  const chasingTeam = getTeamDisplayName(innings?.battingTeam || match?.team2?.name || 'Chasing team');
  const isTeam1Chasing = teamNameMatches(team1, innings?.battingTeam);

  const chaseScore = isTeam1Chasing ? resolved.team1 : resolved.team2;
  const firstScore = isTeam1Chasing ? resolved.team2 : resolved.team1;

  const chaseRuns = chaseScore.runs ?? 0;
  const chaseWickets = chaseScore.wickets ?? 0;
  const firstRuns = firstScore.runs ?? 0;

  if (firstRuns <= 0) return null;

  if (/need\s+0\s+(?:more\s+)?runs/i.test(String(ld.commentary || ''))) {
    return `${chasingTeam} won`;
  }

  if (ld.commentary && /require|need|chasing|target/i.test(ld.commentary) && !/need\s+0/i.test(ld.commentary)) {
    return ld.commentary;
  }

  const target = firstRuns + 1;
  if (chaseRuns >= target) {
    return `${chasingTeam} won`;
  }

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

function battersFromFieldState(fieldState) {
  if (!fieldState) return [];
  return [fieldState.batter1, fieldState.batter2]
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

export function buildScorecardInnings(match, teamName, roster, fieldState, isBattingInnings, teamShortName = '') {
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
        sr: b.sr ?? (b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(2) : '0.00'),
        dismissal: b.dismissal,
        notOut: b.notOut,
        isStriker: false,
        statusLabel: formatBatterStatus(b),
      }));

    if (isBattingInnings) {
      players = mergeLiveBatterStats(players, ld);
      const fieldPlayers = battersFromFieldState(fieldState);
      for (const fp of fieldPlayers) {
        if (!players.some((p) => p.name.toLowerCase() === fp.name.toLowerCase())) {
          players.push(fp);
        }
      }
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
  if (!isBattingInnings) return [];

  const fromLive = liveBattersFromDetails(ld);
  if (fromLive.length) return fromLive;

  return battersFromFieldState(fieldState);
}

function battingOversStr(match) {
  const ld = match?.liveDetails || {};
  const isChasing = isCricketSecondInnings(match, ld);
  return isChasing
    ? (ld.overs2 || ld.chaseOvers || ld.overs || '0.0')
    : (ld.overs || ld.firstOvers || '0.0');
}

function currentOverNumberFromOvers(oversStr, match) {
  const { over, ball } = parseOvers(normalizeMatchOvers(oversStr || '0.0', match));
  if (ball > 0) return over + 1;
  return Math.max(1, over || 1);
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

function rowsFromFieldState(fieldState) {
  if (!fieldState) return [];
  const recent = (fieldState.recentOvers || []).map((row) => ({
    overNum: row.overNum,
    balls: (row.balls || []).map((b) => formatBallOutcome(b)),
    isCurrent: false,
  }));
  const currentBalls = (fieldState.overBalls || fieldState.currentOverBalls || [])
    .map((b) => formatBallOutcome(b));
  if (!recent.length && !currentBalls.length) return [];
  return [
    ...recent,
    {
      overNum: fieldState.overNum || (recent[recent.length - 1]?.overNum || 0) + 1,
      balls: currentBalls,
      isCurrent: true,
    },
  ];
}

function generateOverHistoryFromScore(match) {
  const ld = match?.liveDetails || {};
  const rawOvers = battingOversStr(match);
  if (!rawOvers || rawOvers === '0.0' || rawOvers === '0') return [];

  const balls = (ld.currentOverBalls || []).map((b) => formatBallOutcome(b));
  if (!balls.length) return [];

  return [{
    overNum: currentOverNumberFromOvers(rawOvers, match),
    balls,
    isCurrent: true,
  }];
}

function fallbackCurrentOverRow(match) {
  const oversStr = battingOversStr(match);
  const { ball } = parseOvers(normalizeMatchOvers(oversStr, match));
  const count = Math.max(1, ball || 1);
  return [{
    overNum: currentOverNumberFromOvers(oversStr, match),
    balls: Array.from({ length: count }, () => '…'),
    isCurrent: true,
  }];
}

export function buildOverHistoryRows(fieldState, _matchId, match) {
  if (fieldState?.overRows?.length) return fieldState.overRows;

  const fromApi = apiOverHistoryRows(match);
  if (fromApi.length) return fromApi;

  const fromField = rowsFromFieldState(fieldState);
  if (fromField.some((row) => row.balls?.length)) return fromField;

  const generated = generateOverHistoryFromScore(match);
  if (generated.length) return generated;

  return fallbackCurrentOverRow(match);
}

export function buildStatsOvers(_fieldState, match) {
  const rows = apiOverHistoryRows(match);
  const ld = match?.liveDetails || {};
  const isChasing = isCricketSecondInnings(match, ld);
  const resolved = resolveCricketTeamScores(match, ld);
  let battingSide = resolved.team1;
  if (isChasing) {
    if (ld.chaseTeamName && teamNameMatches(resolved.team1.name || resolved.team1.token, ld.chaseTeamName)) {
      battingSide = resolved.team1;
    } else if (ld.chaseTeamName && teamNameMatches(resolved.team2.name || resolved.team2.token, ld.chaseTeamName)) {
      battingSide = resolved.team2;
    } else if (ld.firstTeamName && teamNameMatches(resolved.team1.name || resolved.team1.token, ld.firstTeamName)) {
      battingSide = resolved.team2;
    } else {
      battingSide = resolved.team2.runs > 0 || resolved.team2.balls > 0 ? resolved.team2 : resolved.team1;
    }
  } else if ((resolved.team2.runs > 0 || resolved.team2.balls > 0) && resolved.team1.runs === 0) {
    battingSide = resolved.team2;
  }
  const battingScore = Number(ld.chaseRuns ?? ld.runs ?? battingSide.runs) || battingSide.runs || 0;
  const battingWickets = Number(ld.chaseWickets ?? ld.wickets ?? battingSide.wickets) || battingSide.wickets || 0;

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
