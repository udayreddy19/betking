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
        if (players.some((p) => p.name.toLowerCase() === fp.name.toLowerCase())) continue;
        // Do not leak the other innings' crease onto this team's card.
        if (apiInnings?.batters?.length) continue;
        players.push(fp);
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
  const ld = match?.liveDetails || {};
  const currentInn = Number(ld.inningsId || (isCricketSecondInnings(match, ld) ? 2 : 1));
  const scoped = rows.filter((row) => {
    const inn = Number(row.inningsId || row.innings || 0);
    if (!inn) return true;
    return inn === currentInn;
  });

  const mapped = scoped.map((row, idx) => ({
    overNum: row.overNum,
    inningsId: row.inningsId || row.innings,
    balls: (row.balls || []).map((b) => formatBallOutcome(b)),
    isCurrent: row.isCurrent ?? idx === scoped.length - 1,
  }));
  const withBalls = mapped.filter((row) => (row.balls || []).some((b) => b && b !== '…'));
  return withBalls.length ? withBalls : mapped;
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
  const { over, ball } = parseOvers(normalizeMatchOvers(oversStr, match));
  if (ball === 0) return [];
  const count = Math.max(1, ball);
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

function sumOverRunsFromBalls(balls = []) {
  let runs = 0;
  let wickets = 0;
  for (const raw of balls) {
    const label = String(raw || '').trim();
    if (!label || label === '…') continue;
    if (/^w$/i.test(label)) {
      wickets += 1;
      continue;
    }
    if (label === '•' || label === '.' || label === '0') continue;
    const wd = label.match(/^(\d*)wd$/i);
    if (wd) {
      runs += Number(wd[1] || 1) || 1;
      continue;
    }
    const nb = label.match(/^(\d*)nb$/i);
    if (nb) {
      runs += Number(nb[1] || 1) || 1;
      continue;
    }
    const lb = label.match(/^(\d+)l(?:b)?$/i) || label.match(/^l(\d+)$/i);
    if (lb) {
      runs += Number(lb[1]) || 0;
      continue;
    }
    const n = parseInt(label, 10);
    if (Number.isFinite(n)) runs += n;
  }
  return { overRuns: runs, overWickets: wickets };
}

function normalizeOversBoardBall(raw) {
  const label = formatBallOutcome(raw);
  if (label === '•' || label === '0') return '.';
  return label;
}

function allOverHistoryRows(match) {
  const fromMatch = Array.isArray(match?.overHistory) ? match.overHistory : [];
  const fromLd = Array.isArray(match?.liveDetails?.overHistory) ? match.liveDetails.overHistory : [];
  const rows = fromMatch.length ? fromMatch : fromLd;
  return rows.map((row, idx) => ({
    overNum: Number(row.overNum || row.over || idx + 1) || (idx + 1),
    inningsId: Number(row.inningsId || row.innings || 0) || null,
    balls: (row.balls || []).map((b) => normalizeOversBoardBall(b)),
    isCurrent: !!row.isCurrent,
    scoreAtEnd: row.scoreAtEnd
      || (row.runs != null && row.wickets != null ? `${row.runs}-${row.wickets}` : null),
    runs: row.runs != null ? Number(row.runs) : null,
    wickets: row.wickets != null ? Number(row.wickets) : null,
    bowler: row.bowler || row.bowlerName || null,
    batters: Array.isArray(row.batters) ? row.batters : [],
    commentary: row.commentary || row.summary || null,
  })).filter((row) => (row.balls || []).some((b) => b && b !== '…'));
}

/**
 * Full Overs board rows for the Over | Balls | Runs UI (newest over first).
 * @param {object} match
 * @param {{ inningsId?: number|null }} [opts]
 */
export function buildOversBoardRows(match, opts = {}) {
  const wantInn = opts.inningsId != null ? Number(opts.inningsId) : null;
  const raw = allOverHistoryRows(match);
  if (!raw.length) {
    // Fallback to current-over-only when full history is not yet available.
    const fromApi = apiOverHistoryRows(match).map((row) => ({
      ...row,
      balls: (row.balls || []).map((b) => normalizeOversBoardBall(b)),
      scoreAtEnd: null,
      bowler: null,
      batters: [],
      commentary: null,
    }));
    if (!fromApi.length) return [];
    return finalizeOversBoardRows(fromApi, wantInn);
  }
  return finalizeOversBoardRows(raw, wantInn);
}

function finalizeOversBoardRows(rows, wantInn) {
  const scoped = wantInn
    ? rows.filter((r) => !r.inningsId || Number(r.inningsId) === wantInn)
    : rows;

  // Walk chronologically to fill missing end-of-over scores from cumulative ball sums when possible.
  const byInn = new Map();
  for (const row of scoped) {
    const innKey = Number(row.inningsId) || 0;
    if (!byInn.has(innKey)) byInn.set(innKey, []);
    byInn.get(innKey).push(row);
  }

  const enriched = [];
  for (const [, innRows] of byInn) {
    const ordered = [...innRows].sort((a, b) => Number(a.overNum) - Number(b.overNum));
    let cumRuns = 0;
    let cumWkts = 0;
    for (const row of ordered) {
      const { overRuns, overWickets } = sumOverRunsFromBalls(row.balls);
      if (row.runs != null && Number.isFinite(Number(row.runs))) {
        cumRuns = Number(row.runs);
        cumWkts = Number(row.wickets) || cumWkts;
      } else {
        cumRuns += overRuns;
        cumWkts += overWickets;
      }
      const scoreAtEnd = row.scoreAtEnd
        || (row.runs != null ? `${row.runs}-${row.wickets ?? cumWkts}` : `${cumRuns}-${cumWkts}`);
      const bowler = typeof row.bowler === 'string' ? row.bowler : (row.bowler?.name || null);
      const batters = (row.batters || [])
        .map((b) => (typeof b === 'string' ? b : b?.name))
        .filter(Boolean);
      const commentary = row.commentary
        || (bowler ? `${bowler}${batters.length ? ` to ${batters.join(' & ')}` : ''}` : null);
      enriched.push({
        overNum: row.overNum,
        inningsId: row.inningsId || null,
        balls: row.balls || [],
        isCurrent: !!row.isCurrent,
        overRuns,
        overWickets,
        scoreAtEnd,
        bowler,
        batters,
        commentary,
      });
    }
  }

  // Newest first (screenshot order).
  return enriched.sort((a, b) => {
    const innA = Number(a.inningsId) || 0;
    const innB = Number(b.inningsId) || 0;
    if (innA !== innB) return innB - innA;
    return Number(b.overNum) - Number(a.overNum);
  });
}

/** Distinct innings ids present in over history (for overs-board tabs). */
export function listOversBoardInnings(match) {
  const rows = allOverHistoryRows(match);
  const ids = [...new Set(rows.map((r) => Number(r.inningsId) || 0).filter((n) => n > 0))];
  if (ids.length) return ids.sort((a, b) => a - b);
  const ld = match?.liveDetails || {};
  if (isCricketSecondInnings(match, ld) || Number(ld.inningsId) === 2) return [1, 2];
  return [1];
}
