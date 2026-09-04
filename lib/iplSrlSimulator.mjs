/**
 * OddsYra SRL — in-house simulated T20 league (no feed provider).
 * Matches auto-play from the clock: upcoming until startTime, live until end, then settled.
 * Admin can still pause, speed-shift, or declare a winner.
 * External feed SRLs keep their original provider names.
 */

import { teamKitColors } from './jerseyColors.mjs';
import { SRL_LAUNCH_AT } from './oddsyraSrlSeason.mjs';
import {
  getSrlOperatorElapsedMs,
  getSrlOperatorSession,
  getSrlSimNow,
} from './iplSrlOperatorState.mjs';
import { parseOversParts } from './matchOverSnapshotStore.mjs';

export const IPL_SRL_LEAGUE = 'OddsYra SRL';
export const IPL_SRL_BREADCRUMB = 'OddsYra SRL — simulated matches';

const EPOCH_MS = SRL_LAUNCH_AT;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** IPL T20: 20 overs per innings, ~3.5–4 hours total, innings split evenly. */
const IPL_MATCH_MIN_MS = 3.5 * HOUR_MS;
const IPL_MATCH_MAX_MS = 4 * HOUR_MS;
const IPL_INNINGS_BREAK_MS = 20 * MINUTE_MS;
const MATCH_GAP_MS = 1 * HOUR_MS;
const PLAYOFF_BREAK_MS = 12 * HOUR_MS;
const PLAYOFF_GAP_MS = 8 * HOUR_MS;
const MAX_OVERS = 20;
const MAX_BALLS = MAX_OVERS * 6;
const VISIBLE_MATCHES = 8;
const LEAGUE_MATCH_COUNT = 70;
const PLAYOFF_MATCH_COUNT = 4;
export const SRL_SEASON_MATCH_COUNT = LEAGUE_MATCH_COUNT + PLAYOFF_MATCH_COUNT;

function matchDurationFromSeed(seed) {
  const rng = mulberry32(seed);
  return Math.round(IPL_MATCH_MIN_MS + (rng() * (IPL_MATCH_MAX_MS - IPL_MATCH_MIN_MS)));
}

function buildMatchTiming(seed) {
  const totalDurationMs = matchDurationFromSeed(seed);
  const inningsPlayMs = (totalDurationMs - IPL_INNINGS_BREAK_MS) / 2;
  const msPerBall = inningsPlayMs / MAX_BALLS;
  return {
    totalDurationMs,
    inningsPlayMs,
    inningsBreakMs: IPL_INNINGS_BREAK_MS,
    msPerBall,
    firstInningsEndMs: inningsPlayMs,
    breakEndMs: inningsPlayMs + IPL_INNINGS_BREAK_MS,
    oversPerInnings: MAX_OVERS,
  };
}

function formatDuration(ms) {
  const hours = Math.floor(ms / HOUR_MS);
  const minutes = Math.round((ms % HOUR_MS) / MINUTE_MS);
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function ballIndexAtTime(elapsedInInningsMs, msPerBall, maxBallIdx) {
  return Math.min(maxBallIdx, Math.floor(elapsedInInningsMs / msPerBall));
}

const TEAMS = {
  csk: { key: 'csk', name: 'Chennai Super Kings OddsYra SRL', shortName: 'CSK', rating: 82 },
  dc: { key: 'dc', name: 'Delhi Capitals OddsYra SRL', shortName: 'DC', rating: 78 },
  gt: { key: 'gt', name: 'Gujarat Titans OddsYra SRL', shortName: 'GT', rating: 85 },
  kkr: { key: 'kkr', name: 'Kolkata Knight Riders OddsYra SRL', shortName: 'KKR', rating: 83 },
  lsg: { key: 'lsg', name: 'Lucknow Super Giants OddsYra SRL', shortName: 'LSG', rating: 80 },
  mi: { key: 'mi', name: 'Mumbai Indians OddsYra SRL', shortName: 'MI', rating: 84 },
  pbks: { key: 'pbks', name: 'Punjab Kings OddsYra SRL', shortName: 'PBKS', rating: 76 },
  rcb: { key: 'rcb', name: 'Royal Challengers Bengaluru OddsYra SRL', shortName: 'RCB', rating: 81 },
  rr: { key: 'rr', name: 'Rajasthan Royals OddsYra SRL', shortName: 'RR', rating: 79 },
  srh: { key: 'srh', name: 'Sunrisers Hyderabad OddsYra SRL', shortName: 'SRH', rating: 77 },
};

const ROSTERS = {
  csk: ['Conway', 'Gaikwad', 'Rahane', 'Dube', 'Jadeja', 'Dhoni', 'Pathirana', 'Deshpande', 'Mukesh', 'Hangargekar', 'Rashid'],
  dc: ['Warner', 'Shaw', 'Marsh', 'Pant', 'Stubbs', 'Axar', 'Kuldeep', 'Nortje', 'Khaleel', 'Ishant', 'Mukesh'],
  gt: ['Gill', 'Sudharsan', 'Miller', 'Pandya', 'Shankar', 'Rashid', 'Shami', 'Little', 'Noor', 'Sai Kishore', 'Guthrie'],
  kkr: ['Rahul', 'Narine', 'Venkatesh', 'Shreyas', 'Russell', 'Rinku', 'Harshit', 'Starc', 'Vaibhav', 'Chakravarthy', 'Ramandeep'],
  lsg: ['de Kock', 'Rahul', 'Pooran', 'Stoinis', 'Badoni', 'Krunal', 'Bishnoi', 'Mohsin', 'Yash', 'Avesh', 'Naveen'],
  mi: ['Rohit', 'Rickelton', 'SKY', 'Hardik', 'Tilak', 'Pollard', 'Bumrah', 'Boult', 'Chahar', 'Santner', 'Puthur'],
  pbks: ['Shikhar', 'Prabhsimran', 'Curran', 'Shashank', 'Sam Curran', 'Rilee', 'Arshdeep', 'Harshal', 'Rabada', 'Chahal', 'Yuzvendra'],
  rcb: ['Kohli', 'Padikkal', 'Green', 'Maxwell', 'Patidar', 'Dinesh', 'Cameron', 'Krunal', 'Siraj', 'Ferguson', 'Yash Dayal'],
  rr: ['Jaiswal', 'Buttler', 'Sawai', 'Parag', 'Ashwin', 'Jofra', 'Boult', 'Avesh', 'Chahal', 'Sandeep', 'Tushar'],
  srh: ['Head', 'Abhishek', 'Klaasen', 'Markram', 'Heinrich', 'Shahbaz', 'Pat Cummins', 'Bhuvi', 'Unadkat', 'Mayank', 'Tanveer'],
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(...parts) {
  const str = parts.join('|');
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function ballsToOvers(ballCount) {
  const legal = Math.max(0, ballCount);
  return `${Math.floor(legal / 6)}.${legal % 6}`;
}

function formatScheduleTime(ms) {
  const d = new Date(ms);
  const day = d.toLocaleString('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });
  const time = d.toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
  return `${day} - ${time}`;
}

function computeOdds(rating1, rating2) {
  const p1 = rating1 / (rating1 + rating2);
  const margin = 1.06;
  const team1 = Math.max(1.35, Math.min(3.5, 1 / (p1 * margin)));
  const team2 = Math.max(1.35, Math.min(3.5, 1 / ((1 - p1) * margin)));
  return { team1: Number(team1.toFixed(2)), team2: Number(team2.toFixed(2)) };
}

function computeTotalLine(rating1, rating2) {
  const base = 165 + ((rating1 + rating2) / 20);
  return Math.round((base + 0.5) * 2) / 2;
}

function generateFixtures() {
  const keys = Object.keys(TEAMS);
  const n = keys.length;
  const league = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      league.push({
        templateId: `lg_${keys[i]}_${keys[j]}`,
        team1Key: keys[i],
        team2Key: keys[j],
        stage: 'league',
        stageLabel: 'League',
        matchNo: league.length + 1,
      });
    }
  }
  const extraSeen = new Set();
  for (let i = 0; i < n; i += 1) {
    for (const dist of [1, 2, 5]) {
      const j = (i + dist) % n;
      const a = Math.min(i, j);
      const b = Math.max(i, j);
      const pair = `${a}-${b}`;
      if (extraSeen.has(pair)) continue;
      extraSeen.add(pair);
      league.push({
        templateId: `lg2_${keys[b]}_${keys[a]}`,
        team1Key: keys[b],
        team2Key: keys[a],
        stage: 'league',
        stageLabel: 'League',
        matchNo: league.length + 1,
      });
    }
  }
  const playoffs = [
    { templateId: 'po_q1', stage: 'qualifier_1', stageLabel: 'Qualifier 1', matchNo: 71 },
    { templateId: 'po_elim', stage: 'eliminator', stageLabel: 'Eliminator', matchNo: 72 },
    { templateId: 'po_q2', stage: 'qualifier_2', stageLabel: 'Qualifier 2', matchNo: 73 },
    { templateId: 'po_final', stage: 'final', stageLabel: 'Final', matchNo: 74 },
  ].map((row) => ({
    ...row,
    team1Key: 'csk',
    team2Key: 'mi',
    playoff: true,
  }));
  return [...league, ...playoffs];
}

const FIXTURE_TEMPLATES = generateFixtures();

function nextBallOutcome(rng, battingRating) {
  const skill = battingRating / 100;
  const r = rng();
  if (r < 0.055) return { type: 'wicket', runs: 0, display: 'W' };
  if (r < 0.075) return { type: 'dot', runs: 0, display: '0' };
  if (r < 0.17) return { type: 'run', runs: 1, display: '1' };
  if (r < 0.21) return { type: 'run', runs: 2, display: '2' };
  if (r < 0.225) return { type: 'run', runs: 3, display: '3' };
  if (r < 0.28 + skill * 0.05) return { type: 'four', runs: 4, display: '4' };
  if (r < 0.31 + skill * 0.04) return { type: 'six', runs: 6, display: '6' };
  return { type: 'dot', runs: 0, display: '0' };
}

function simulateInnings(rng, battingRating, rosterNames, target = null) {
  const timeline = [];
  let runs = 0;
  let wickets = 0;
  let strikerIdx = 0;
  let nonStrikerIdx = 1;
  const batters = [
    { name: rosterNames[0] || 'Opener 1', runs: 0, balls: 0, fours: 0, sixes: 0, out: false },
    { name: rosterNames[1] || 'Opener 2', runs: 0, balls: 0, fours: 0, sixes: 0, out: false },
  ];
  let nextBatterIdx = 2;
  const bowlingNames = rosterNames.slice(-5);
  const bowlers = bowlingNames.map((name) => ({ name, overs: 0, balls: 0, runs: 0, wickets: 0 }));
  let bowlerIdx = 0;
  let ballsThisOver = 0;
  const MAX_BOWLER_BALLS = 24;
  const ballDisplays = [];

  const rotateBowler = () => {
    const start = bowlerIdx;
    for (let i = 1; i <= bowlers.length; i += 1) {
      const idx = (start + i) % bowlers.length;
      if (bowlers[idx].balls < MAX_BOWLER_BALLS) {
        bowlerIdx = idx;
        return;
      }
    }
  };

  for (let ball = 0; ball < MAX_BALLS && wickets < 10; ball += 1) {
    if (target != null && runs >= target) break;

    const bowler = bowlers[bowlerIdx];
    const outcome = nextBallOutcome(rng, battingRating);
    const striker = batters[strikerIdx];
    striker.balls += 1;
    runs += outcome.runs;
    bowler.balls += 1;
    bowler.runs += outcome.runs;
    bowler.overs = ballsToOvers(bowler.balls);
    if (outcome.type === 'four') striker.fours += 1;
    if (outcome.type === 'six') striker.sixes += 1;
    if (outcome.type === 'wicket') {
      wickets += 1;
      bowler.wickets += 1;
      striker.out = true;
      striker.dismissal = 'bowled';
      if (wickets < 10 && nextBatterIdx < rosterNames.length) {
        batters.push({
          name: rosterNames[nextBatterIdx] || `Batter ${nextBatterIdx + 1}`,
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          out: false,
        });
        strikerIdx = batters.length - 1;
        nextBatterIdx += 1;
      }
    } else {
      striker.runs += outcome.runs;
      if (outcome.runs % 2 === 1) {
        const tmp = strikerIdx;
        strikerIdx = nonStrikerIdx;
        nonStrikerIdx = tmp;
      }
    }

    ballsThisOver += 1;
    if (ballsThisOver >= 6) {
      ballsThisOver = 0;
      rotateBowler();
    }

    ballDisplays.push(outcome.display);
    timeline.push({
      ballIndex: ball,
      runs,
      wickets,
      overs: ballsToOvers(ball + 1),
      ballDisplays: [...ballDisplays],
      strikerIdx,
      nonStrikerIdx,
      batters: batters.map((b) => ({ ...b })),
      bowler: { ...bowler },
    });
  }

  return {
    runs,
    wickets,
    overs: ballsToOvers(timeline.length),
    ballCount: timeline.length,
    timeline,
    batters,
    bowler: bowlers[bowlerIdx],
  };
}

function simulateFullMatch(seed, team1Key, team2Key) {
  const rng = mulberry32(seed);
  const t1 = TEAMS[team1Key];
  const t2 = TEAMS[team2Key];
  const roster1 = ROSTERS[team1Key] || [];
  const roster2 = ROSTERS[team2Key] || [];
  const first = simulateInnings(rng, t1.rating, roster1);
  const target = first.runs + 1;
  const second = simulateInnings(rng, t2.rating, roster2, target);
  const timing = buildMatchTiming(seed);

  let winner = team1Key;
  if (second.runs >= target) winner = team2Key;
  else if (second.ballCount >= MAX_BALLS || second.wickets >= 10) winner = team1Key;

  return {
    first,
    second,
    target,
    timing,
    totalDuration: timing.totalDurationMs,
    winner,
    winnerSide: winner === team2Key ? 'team2' : 'team1',
    team1Key,
    team2Key,
  };
}

function buildScheduleCycle() {
  let offsetMs = 0;
  const entries = FIXTURE_TEMPLATES.map((template, index) => {
    const seed = hashSeed(template.templateId, index);
    const sim = simulateFullMatch(seed, template.team1Key, template.team2Key);
    const entry = {
      template,
      seed,
      sim,
      offsetMs,
      durationMs: sim.totalDuration,
    };
    offsetMs += sim.totalDuration + MATCH_GAP_MS;
    if (index === LEAGUE_MATCH_COUNT - 1) offsetMs += PLAYOFF_BREAK_MS;
    if (index >= LEAGUE_MATCH_COUNT) offsetMs += PLAYOFF_GAP_MS;
    return entry;
  });
  return { entries, cycleMs: offsetMs };
}

const SCHEDULE = buildScheduleCycle();

function resolveSchedulePosition(now) {
  const elapsed = Math.max(0, now - EPOCH_MS);
  const cycleNumber = Math.floor(elapsed / SCHEDULE.cycleMs);
  const cyclePos = elapsed % SCHEDULE.cycleMs;

  let entryIdx = 0;
  for (let i = SCHEDULE.entries.length - 1; i >= 0; i -= 1) {
    if (cyclePos >= SCHEDULE.entries[i].offsetMs) {
      entryIdx = i;
      break;
    }
  }

  const entry = SCHEDULE.entries[entryIdx];
  const startTime = EPOCH_MS + (cycleNumber * SCHEDULE.cycleMs) + entry.offsetMs;
  const globalSlot = (cycleNumber * SCHEDULE.entries.length) + entryIdx;

  return { entry, startTime, globalSlot, cycleNumber, entryIdx };
}

function findAnchorGlobalSlot(now) {
  return resolveSchedulePosition(now).globalSlot;
}

function parseOversToBalls(overs) {
  const m = String(overs ?? '0.0').match(/^(\d+)(?:\.(\d+))?$/);
  if (!m) return 0;
  return (Number(m[1]) * 6) + Number(m[2] || 0);
}

function emptyTeamRow(key) {
  const team = TEAMS[key];
  return {
    key,
    teamId: key,
    name: team.name,
    shortName: team.shortName,
    played: 0,
    won: 0,
    lost: 0,
    noResult: 0,
    points: 0,
    runsFor: 0,
    ballsFor: 0,
    runsAgainst: 0,
    ballsAgainst: 0,
    nrr: 0,
  };
}

function applyCompletedToTable(table, match) {
  if (match.matchState !== 'post') return;
  const home = match.team1?.key;
  const away = match.team2?.key;
  if (!table[home] || !table[away]) return;
  const ld = match.liveDetails || {};
  const firstRuns = Number(ld.firstRuns ?? match.sim?.first?.runs ?? 0);
  const chaseRuns = Number(ld.chaseRuns ?? match.sim?.second?.runs ?? 0);
  const firstBalls = parseOversToBalls(ld.firstOvers ?? match.sim?.first?.overs) || 1;
  const chaseBalls = parseOversToBalls(ld.chaseOvers ?? match.sim?.second?.overs) || 1;
  const winner = ld.winnerKey || match.sim?.winner;
  const homeRuns = firstRuns;
  const awayRuns = chaseRuns;
  const homeBalls = firstBalls;
  const awayBalls = chaseBalls;

  table[home].played += 1;
  table[away].played += 1;
  table[home].runsFor += homeRuns;
  table[home].ballsFor += homeBalls;
  table[home].runsAgainst += awayRuns;
  table[home].ballsAgainst += awayBalls;
  table[away].runsFor += awayRuns;
  table[away].ballsFor += awayBalls;
  table[away].runsAgainst += homeRuns;
  table[away].ballsAgainst += homeBalls;

  if (winner === home) {
    table[home].won += 1;
    table[home].points += 2;
    table[away].lost += 1;
  } else if (winner === away) {
    table[away].won += 1;
    table[away].points += 2;
    table[home].lost += 1;
  } else {
    table[home].noResult += 1;
    table[away].noResult += 1;
    table[home].points += 1;
    table[away].points += 1;
  }
}

function rankTable(rows) {
  return rows
    .map((row) => {
      const nrr = (row.ballsFor > 0 && row.ballsAgainst > 0)
        ? ((row.runsFor / (row.ballsFor / 6)) - (row.runsAgainst / (row.ballsAgainst / 6)))
        : 0;
      return { ...row, nrr: Number(nrr.toFixed(3)) };
    })
    .sort((a, b) => b.points - a.points || b.nrr - a.nrr || b.won - a.won || a.shortName.localeCompare(b.shortName))
    .map((row, idx) => ({ ...row, rank: idx + 1 }));
}

function computeLeagueTable(cycleNumber, now) {
  const table = Object.fromEntries(Object.keys(TEAMS).map((key) => [key, emptyTeamRow(key)]));
  const cycleLen = SCHEDULE.entries.length;
  for (let i = 0; i < LEAGUE_MATCH_COUNT; i += 1) {
    const match = buildMatchFromSchedule((cycleNumber * cycleLen) + i, now);
    applyCompletedToTable(table, match);
  }
  return rankTable(Object.values(table));
}

function placeholderTeam(label, shortName) {
  return {
    key: 'tbd',
    name: label,
    shortName,
    rating: 80,
  };
}

function completedWinnerKey(match) {
  if (match?.matchState !== 'post') return null;
  return match.liveDetails?.winnerKey || match.sim?.winner || null;
}

function leagueStageComplete(table) {
  return table.reduce((sum, row) => sum + row.played, 0) >= LEAGUE_MATCH_COUNT * 2;
}

function resolvePlayoffTeams(cycleNumber, stage, now) {
  const table = computeLeagueTable(cycleNumber, now);
  const top = table.slice(0, 4);
  const cycleLen = SCHEDULE.entries.length;
  const base = cycleNumber * cycleLen;
  const leagueDone = leagueStageComplete(table);

  if (stage === 'qualifier_1') {
    return {
      team1Key: leagueDone ? (top[0]?.key || null) : null,
      team2Key: leagueDone ? (top[1]?.key || null) : null,
      labels: ['1st', '2nd'],
    };
  }
  if (stage === 'eliminator') {
    return {
      team1Key: leagueDone ? (top[2]?.key || null) : null,
      team2Key: leagueDone ? (top[3]?.key || null) : null,
      labels: ['3rd', '4th'],
    };
  }

  const q1 = buildMatchFromSchedule(base + LEAGUE_MATCH_COUNT, now);
  const elim = buildMatchFromSchedule(base + LEAGUE_MATCH_COUNT + 1, now);

  if (stage === 'qualifier_2') {
    const q1Winner = completedWinnerKey(q1);
    const q1Loser = q1Winner && q1.team1?.key !== 'tbd'
      ? (q1Winner === q1.team1.key ? q1.team2.key : q1.team1.key)
      : null;
    return {
      team1Key: q1Loser,
      team2Key: completedWinnerKey(elim),
      labels: ['Q1 loser', 'Eliminator winner'],
    };
  }

  const q2 = buildMatchFromSchedule(base + LEAGUE_MATCH_COUNT + 2, now);
  return {
    team1Key: completedWinnerKey(q1),
    team2Key: completedWinnerKey(q2),
    labels: ['Q1 winner', 'Q2 winner'],
  };
}

function rosterForTeam(key, teamName) {
  const names = ROSTERS[key] || [];
  return {
    name: teamName,
    players: names.map((name, idx) => ({
      name,
      role: idx < 6 ? 'Batsman' : idx < 8 ? 'All-rounder' : 'Bowler',
      isCaptain: idx === 0,
      isKeeper: idx === 5,
    })),
  };
}

function buildScorecardInnings(teamName, inningsData, inningsId) {
  const batters = inningsData.batters
    .filter((b) => b.balls > 0 || b.runs > 0 || !b.out)
    .slice(0, 11)
    .map((b) => ({
      name: b.name,
      runs: b.runs,
      balls: b.balls,
      fours: b.fours,
      sixes: b.sixes,
      sr: b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(1) : '0.0',
      dismissal: b.out ? (b.dismissal || 'out') : 'not out',
      notOut: !b.out,
    }));

  return {
    inningsId,
    batTeamName: teamName,
    score: inningsData.runs,
    wickets: inningsData.wickets,
    overs: inningsData.overs,
    batters,
  };
}

function buildOverHistory(timeline, startBall = 0) {
  const rows = [];
  let current = [];
  let overNum = Math.floor(startBall / 6) + 1;

  timeline.forEach((frame, idx) => {
    const display = frame.ballDisplays[frame.ballDisplays.length - 1];
    current.push(display);
    if (current.length === 6 || idx === timeline.length - 1) {
      rows.push({ overNum, balls: [...current], isCurrent: false });
      current = [];
      overNum += 1;
    }
  });

  if (rows.length) rows[rows.length - 1].isCurrent = true;
  return rows;
}

function rebaseRuns(naturalNow, naturalAtAnchor, anchorRuns) {
  const now = Number(naturalNow);
  const at = Number(naturalAtAnchor);
  const target = Number(anchorRuns);
  if (!Number.isFinite(target)) return now;
  if (!Number.isFinite(now)) return Math.max(0, Math.round(target));
  if (!Number.isFinite(at)) return Math.max(0, Math.round(target));
  return Math.max(0, Math.round(target + (now - at)));
}

/**
 * Rebase live scoreboard from operator score anchors (market declares).
 * Once the innings reaches the anchored over, scoring continues relative to that declare.
 */
export function applySrlScoreAnchors(live, sim, anchors = []) {
  if (!live || !sim || !Array.isArray(anchors) || anchors.length === 0) return live;
  const out = { ...live };
  let touched = null;

  for (const anchor of anchors) {
    const innings = Number(anchor.innings) || 1;
    const atOver = Number(anchor.atOver);
    const ballIndex = Number.isFinite(Number(anchor.ballIndex))
      ? Number(anchor.ballIndex)
      : (Number.isFinite(atOver) ? Math.max(0, Math.round(atOver * 6) - 1) : null);
    if (ballIndex == null || ballIndex < 0) continue;

    const timeline = innings === 1 ? sim.first?.timeline : sim.second?.timeline;
    if (!Array.isArray(timeline) || !timeline.length) continue;
    const naturalAtAnchor = Number.isFinite(Number(anchor.naturalRunsAtAnchor))
      ? Number(anchor.naturalRunsAtAnchor)
      : Number(timeline[Math.min(ballIndex, timeline.length - 1)]?.runs || 0);
    const anchorRuns = Number(anchor.runs);
    if (!Number.isFinite(anchorRuns)) continue;

    if (innings === 1) {
      const firstNaturalNow = out.firstRuns != null ? Number(out.firstRuns) : Number(out.runs);
      const oversDone = parseOversParts(out.firstOvers || out.overs)?.completed ?? 0;
      const pastAnchor = Number.isFinite(atOver) ? oversDone >= atOver : true;
      const inFirst = out.inningsId === 1 || out.phase === 'first' || out.phase === 'first-complete';
      if (pastAnchor || !inFirst || out.phase === 'break' || out.phase === 'chase' || out.phase === 'chase-complete') {
        const adjusted = rebaseRuns(
          Number.isFinite(firstNaturalNow) ? firstNaturalNow : naturalAtAnchor,
          naturalAtAnchor,
          anchorRuns,
        );
        out.firstRuns = adjusted;
        out.runs = adjusted;
        touched = { innings: 1, runs: adjusted, overs: out.firstOvers || out.overs, wickets: out.firstWickets ?? out.wickets };
        if (Array.isArray(out.scorecardInnings) && out.scorecardInnings[0]) {
          out.scorecardInnings = out.scorecardInnings.map((inn, idx) => (
            idx === 0 ? { ...inn, runs: adjusted, displayScore: `${adjusted}/${inn.wickets ?? out.firstWickets ?? 0}` } : inn
          ));
        }
      }
    } else if (innings === 2) {
      const chaseNatural = out.chaseRuns != null ? Number(out.chaseRuns) : Number(out.score2);
      const oversDone = parseOversParts(out.chaseOvers || out.overs2)?.completed ?? 0;
      const pastAnchor = Number.isFinite(atOver) ? oversDone >= atOver : (out.inningsId === 2);
      if (pastAnchor && (out.inningsId === 2 || out.phase === 'chase' || out.phase === 'chase-complete')) {
        const adjusted = rebaseRuns(
          Number.isFinite(chaseNatural) ? chaseNatural : naturalAtAnchor,
          naturalAtAnchor,
          anchorRuns,
        );
        out.chaseRuns = adjusted;
        out.score2 = adjusted;
        touched = { innings: 2, runs: adjusted, overs: out.chaseOvers || out.overs2, wickets: out.chaseWickets ?? out.wickets2 };
        if (Array.isArray(out.scorecardInnings) && out.scorecardInnings[1]) {
          out.scorecardInnings = out.scorecardInnings.map((inn, idx) => (
            idx === 1 ? { ...inn, runs: adjusted, displayScore: `${adjusted}/${inn.wickets ?? out.chaseWickets ?? 0}` } : inn
          ));
        }
      }
    }
  }

  if (touched?.innings === 1) {
    out.commentary = `${out.firstTeamName || 'Team'} ${touched.runs}/${touched.wickets ?? 0} (${touched.overs || '0.0'} ov) · declare locked`;
  } else if (touched?.innings === 2) {
    out.commentary = `${out.chaseTeamName || 'Team'} ${touched.runs}/${touched.wickets ?? 0} (${touched.overs || '0.0'} ov) · declare locked`;
  }

  return out;
}

function stateAtElapsed(sim, elapsedMs, team1, team2) {
  const { first, second, target, timing } = sim;
  const {
    msPerBall,
    firstInningsEndMs,
    breakEndMs,
    inningsPlayMs,
    inningsBreakMs,
  } = timing;

  if (elapsedMs < firstInningsEndMs) {
    const maxBallIdx = Math.max(0, first.ballCount - 1);
    const ballIdx = ballIndexAtTime(elapsedMs, msPerBall, maxBallIdx);
    const frame = first.timeline[ballIdx] || first.timeline[first.timeline.length - 1];
    const inningsComplete = ballIdx >= maxBallIdx;
    const striker = frame.batters[frame.strikerIdx];
    const nonStriker = frame.batters[frame.nonStrikerIdx];
    const bowler = frame.bowler;

    return {
      phase: inningsComplete ? 'first-complete' : 'first',
      inningsId: 1,
      matchState: 'in',
      isLive: true,
      time: 'Live',
      firstTeamName: team1.name,
      runs: frame.runs,
      wickets: frame.wickets,
      overs: frame.overs,
      firstRuns: frame.runs,
      firstWickets: frame.wickets,
      firstOvers: frame.overs,
      score2: 0,
      wickets2: 0,
      overs2: '0.0',
      commentary: inningsComplete
        ? `${team1.name} ${frame.runs}/${frame.wickets} — innings complete (${MAX_OVERS} overs)`
        : `${team1.name} batting · 1st innings (${MAX_OVERS} ov)`,
      batter1: inningsComplete ? undefined : {
        name: striker.name, runs: striker.runs, balls: striker.balls,
        fours: striker.fours, sixes: striker.sixes, isStriker: true,
      },
      batter2: inningsComplete ? undefined : {
        name: nonStriker.name, runs: nonStriker.runs, balls: nonStriker.balls,
        fours: nonStriker.fours, sixes: nonStriker.sixes, isStriker: false,
      },
      bowler: inningsComplete ? undefined : {
        name: bowler.name, runs: bowler.runs, wickets: bowler.wickets, overs: bowler.overs, maidens: 0,
      },
      currentOverBalls: inningsComplete ? [] : frame.ballDisplays.slice(-6),
      scorecardInnings: [buildScorecardInnings(team1.name, {
        ...first, batters: frame.batters, runs: frame.runs, wickets: frame.wickets, overs: frame.overs,
      }, 1)],
      overHistory: buildOverHistory(first.timeline.slice(0, ballIdx + 1)),
      inningsPlayMs,
    };
  }

  if (elapsedMs < breakEndMs) {
    return {
      phase: 'break',
      inningsId: 1,
      matchState: 'in',
      isLive: true,
      time: 'Innings break',
      firstTeamName: team1.name,
      chaseTeamName: team2.name,
      runs: first.runs,
      wickets: first.wickets,
      overs: first.overs,
      firstRuns: first.runs,
      firstWickets: first.wickets,
      firstOvers: first.overs,
      score2: 0,
      wickets2: 0,
      overs2: '0.0',
      commentary: `Innings break · ${Math.round(inningsBreakMs / MINUTE_MS)} min · Target ${target}`,
      scorecardInnings: [buildScorecardInnings(team1.name, first, 1)],
      overHistory: buildOverHistory(first.timeline),
    };
  }

  const chaseElapsed = elapsedMs - breakEndMs;
  const maxChaseBallIdx = Math.max(0, second.ballCount - 1);
  const ballIdx = ballIndexAtTime(chaseElapsed, msPerBall, maxChaseBallIdx);
  const frame = second.timeline[ballIdx] || second.timeline[second.timeline.length - 1];
  const inningsComplete = ballIdx >= maxChaseBallIdx;
  const striker = frame.batters[frame.strikerIdx];
  const nonStriker = frame.batters[frame.nonStrikerIdx];
  const bowler = frame.bowler;
  const runsNeeded = Math.max(0, target - frame.runs);
  const ballsLeft = Math.max(0, MAX_BALLS - (ballIdx + 1));

  return {
    phase: inningsComplete ? 'chase-complete' : 'chase',
    inningsId: 2,
    matchState: 'in',
    isLive: true,
    time: 'Live',
    firstTeamName: team1.name,
    chaseTeamName: team2.name,
    firstRuns: first.runs,
    firstWickets: first.wickets,
    firstOvers: first.overs,
    chaseRuns: frame.runs,
    chaseWickets: frame.wickets,
    chaseOvers: frame.overs,
    chaseBallNbr: ballIdx + 1,
    runs: first.runs,
    wickets: first.wickets,
    overs: first.overs,
    score2: frame.runs,
    wickets2: frame.wickets,
    overs2: frame.overs,
    remainingBalls: ballsLeft,
    requiredRunRate: ballsLeft > 0 ? ((runsNeeded / ballsLeft) * 6).toFixed(2) : '0.00',
    commentary: inningsComplete
      ? `${team2.name} ${frame.runs}/${frame.wickets} — innings complete (${MAX_OVERS} ov)`
      : `${team2.name} need ${runsNeeded} runs in ${ballsLeft} balls · 2nd innings (${MAX_OVERS} ov)`,
    batter1: inningsComplete ? undefined : {
      name: striker.name, runs: striker.runs, balls: striker.balls,
      fours: striker.fours, sixes: striker.sixes, isStriker: true,
    },
    batter2: inningsComplete ? undefined : {
      name: nonStriker.name, runs: nonStriker.runs, balls: nonStriker.balls,
      fours: nonStriker.fours, sixes: nonStriker.sixes, isStriker: false,
    },
    bowler: inningsComplete ? undefined : {
      name: bowler.name, runs: bowler.runs, wickets: bowler.wickets, overs: bowler.overs, maidens: 0,
    },
    currentOverBalls: inningsComplete ? [] : frame.ballDisplays.slice(-6),
    scorecardInnings: [
      buildScorecardInnings(team1.name, first, 1),
      buildScorecardInnings(team2.name, {
        ...second, batters: frame.batters, runs: frame.runs, wickets: frame.wickets, overs: frame.overs,
      }, 2),
    ],
    overHistory: buildOverHistory(second.timeline.slice(0, ballIdx + 1)),
  };
}

function forceCompletedBoard(sim, template, team1, team2, winnerKey, live = null) {
  const firstRuns = live?.firstRuns ?? sim.first.runs;
  const firstWickets = live?.firstWickets ?? sim.first.wickets;
  const firstOvers = live?.firstOvers ?? sim.first.overs;
  let chaseRuns = live?.chaseRuns ?? live?.score2 ?? sim.second.runs;
  let chaseWickets = live?.chaseWickets ?? live?.wickets2 ?? sim.second.wickets;
  let chaseOvers = live?.chaseOvers ?? live?.overs2 ?? sim.second.overs;
  const team1Wins = winnerKey === template.team1Key;

  if (team1Wins && chaseRuns >= firstRuns) {
    chaseRuns = Math.max(0, firstRuns - 1);
  } else if (!team1Wins && chaseRuns <= firstRuns) {
    chaseRuns = firstRuns + 1;
    chaseWickets = Math.min(9, chaseWickets || 0);
  }

  const winnerTeam = team1Wins ? team1.name : team2.name;
  const margin = team1Wins
    ? `won by ${firstRuns - chaseRuns} runs`
    : `won by ${10 - chaseWickets} wickets`;

  return {
    commentary: `${winnerTeam} ${margin}`,
    firstTeamName: team1.name,
    chaseTeamName: team2.name,
    firstRuns,
    firstWickets,
    firstOvers,
    chaseRuns,
    chaseWickets,
    chaseOvers,
    runs: firstRuns,
    wickets: firstWickets,
    overs: firstOvers,
    score2: chaseRuns,
    wickets2: chaseWickets,
    overs2: chaseOvers,
    winnerKey,
    resultSummary: `${winnerTeam} ${margin}`,
  };
}

function buildMatchFromSchedule(globalSlot, now) {
  const cycleLen = SCHEDULE.entries.length;
  const entryIdx = ((globalSlot % cycleLen) + cycleLen) % cycleLen;
  const cycleNumber = Math.floor(globalSlot / cycleLen);
  const entry = SCHEDULE.entries[entryIdx];
  const { sim } = entry;
  let template = { ...entry.template };
  let team1 = TEAMS[template.team1Key];
  let team2 = TEAMS[template.team2Key];
  let teamsLocked = true;

  if (template.playoff) {
    const resolved = resolvePlayoffTeams(cycleNumber, template.stage, now);
    teamsLocked = Boolean(TEAMS[resolved.team1Key] && TEAMS[resolved.team2Key]);
    team1 = TEAMS[resolved.team1Key] || placeholderTeam(resolved.labels[0], resolved.labels[0]);
    team2 = TEAMS[resolved.team2Key] || placeholderTeam(resolved.labels[1], resolved.labels[1]);
    template = {
      ...template,
      team1Key: team1.key,
      team2Key: team2.key,
    };
  }

  const kit = teamKitColors(team1.name, team2.name);
  const odds = teamsLocked ? computeOdds(team1.rating, team2.rating) : { team1: 0, team2: 0 };
  const totalLine = computeTotalLine(team1.rating || 80, team2.rating || 80);
  const id = `srl_ipl_${globalSlot}`;
  const pairKey = [team1.name, team2.name].sort().join('|').toLowerCase();
  const naturalWinner = teamsLocked
    ? (sim.winnerSide === 'team2' ? team2.key : team1.key)
    : null;
  const startTime = EPOCH_MS + (cycleNumber * SCHEDULE.cycleMs) + entry.offsetMs;
  const stageMeta = {
    stage: template.stage || 'league',
    stageLabel: template.stageLabel || 'League',
    matchNo: template.matchNo || (entryIdx + 1),
    playoff: !!template.playoff,
    teamsLocked,
  };

  const base = {
    id,
    source: 'srl',
    scoreSource: 'sim',
    league: IPL_SRL_LEAGUE,
    seriesName: IPL_SRL_LEAGUE,
    matchType: 'T20',
    matchFormat: 'T20',
    oversPerInnings: MAX_OVERS,
    expectedDuration: formatDuration(sim.timing.totalDurationMs),
    expectedDurationMs: sim.timing.totalDurationMs,
    sport: 'cricket',
    sportColor: '#f97316',
    team1: { ...team1, color: kit.team1Color },
    team2: { ...team2, color: kit.team2Color },
    odds,
    srlMarkets: {
      totalRuns: totalLine,
      overOdds: 1.85,
      underOdds: 1.85,
    },
    extraMarkets: 24 + (globalSlot % 7),
    pairKey,
    squads: [
      rosterForTeam(team1.key === 'tbd' ? 'csk' : template.team1Key, team1.name),
      rosterForTeam(team2.key === 'tbd' ? 'mi' : template.team2Key, team2.name),
    ],
    startTime,
    endTime: startTime + sim.totalDuration,
    scheduleLabel: formatScheduleTime(startTime),
    sim: { ...sim, winner: naturalWinner || sim.winner },
    operator: null,
    ...stageMeta,
  };

  const op = getSrlOperatorSession(id);
  base.operator = {
    started: !!op.startedAt,
    paused: !!op.pausedAt && !op.declaredWinnerKey,
    forcedWinnerKey: op.forcedWinnerKey,
    declaredWinnerKey: op.declaredWinnerKey,
    bettingClosed: !!op.bettingClosed,
    scoreAnchors: Array.isArray(op.scoreAnchors) ? op.scoreAnchors : [],
  };
  base.bettingClosed = !!op.bettingClosed;

  const preMatch = {
    ...base,
    time: base.scheduleLabel,
    isLive: false,
    matchState: 'pre',
    liveDetails: {
      commentary: teamsLocked
        ? `Upcoming · ${template.stageLabel || 'League'} · ${MAX_OVERS} overs per side`
        : `${template.stageLabel} · teams to be decided from the points table`,
    },
  };

  const clockElapsed = Math.max(0, now - startTime);
  const elapsed = op.startedAt || op.pausedAt
    ? getSrlOperatorElapsedMs(op, now)
    : clockElapsed;
  const winnerKey = op.declaredWinnerKey || op.forcedWinnerKey || naturalWinner;

  if (!teamsLocked || (!op.startedAt && !op.declaredWinnerKey && now < startTime)) {
    return preMatch;
  }
  const completed = (liveSnapshot = null) => {
    const board = forceCompletedBoard(sim, template, team1, team2, winnerKey, liveSnapshot);
    return {
      ...base,
      time: 'Completed',
      isLive: false,
      matchState: 'post',
      liveDetails: board,
      scorecardInnings: [
        buildScorecardInnings(team1.name, { ...sim.first, runs: board.firstRuns, wickets: board.firstWickets, overs: board.firstOvers }, 1),
        buildScorecardInnings(team2.name, { ...sim.second, runs: board.chaseRuns, wickets: board.chaseWickets, overs: board.chaseOvers }, 2),
      ],
    };
  };

  if (op.declaredWinnerKey) {
    const snapElapsed = Math.min(elapsed, sim.totalDuration - 1);
    const liveSnap = snapElapsed > 0
      ? applySrlScoreAnchors(stateAtElapsed(sim, snapElapsed, team1, team2), sim, op.scoreAnchors)
      : null;
    return completed(liveSnap);
  }

  if (elapsed >= sim.totalDuration) {
    return completed();
  }

  const live = applySrlScoreAnchors(stateAtElapsed(sim, elapsed, team1, team2), sim, op.scoreAnchors);
  return {
    ...base,
    time: op.pausedAt ? 'Paused' : 'Live',
    isLive: true,
    matchState: 'in',
    extraMarkets: 30,
    liveDetails: {
      ...live,
      commentary: live.commentary,
    },
    scorecardInnings: live.scorecardInnings,
    overHistory: live.overHistory,
  };
}

/**
 * Matches visible in the IPL SRL league view — one live, rest upcoming (plus recent completed hidden from bettable).
 */
export function getIplSrlMatches(now = Date.now()) {
  now = getSrlSimNow(now);
  const anchor = findAnchorGlobalSlot(now);
  const cycleLen = SCHEDULE.entries.length;
  const matches = [];

  for (let offset = 0; offset < cycleLen && matches.length < VISIBLE_MATCHES; offset += 1) {
    const match = buildMatchFromSchedule(anchor + offset, now);
    if (match.matchState === 'post') continue;
    if (match.team1?.key === 'tbd' || match.teamsLocked === false) continue;
    matches.push(match);
  }

  if (matches.length === 0) {
    for (let offset = 0; offset < cycleLen; offset += 1) {
      const match = buildMatchFromSchedule(anchor + offset, now);
      if (match.team1?.key === 'tbd') continue;
      matches.push(match);
      break;
    }
  }

  return matches.sort((a, b) => {
    const liveA = a.matchState === 'in' ? 0 : 1;
    const liveB = b.matchState === 'in' ? 0 : 1;
    if (liveA !== liveB) return liveA - liveB;
    return (a.startTime || 0) - (b.startTime || 0);
  });
}

export function getIplSrlSeasonMatches(now = Date.now()) {
  now = getSrlSimNow(now);
  const { cycleNumber } = resolveSchedulePosition(now);
  const cycleLen = SCHEDULE.entries.length;
  const matches = [];
  for (let i = 0; i < cycleLen; i += 1) {
    matches.push(buildMatchFromSchedule((cycleNumber * cycleLen) + i, now));
  }
  return matches;
}

export function getIplSrlPointsTable(now = Date.now()) {
  now = getSrlSimNow(now);
  const { cycleNumber } = resolveSchedulePosition(now);
  return computeLeagueTable(cycleNumber, now);
}

export function isIplSrlLeague(leagueKey) {
  if (!leagueKey || leagueKey === 'all') return false;
  const key = String(leagueKey).toLowerCase();
  return key === 'ipl-srl'
    || key === 'oddsyra-srl'
    || key === 'betking-srl'
    || key.includes('oddsyra srl')
    || key.includes('betking srl')
    || key.includes('indian premier league srl')
    || key.includes('ipl srl');
}

export function isIplSrlMatch(match) {
  return match?.source === 'srl' || String(match?.id || '').startsWith('srl_ipl_');
}

/**
 * Extract globalSlot from SRL match ID (e.g., 'srl_ipl_1022' -> 1022)
 */
export function extractSrlGlobalSlot(matchId) {
  if (!matchId) return null;
  const match = String(matchId).match(/^srl_ipl_(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Build a specific SRL match by globalSlot, regardless of visibility window
 */
export function getIplSrlMatchById(matchId, now = Date.now()) {
  const globalSlot = extractSrlGlobalSlot(matchId);
  if (globalSlot === null) return null;
  return buildMatchFromSchedule(globalSlot, getSrlSimNow(now));
}

export function getIplSrlSchedule(now = Date.now(), count = VISIBLE_MATCHES) {
  now = getSrlSimNow(now);
  const anchor = findAnchorGlobalSlot(now);
  const size = Math.max(1, Number(count) || VISIBLE_MATCHES);
  const matches = [];
  for (let offset = 0; offset < size; offset += 1) {
    matches.push(buildMatchFromSchedule(anchor + offset, now));
  }
  return matches;
}

/** Admin desk: full current cycle (70 league + 4 playoffs). */
export function getIplSrlDeskMatches(now = Date.now()) {
  return getIplSrlSeasonMatches(now);
}
