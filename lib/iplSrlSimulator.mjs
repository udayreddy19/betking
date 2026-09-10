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
  getCustomSrlMatch,
  listCustomSrlMatches,
} from './iplSrlOperatorState.mjs';
import { parseOversParts } from './matchOverSnapshotStore.mjs';
import { enrichIplSrlMatchList } from './iplSrlCardMarkets.mjs';

export const IPL_SRL_LEAGUE = 'OddsYra SRL';
export const IPL_SRL_BREADCRUMB = 'OddsYra SRL — simulated matches';

const EPOCH_MS = SRL_LAUNCH_AT;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** IPL T20: 20 overs per innings, ~3.5–4 hours total, innings split evenly. */
const IPL_MATCH_MIN_MS = 3.5 * HOUR_MS;
const IPL_MATCH_MAX_MS = 4 * HOUR_MS;
const IPL_INNINGS_BREAK_MS = 20 * MINUTE_MS;
/** IPL cadence: weekdays 1× evening, weekends afternoon + evening. */
const SLOT_AFTERNOON = { hour: 15, minute: 30 };
const SLOT_EVENING = { hour: 19, minute: 30 };
/** Rest day after league ends, then one playoff evening per day. */
const PLAYOFF_REST_DAYS = 1;
const MAX_OVERS = 20;
const MAX_BALLS = MAX_OVERS * 6;
const VISIBLE_MATCHES = 8;
/** Recent finished fixtures kept on the public Sports / SRL board for history. */
const RECENT_COMPLETED_MATCHES = 8;
/** Toss result is desk-only until this long before start (users see it only then). */
export const SRL_TOSS_PUBLIC_LEAD_MS = 25 * 60 * 1000;
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

/** Normalize desk / engine / short codes to ROSTERS keys (csk, mi, …). */
export function normalizeSrlTeamKey(teamKeyOrShort) {
  const raw = String(teamKeyOrShort || '').trim().toLowerCase();
  if (!raw || raw === 'tbd') return null;
  const stripped = raw.replace(/_srl$/i, '').replace(/\s+/g, '');
  if (ROSTERS[stripped]) return stripped;
  const byShort = Object.values(TEAMS).find(
    (t) => t.key === stripped || t.shortName.toLowerCase() === stripped || t.shortName.toLowerCase() === raw,
  );
  return byShort?.key || null;
}

/** Default Playing XI names for a team — used by admin lineup auto-fill for every fixture. */
export function getSrlPlayingXINames(teamKeyOrShort) {
  const key = normalizeSrlTeamKey(teamKeyOrShort);
  if (!key) return [];
  return [...(ROSTERS[key] || [])].slice(0, 11);
}

export function getSrlTeamRoster(teamKeyOrShort) {
  const key = normalizeSrlTeamKey(teamKeyOrShort);
  if (!key) return null;
  const team = TEAMS[key];
  return rosterForTeam(key, team?.name || key.toUpperCase());
}

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

/** Wall-clock in Asia/Kolkata (SRL schedule timezone) — avoid server UTC vs browser IST drift. */
export function formatSrlIstClock(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '';
  return new Date(n).toLocaleString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
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

function shuffleArray(list, rng) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function fixtureSharesTeam(a, b) {
  if (!a || !b) return false;
  return a.team1Key === b.team1Key
    || a.team1Key === b.team2Key
    || a.team2Key === b.team1Key
    || a.team2Key === b.team2Key;
}

/**
 * Order league fixtures so early slate is mixed (not one franchise first)
 * and no team is scheduled twice on the same calendar day once slots are applied.
 */
function balanceLeagueFixtures(rawLeague) {
  const rng = mulberry32(hashSeed('oddsyra_srl_fixture_order', 'ipl_v2'));
  const pool = shuffleArray(rawLeague, rng);
  const ordered = [];
  const recent = [];

  while (pool.length) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i += 1) {
      const cand = pool[i];
      let score = rng() * 0.35;
      // Prefer teams not seen in the last few matches
      for (const prev of recent) {
        if (fixtureSharesTeam(cand, prev)) score -= 3;
      }
      // Soft penalty if a team already appears a lot early
      if (ordered.length < 16) {
        const earlyCount = {};
        for (const m of ordered) {
          earlyCount[m.team1Key] = (earlyCount[m.team1Key] || 0) + 1;
          earlyCount[m.team2Key] = (earlyCount[m.team2Key] || 0) + 1;
        }
        score -= (earlyCount[cand.team1Key] || 0) * 1.4;
        score -= (earlyCount[cand.team2Key] || 0) * 1.4;
      }
      // Weekend double-header pairs: avoid shared teams on consecutive odd→even slots
      // Slot groups: after ordering, buildScheduleCycle pairs weekend days as (k,k+1).
      // Prefer no shared team with previous when previous is "afternoon" of a pair —
      // approximated here by avoiding back-to-back shared teams entirely (IPL rest).
      if (ordered.length && fixtureSharesTeam(cand, ordered[ordered.length - 1])) {
        score -= 8;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    const [picked] = pool.splice(bestIdx, 1);
    ordered.push(picked);
    recent.push(picked);
    if (recent.length > 4) recent.shift();
  }

  return ordered.map((row, idx) => ({
    ...row,
    matchNo: idx + 1,
  }));
}

function buildLeaguePairings() {
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
      });
    }
  }
  return league;
}

function generateFixtures() {
  const league = balanceLeagueFixtures(buildLeaguePairings());
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

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Calendar Y-M-D parts in Asia/Kolkata for an absolute timestamp. */
function istYmd(ms) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
  };
}

function istWeekday(ms) {
  // 0=Sun … 6=Sat in IST
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  }).format(new Date(ms));
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[label] ?? 0;
}

function msAtIst(year, month, day, hour, minute) {
  return Date.parse(
    `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:00+05:30`,
  );
}

function addIstDays(ymd, days) {
  const base = msAtIst(ymd.year, ymd.month, ymd.day, 12, 0);
  return istYmd(base + (days * 24 * HOUR_MS));
}

/**
 * IPL-style start slots from season epoch:
 * Mon–Fri → one evening (19:30 IST)
 * Sat–Sun → afternoon (15:30) + evening (19:30)
 */
function buildIplLeagueStartOffsets(count, epochMs = EPOCH_MS) {
  const offsets = [];
  let day = istYmd(epochMs);
  while (offsets.length < count) {
    const noon = msAtIst(day.year, day.month, day.day, 12, 0);
    const dow = istWeekday(noon);
    const weekend = dow === 0 || dow === 6;
    if (weekend) {
      if (offsets.length < count) {
        offsets.push(msAtIst(day.year, day.month, day.day, SLOT_AFTERNOON.hour, SLOT_AFTERNOON.minute) - epochMs);
      }
      if (offsets.length < count) {
        offsets.push(msAtIst(day.year, day.month, day.day, SLOT_EVENING.hour, SLOT_EVENING.minute) - epochMs);
      }
    } else {
      offsets.push(msAtIst(day.year, day.month, day.day, SLOT_EVENING.hour, SLOT_EVENING.minute) - epochMs);
    }
    day = addIstDays(day, 1);
  }
  return offsets;
}

function buildIplPlayoffStartOffsets(count, afterOffsetMs, epochMs = EPOCH_MS) {
  const lastLeagueStart = epochMs + afterOffsetMs;
  let day = addIstDays(istYmd(lastLeagueStart), PLAYOFF_REST_DAYS);
  // If rest lands on a morning before evening of same calendar day as last match, still ok.
  // Prefer starting playoffs on the next evening day after rest.
  const offsets = [];
  while (offsets.length < count) {
    offsets.push(msAtIst(day.year, day.month, day.day, SLOT_EVENING.hour, SLOT_EVENING.minute) - epochMs);
    day = addIstDays(day, 1);
  }
  return offsets;
}

/**
 * After calendar slots are known, swap later fixtures so weekend
 * double-headers never share a franchise (IPL rest rule).
 */
function enforceNoSameDaySharedTeams(leagueTemplates, startOffsets) {
  const list = [...leagueTemplates];
  const dayKeyForOffset = (offsetMs) => {
    const ymd = istYmd(EPOCH_MS + offsetMs);
    return `${ymd.year}-${pad2(ymd.month)}-${pad2(ymd.day)}`;
  };

  for (let i = 0; i < list.length - 1; i += 1) {
    if (dayKeyForOffset(startOffsets[i]) !== dayKeyForOffset(startOffsets[i + 1])) continue;
    if (!fixtureSharesTeam(list[i], list[i + 1])) continue;
    let swapAt = -1;
    for (let j = i + 2; j < list.length; j += 1) {
      if (fixtureSharesTeam(list[i], list[j])) continue;
      // Also avoid breaking the next day's pair if j is afternoon of a double
      const jDay = dayKeyForOffset(startOffsets[j]);
      const jPartner = j + 1 < list.length && dayKeyForOffset(startOffsets[j + 1]) === jDay ? list[j + 1] : null;
      if (jPartner && fixtureSharesTeam(list[i + 1], jPartner)) continue;
      swapAt = j;
      break;
    }
    if (swapAt >= 0) {
      const tmp = list[i + 1];
      list[i + 1] = list[swapAt];
      list[swapAt] = tmp;
    }
  }

  return list.map((row, idx) => ({ ...row, matchNo: idx + 1 }));
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
  const rawLeague = FIXTURE_TEMPLATES.filter((t) => !t.playoff);
  const playoffTemplates = FIXTURE_TEMPLATES.filter((t) => t.playoff);
  const leagueOffsets = buildIplLeagueStartOffsets(LEAGUE_MATCH_COUNT);
  const leagueTemplates = enforceNoSameDaySharedTeams(rawLeague, leagueOffsets);
  const playoffOffsets = buildIplPlayoffStartOffsets(
    PLAYOFF_MATCH_COUNT,
    leagueOffsets[leagueOffsets.length - 1],
  );
  const templates = [...leagueTemplates, ...playoffTemplates];
  const startOffsets = [...leagueOffsets, ...playoffOffsets];

  const entries = templates.map((template, index) => {
    const seed = hashSeed(template.templateId, index);
    const sim = simulateFullMatch(seed, template.team1Key, template.team2Key);
    return {
      template,
      seed,
      sim,
      offsetMs: startOffsets[index],
      durationMs: sim.totalDuration,
    };
  });

  const last = entries[entries.length - 1];
  const cycleMs = last.offsetMs + last.durationMs + (12 * HOUR_MS);
  return { entries, cycleMs };
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

function rebaseWickets(naturalNow, naturalAtAnchor, anchorWickets) {
  const now = Number(naturalNow);
  const at = Number(naturalAtAnchor);
  const target = Number(anchorWickets);
  if (!Number.isFinite(target)) return now;
  if (!Number.isFinite(now)) return Math.max(0, Math.min(10, Math.round(target)));
  if (!Number.isFinite(at)) return Math.max(0, Math.min(10, Math.round(target)));
  return Math.max(0, Math.min(10, Math.round(target + (now - at))));
}

/** Count dismissals on a scorecard innings (source of truth for FoW). */
export function fallOfWicketsFromScorecard(inn) {
  if (!inn || !Array.isArray(inn.batters)) return 0;
  return inn.batters.filter((b) => {
    if (!b) return false;
    if (b.out === true) return true;
    const d = String(b.dismissal || '').trim();
    if (!d) return false;
    return !/^(batting|not\s*out|dnb|did not bat)$/i.test(d);
  }).length;
}

function countWicketBalls(live = {}) {
  const bags = Array.isArray(live.currentOverBalls) ? live.currentOverBalls : [];
  return bags.filter((b) => /^w$/i.test(String(b || '').trim())).length;
}

/**
 * Never let board totals show fewer wickets than scorecard FoW / tracker W balls.
 * Fixes header "17/0" while batters already show bowled / timeline shows W.
 */
export function syncSrlWicketsToFallOfWicket(live) {
  if (!live) return live;
  const out = { ...live };
  const inns = Array.isArray(out.scorecardInnings)
    ? out.scorecardInnings.map((inn) => ({ ...inn, batters: Array.isArray(inn?.batters) ? [...inn.batters] : [] }))
    : null;
  const activeInnIdx = (out.inningsId === 2 || out.phase === 'chase' || out.phase === 'chase-complete') ? 1 : 0;
  const trackerW = countWicketBalls(out);

  const floorInn = (idx, runsKey, wicketsKey, altWicketsKey) => {
    const inn = inns?.[idx];
    const fow = Math.max(
      fallOfWicketsFromScorecard(inn),
      idx === activeInnIdx ? trackerW : 0,
    );
    if (fow <= 0 && out[wicketsKey] == null && out[altWicketsKey] == null && !inn) return;
    const current = Math.max(
      0,
      Number(out[wicketsKey] ?? out[altWicketsKey] ?? inn?.wickets ?? 0) || 0,
    );
    const next = Math.max(0, Math.min(10, Math.max(current, fow)));
    out[wicketsKey] = next;
    if (altWicketsKey) out[altWicketsKey] = next;
    if (inns?.[idx]) {
      const runs = Number(out[runsKey] ?? inns[idx].runs ?? 0) || 0;
      inns[idx] = {
        ...inns[idx],
        wickets: next,
        displayScore: `${runs}/${next}`,
      };
    }
    return next;
  };

  floorInn(0, 'firstRuns', 'firstWickets', 'wickets');
  if (inns?.[1] || out.chaseWickets != null || out.wickets2 != null || out.phase === 'chase' || out.phase === 'chase-complete' || out.inningsId === 2) {
    floorInn(1, 'chaseRuns', 'chaseWickets', 'wickets2');
  }
  if (inns) out.scorecardInnings = inns;
  return out;
}

/**
 * Rebase live scoreboard from operator score anchors (market declares / incident injects).
 * Once the innings reaches the anchored ball, scoring continues relative to that declare.
 */
export function applySrlScoreAnchors(live, sim, anchors = []) {
  if (!live || !sim || !Array.isArray(anchors) || anchors.length === 0) {
    return syncSrlWicketsToFallOfWicket(live);
  }
  const out = { ...live };
  let touched = null;

  const oversToBallCount = (oversVal) => {
    const p = parseOversParts(oversVal);
    if (!p) return 0;
    return (p.completed * 6) + Math.min(5, Math.max(0, p.balls));
  };

  for (const anchor of anchors) {
    const innings = Number(anchor.innings) || 1;
    const atOver = Number(anchor.atOver);
    const ballIndex = Number.isFinite(Number(anchor.ballIndex))
      ? Number(anchor.ballIndex)
      : (Number.isFinite(atOver) ? Math.max(0, oversToBallCount(atOver) - 1) : null);
    if (ballIndex == null || ballIndex < 0) continue;

    const timeline = innings === 1 ? sim.first?.timeline : sim.second?.timeline;
    if (!Array.isArray(timeline) || !timeline.length) continue;
    const naturalAtAnchor = Number.isFinite(Number(anchor.naturalRunsAtAnchor))
      ? Number(anchor.naturalRunsAtAnchor)
      : Number(timeline[Math.min(ballIndex, timeline.length - 1)]?.runs || 0);
    const naturalWktsAtAnchor = Number.isFinite(Number(anchor.naturalWicketsAtAnchor))
      ? Number(anchor.naturalWicketsAtAnchor)
      : Number(timeline[Math.min(ballIndex, timeline.length - 1)]?.wickets || 0);
    const anchorRuns = Number(anchor.runs);
    if (!Number.isFinite(anchorRuns)) continue;
    const hasWicketAnchor = Number.isFinite(Number(anchor.wickets));
    const anchorWickets = hasWicketAnchor ? Number(anchor.wickets) : null;
    const applyNow = !!anchor.applyNow || anchor.source === 'incident';

    if (innings === 1) {
      const firstNaturalNow = out.firstRuns != null ? Number(out.firstRuns) : Number(out.runs);
      const firstWktsNow = out.firstWickets != null ? Number(out.firstWickets) : Number(out.wickets);
      const currentBalls = oversToBallCount(out.firstOvers || out.overs);
      const pastAnchor = applyNow || currentBalls >= (ballIndex + 1);
      const inFirst = out.inningsId === 1 || out.phase === 'first' || out.phase === 'first-complete';
      if (pastAnchor || !inFirst || out.phase === 'break' || out.phase === 'chase' || out.phase === 'chase-complete') {
        const adjusted = rebaseRuns(
          Number.isFinite(firstNaturalNow) ? firstNaturalNow : naturalAtAnchor,
          naturalAtAnchor,
          anchorRuns,
        );
        out.firstRuns = adjusted;
        out.runs = adjusted;
        let wkts = firstWktsNow;
        if (hasWicketAnchor) {
          wkts = rebaseWickets(
            Number.isFinite(firstWktsNow) ? firstWktsNow : naturalWktsAtAnchor,
            naturalWktsAtAnchor,
            anchorWickets,
          );
          out.firstWickets = wkts;
          out.wickets = wkts;
        }
        touched = { innings: 1, runs: adjusted, overs: out.firstOvers || out.overs, wickets: wkts };
        if (Array.isArray(out.scorecardInnings) && out.scorecardInnings[0]) {
          out.scorecardInnings = out.scorecardInnings.map((inn, idx) => (
            idx === 0 ? { ...inn, runs: adjusted, wickets: wkts, displayScore: `${adjusted}/${wkts ?? 0}` } : inn
          ));
        }
      }
    } else if (innings === 2) {
      const chaseNatural = out.chaseRuns != null ? Number(out.chaseRuns) : Number(out.score2);
      const chaseWktsNow = out.chaseWickets != null ? Number(out.chaseWickets) : Number(out.wickets2);
      const currentBalls = oversToBallCount(out.chaseOvers || out.overs2);
      const pastAnchor = applyNow || currentBalls >= (ballIndex + 1);
      if (pastAnchor && (out.inningsId === 2 || out.phase === 'chase' || out.phase === 'chase-complete')) {
        const adjusted = rebaseRuns(
          Number.isFinite(chaseNatural) ? chaseNatural : naturalAtAnchor,
          naturalAtAnchor,
          anchorRuns,
        );
        out.chaseRuns = adjusted;
        out.score2 = adjusted;
        let wkts = chaseWktsNow;
        if (hasWicketAnchor) {
          wkts = rebaseWickets(
            Number.isFinite(chaseWktsNow) ? chaseWktsNow : naturalWktsAtAnchor,
            naturalWktsAtAnchor,
            anchorWickets,
          );
          out.chaseWickets = wkts;
          out.wickets2 = wkts;
        }
        touched = { innings: 2, runs: adjusted, overs: out.chaseOvers || out.overs2, wickets: wkts };
        if (Array.isArray(out.scorecardInnings) && out.scorecardInnings[1]) {
          out.scorecardInnings = out.scorecardInnings.map((inn, idx) => (
            idx === 1 ? { ...inn, runs: adjusted, wickets: wkts, displayScore: `${adjusted}/${wkts ?? 0}` } : inn
          ));
        }
      }
    }
  }

  if (touched?.innings === 1 && anchors.some((a) => a.marketId || a.source === 'declare')) {
    out.commentary = `${out.firstTeamName || 'Team'} ${touched.runs}/${touched.wickets ?? 0} (${touched.overs || '0.0'} ov) · declare locked`;
  } else if (touched?.innings === 2 && anchors.some((a) => a.marketId || a.source === 'declare')) {
    out.commentary = `${out.chaseTeamName || 'Team'} ${touched.runs}/${touched.wickets ?? 0} (${touched.overs || '0.0'} ov) · declare locked`;
  }

  return syncSrlWicketsToFallOfWicket(out);
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

/**
 * Resolve which fixture side bats first from operator toss (preferred) or seed toss.
 * Does not swap fixture team1/team2 identities — only batting order for live board labels.
 */
export function resolveSrlBatFirstTeams(team1, team2, seedToss, opToss) {
  const fromOp = opToss?.tossWinnerKey || opToss?.winner
    ? {
      tossWinnerKey: opToss.tossWinnerKey || opToss.winner,
      decision: String(opToss.decision || 'BAT').toUpperCase(),
    }
    : null;
  const fromSeed = seedToss?.tossWinnerKey
    ? {
      tossWinnerKey: seedToss.tossWinnerKey,
      decision: String(seedToss.decision || 'bat').toUpperCase() === 'BOWL' ? 'BOWL' : 'BAT',
    }
    : null;
  const effective = fromOp || fromSeed;
  if (!effective?.tossWinnerKey) {
    return {
      batFirst: team1,
      chase: team2,
      effectiveToss: seedToss || null,
    };
  }

  const key = String(effective.tossWinnerKey);
  const winnerIsTeam1 = key === team1.key
    || key.toLowerCase() === String(team1.name || '').toLowerCase()
    || key.toLowerCase() === String(team1.shortName || '').toLowerCase();
  const winnerTeam = winnerIsTeam1 ? team1 : team2;
  const otherTeam = winnerIsTeam1 ? team2 : team1;
  const decidesBat = effective.decision === 'BAT' || effective.decision === 'BATTING';
  const batFirst = decidesBat ? winnerTeam : otherTeam;
  const chase = batFirst.key === team1.key ? team2 : team1;

  return {
    batFirst,
    chase,
    effectiveToss: {
      winner: winnerTeam.name,
      wonToss: winnerTeam.name,
      winnerName: winnerTeam.name,
      decision: decidesBat ? 'bat' : 'bowl',
      tossWinnerKey: winnerTeam.key,
      locked: !!opToss?.locked,
      declaredAt: opToss?.declaredAt || null,
      userPublished: !!opToss?.userPublished,
      publicRevealAt: opToss?.publicRevealAt || null,
    },
  };
}

function forceCompletedBoard(sim, template, fixtureTeam1, fixtureTeam2, winnerKey, live = null, batOrder = null) {
  const batFirst = batOrder?.batFirst || fixtureTeam1;
  const chase = batOrder?.chase || fixtureTeam2;
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

  const winnerTeam = team1Wins ? fixtureTeam1.name : fixtureTeam2.name;
  const margin = team1Wins
    ? `won by ${firstRuns - chaseRuns} runs`
    : `won by ${10 - chaseWickets} wickets`;

  return {
    commentary: `${winnerTeam} ${margin}`,
    firstTeamName: batFirst.name,
    chaseTeamName: chase.name,
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
  // Toss resolves at start: keep team1 batting first — winner bats if team1, bowls if team2.
  const toss = (teamsLocked && now >= startTime)
    ? (() => {
      const team1Won = (entry.seed % 2) === 0;
      const winner = team1Won ? team1 : team2;
      return {
        winner: winner.name,
        wonToss: winner.name,
        decision: team1Won ? 'bat' : 'bowl',
        tossWinnerKey: winner.key,
      };
    })()
    : null;
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
    toss,
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
  const seedToss = toss;
  const { batFirst, chase, effectiveToss } = resolveSrlBatFirstTeams(team1, team2, seedToss, op.toss);
  const boardToss = effectiveToss || seedToss;
  const isRain = !!op.rainDelay;
  base.toss = boardToss;
  base.operator = {
    started: !!op.startedAt,
    paused: (!!op.pausedAt || isRain) && !op.declaredWinnerKey,
    forcedWinnerKey: op.forcedWinnerKey,
    declaredWinnerKey: op.declaredWinnerKey,
    bettingClosed: !!op.bettingClosed || isRain,
    scoreAnchors: Array.isArray(op.scoreAnchors) ? op.scoreAnchors : [],
    rainDelay: isRain,
    revisedOvers: op.revisedOvers || null,
    dlsTarget: op.dlsTarget || null,
    customCommentary: op.customCommentary || null,
    marginDefense: op.marginDefense || null,
    incidentQueueLength: (op.incidentQueue || []).length,
    toss: op.toss || boardToss || null,
  };
  base.bettingClosed = !!op.bettingClosed || isRain;
  if (op.revisedOvers) {
    base.oversPerInnings = op.revisedOvers;
  }

  // Margin Defense & Spread Bias adjustment on odds
  if (base.odds && op.marginDefense) {
    const bump = Number(op.marginDefense.marginBump) || 0;
    const bias = Number(op.marginDefense.spreadBias) || 0;
    if (bump > 0 || bias !== 0) {
      const factor = 1 + bump;
      base.odds = {
        team1: Math.max(1.05, Number(((base.odds.team1 / factor) + bias).toFixed(2))),
        team2: Math.max(1.05, Number(((base.odds.team2 / factor) - bias).toFixed(2))),
      };
    }
  }

  const tossMeta = boardToss
    ? { toss: boardToss, tossWinner: boardToss.wonToss || boardToss.winner, tossDecision: boardToss.decision }
    : {};

  const preMatch = {
    ...base,
    time: base.scheduleLabel,
    isLive: false,
    matchState: 'pre',
    liveDetails: {
      commentary: op.customCommentary?.text
        ? String(op.customCommentary.text)
        : (teamsLocked
          ? `Upcoming · ${template.stageLabel || 'League'} · ${base.oversPerInnings || MAX_OVERS} overs per side`
          : `${template.stageLabel} · teams to be decided from the points table`),
      ...tossMeta,
    },
  };

  const clockElapsed = Math.max(0, now - startTime);
  const elapsed = op.startedAt || op.pausedAt
    ? getSrlOperatorElapsedMs(op, now)
    : clockElapsed;
  const winnerKey = op.declaredWinnerKey || op.forcedWinnerKey || naturalWinner;
  const batOrder = { batFirst, chase };

  if (!teamsLocked || (!op.startedAt && !op.declaredWinnerKey && now < startTime)) {
    return preMatch;
  }
  const completed = (liveSnapshot = null) => {
    const board = forceCompletedBoard(sim, template, team1, team2, winnerKey, liveSnapshot, batOrder);
    return {
      ...base,
      time: 'Completed',
      isLive: false,
      isCompleted: true,
      matchState: 'post',
      bettingClosed: true,
      liveDetails: {
        ...board,
        ...tossMeta,
      },
      scorecardInnings: [
        buildScorecardInnings(batFirst.name, { ...sim.first, runs: board.firstRuns, wickets: board.firstWickets, overs: board.firstOvers }, 1),
        buildScorecardInnings(chase.name, { ...sim.second, runs: board.chaseRuns, wickets: board.chaseWickets, overs: board.chaseOvers }, 2),
      ],
    };
  };

  if (op.declaredWinnerKey) {
    const snapElapsed = Math.min(elapsed, sim.totalDuration - 1);
    const liveSnap = snapElapsed > 0
      ? applySrlScoreAnchors(stateAtElapsed(sim, snapElapsed, batFirst, chase), sim, op.scoreAnchors)
      : null;
    return completed(liveSnap);
  }

  if (elapsed >= sim.totalDuration) {
    return completed();
  }

  const live = applySrlScoreAnchors(stateAtElapsed(sim, elapsed, batFirst, chase), sim, op.scoreAnchors);
  if (op.dlsTarget) {
    live.target = op.dlsTarget;
  }
  if (op.customCommentary?.text) {
    const tag = op.customCommentary.eventTag || 'LIVE';
    live.commentary = `[${tag}] ${op.customCommentary.text} · ${live.commentary}`;
  }
  const displayTime = isRain ? 'Rain Delay' : (op.pausedAt ? 'Paused' : 'Live');
  return {
    ...base,
    time: displayTime,
    isLive: !isRain,
    rainDelay: isRain,
    matchState: 'in',
    extraMarkets: 30,
    liveDetails: {
      ...live,
      rainDelay: isRain,
      commentary: live.commentary,
      ...tossMeta,
    },
    scorecardInnings: live.scorecardInnings,
    overHistory: live.overHistory,
  };
}

/**
 * Matches visible on the public OddsYra SRL board:
 * live + upcoming (bettable) plus recent completed results for user history.
 */
export function getIplSrlMatches(now = Date.now()) {
  now = getSrlSimNow(now);
  let anchor = findAnchorGlobalSlot(now);
  // Weekend double-header: afternoon may still be live after evening has started.
  if (anchor > 0) {
    const prev = buildMatchFromSchedule(anchor - 1, now);
    if (prev.matchState === 'in') anchor -= 1;
  }
  const cycleLen = SCHEDULE.entries.length;
  const bettable = [];

  for (let offset = 0; offset < cycleLen && bettable.length < VISIBLE_MATCHES; offset += 1) {
    const match = buildMatchFromSchedule(anchor + offset, now);
    if (match.matchState === 'post') continue;
    if (match.team1?.key === 'tbd' || match.teamsLocked === false) continue;
    bettable.push(match);
  }

  if (bettable.length === 0) {
    for (let offset = 0; offset < cycleLen; offset += 1) {
      const match = buildMatchFromSchedule(anchor + offset, now);
      if (match.team1?.key === 'tbd') continue;
      bettable.push(match);
      break;
    }
  }

  // Walk backwards from the current window for finished fixtures users can still open.
  // Stay inside the current season cycle so pre-launch boards never pull prior-cycle results.
  const { cycleNumber } = resolveSchedulePosition(now);
  const cycleStartSlot = cycleNumber * cycleLen;
  const completed = [];
  const seen = new Set(bettable.map((m) => m.id));
  for (let back = 1; back <= cycleLen && completed.length < RECENT_COMPLETED_MATCHES; back += 1) {
    const slot = anchor - back;
    if (slot < cycleStartSlot) break;
    const match = buildMatchFromSchedule(slot, now);
    if (!match?.id || seen.has(match.id)) continue;
    if (match.team1?.key === 'tbd' || match.teamsLocked === false) continue;
    if (match.matchState !== 'post') continue;
    seen.add(match.id);
    completed.push(match);
  }

  const sortedBettable = bettable.sort((a, b) => {
    const liveA = a.matchState === 'in' ? 0 : 1;
    const liveB = b.matchState === 'in' ? 0 : 1;
    if (liveA !== liveB) return liveA - liveB;
    return (a.startTime || 0) - (b.startTime || 0);
  });

  // Most recent results first after the bettable window.
  completed.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));

  const enriched = enrichIplSrlMatchList([...sortedBettable, ...completed]);
  return enriched.map((m) => redactSrlTossForPublic(m, now));
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

export function srlTossPublicRevealAt(startTime) {
  const start = Number(startTime);
  if (!Number.isFinite(start) || start <= 0) return null;
  return start - SRL_TOSS_PUBLIC_LEAD_MS;
}

/** True when users may see the toss (T-25 through match). */
export function isSrlTossVisibleToUsers(matchOrStartTime, now = Date.now()) {
  const start = typeof matchOrStartTime === 'object'
    ? Number(matchOrStartTime?.startTime)
    : Number(matchOrStartTime);
  if (!Number.isFinite(start) || start <= 0) return false;
  return getSrlSimNow(now) >= start - SRL_TOSS_PUBLIC_LEAD_MS;
}

/**
 * Strip toss result from a public match payload until T-25.
 * Admin desk uses unredacted builds (getIplSrlDeskMatches / forPublic:false).
 */
export function redactSrlTossForPublic(match, now = Date.now()) {
  if (!match || !isIplSrlMatch(match)) return match;
  if (isSrlTossVisibleToUsers(match, now)) return match;

  const next = { ...match, toss: null };
  if (match.liveDetails) {
    const ld = { ...match.liveDetails };
    delete ld.toss;
    delete ld.tossWinner;
    delete ld.tossDecision;
    const commentary = String(ld.commentary || '');
    if (/toss|elected to/i.test(commentary)) {
      ld.commentary = match.scheduleLabel
        ? `Upcoming · ${match.scheduleLabel}`
        : 'Upcoming';
    }
    next.liveDetails = ld;
  }
  if (match.operator) {
    next.operator = { ...match.operator, toss: null };
  }
  return next;
}

/**
 * Build a specific SRL match by globalSlot, regardless of visibility window.
 * @param {{ forPublic?: boolean }} [opts]
 *   forPublic:true — hide toss until T-25 (Sports / live APIs).
 *   Default false — full desk/sim view (admin, settlement).
 */
export function getIplSrlMatchById(matchId, now = Date.now(), opts = {}) {
  const forPublic = opts.forPublic === true;
  const custom = getCustomSrlMatch(matchId);
  const built = custom || (() => {
    const globalSlot = extractSrlGlobalSlot(matchId);
    if (globalSlot === null) return null;
    return buildMatchFromSchedule(globalSlot, getSrlSimNow(now));
  })();
  if (!built) return null;
  return forPublic ? redactSrlTossForPublic(built, now) : built;
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

/** Admin desk: full current cycle (70 league + 4 playoffs) + custom exhibition matches. */
export function getIplSrlDeskMatches(now = Date.now()) {
  const season = getIplSrlSeasonMatches(now);
  const custom = listCustomSrlMatches();
  return custom.length ? [...custom, ...season] : season;
}
