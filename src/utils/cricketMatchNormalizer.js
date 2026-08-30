/**
 * ODDSYRA — Authoritative Cricket Match Normalizer & State Engine.
 * Single Source of Truth for normalizing, mapping, and validating cricket match states.
 * Guarantees:
 *  1. One innings maps to exactly ONE batting team.
 *  2. No duplicate/mirrored scores between home and away teams.
 *  3. Full Test match multi-innings support (up to 4 innings).
 *  4. Test overs never display fake match limits (e.g. 50.0 ov, NOT 50.0/50 ov).
 *  5. Stale responses and partial/null payloads never overwrite valid data.
 *  6. Format classification (TEST, ODI, T20, T10, SRL, UNKNOWN).
 */

import { formatTeamShortName } from './teamShortName.js';
import { normalizeCricbuzzOvers, oversToBalls } from './oversUtils.js';

export const CRICKET_FORMATS = Object.freeze({
  TEST: 'TEST',
  ODI: 'ODI',
  T20: 'T20',
  T10: 'T10',
  THE_HUNDRED: 'THE_HUNDRED',
  SRL: 'SRL',
  UNKNOWN: 'UNKNOWN',
});

/**
 * Detect canonical cricket format from match metadata, league, and series name.
 */
export function detectCanonicalFormat(match = {}) {
  const ld = match.liveDetails || {};
  const rawFormat = String(
    match.matchFormat
    || match.format
    || ld.matchFormat
    || match.matchType
    || match.league
    || match.seriesName
    || ''
  ).toLowerCase();

  const isSRL = /\bsrl\b|simulated reality/i.test(
    `${match.id || ''} ${match.league || ''} ${match.seriesName || ''} ${match.team1?.name || ''} ${match.team2?.name || ''}`
  );

  if (/\btest\b|first[- ]class|ranji|county championship|sheffield shield/i.test(rawFormat)) {
    return isSRL ? CRICKET_FORMATS.SRL : CRICKET_FORMATS.TEST;
  }
  if (/hundred|100-ball/i.test(rawFormat)) {
    return CRICKET_FORMATS.THE_HUNDRED;
  }
  if (/\bt10\b|ten10|t-10/i.test(rawFormat)) {
    return CRICKET_FORMATS.T10;
  }
  if (/\bt20\b|twenty20|t-20|ipl|bbl|psl|cpl|lpl|bpl|sa20|super smash/i.test(rawFormat)) {
    return isSRL ? CRICKET_FORMATS.SRL : CRICKET_FORMATS.T20;
  }
  if (/\bodi\b|one[- ]day|list a|one day international/i.test(rawFormat)) {
    return CRICKET_FORMATS.ODI;
  }
  if (isSRL) {
    return CRICKET_FORMATS.SRL;
  }

  return CRICKET_FORMATS.UNKNOWN;
}

/**
 * Returns max overs for a format, or null for unlimited (Test).
 */
export function getFormatMaxOvers(format) {
  switch (format) {
    case CRICKET_FORMATS.TEST:
      return null;
    case CRICKET_FORMATS.ODI:
      return 50;
    case CRICKET_FORMATS.T20:
    case CRICKET_FORMATS.SRL:
      return 20;
    case CRICKET_FORMATS.T10:
      return 10;
    case CRICKET_FORMATS.THE_HUNDRED:
      return 20; // 100 balls = 20 five-ball overs
    default:
      return null;
  }
}

/**
 * Normalize team token for exact/fuzzy comparison.
 */
export function normalizeToken(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/\(women\)|\bwomen\b|\bw\b$/gi, 'w')
    .replace(/\(men\)|\bmen\b/gi, 'm')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Robust team name match against tokens, aliases, and short codes.
 */
export function matchesTeamIdentifier(teamName, candidateToken, candidateShort = '') {
  if (!teamName || (!candidateToken && !candidateShort)) return false;
  const tn = normalizeToken(teamName);
  const cand = normalizeToken(candidateToken);
  const candS = normalizeToken(candidateShort);

  if (!tn) return false;
  if (cand && (tn === cand || tn.includes(cand) || cand.includes(tn))) return true;
  if (candS && (tn === candS || tn.includes(candS) || candS.includes(tn))) return true;

  // Check 3-4 letter prefix/abbreviation
  const tnPrefix = tn.slice(0, 4);
  const candPrefix = cand.slice(0, 4);
  if (tnPrefix.length >= 3 && candPrefix.length >= 3 && (tnPrefix === candPrefix || tn.startsWith(candPrefix) || cand.startsWith(tnPrefix))) {
    return true;
  }

  return false;
}

/**
 * Structured debug logger for score assignments.
 */
export function logScoreMapping({
  matchId,
  inningsId,
  battingTeamId,
  battingTeamName,
  runs,
  wickets,
  overs,
  mappedTo,
  sourceEndpoint = 'normalizer',
  requestId = 'req-auto',
}) {
  if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_SCORE_MAPPING === 'true') {
    console.log(
      `[SCORE_MAPPING] match=${matchId} innings=${inningsId} battingTeam=${battingTeamName || battingTeamId} runs=${runs} wickets=${wickets} overs=${overs} mappedTo=${mappedTo} source=${sourceEndpoint} reqId=${requestId} ts=${new Date().toISOString()}`
    );
  }
}

/**
 * Extract clean integer runs, wickets, and overs.
 */
function sanitizeScoreFields(raw = {}) {
  const runs = Number.isFinite(Number(raw.runs ?? raw.score)) ? Math.max(0, Math.floor(Number(raw.runs ?? raw.score))) : 0;
  const wickets = Number.isFinite(Number(raw.wickets ?? raw.wkts)) ? Math.max(0, Math.min(10, Math.floor(Number(raw.wickets ?? raw.wkts)))) : 0;
  const overs = normalizeCricbuzzOvers(raw.overs ?? raw.over ?? '0.0');
  const declared = Boolean(raw.declared || raw.isDeclared || raw.isDeclaredInnings);
  return { runs, wickets, overs, declared };
}

/**
 * Authoritative match normalizer.
 * Ingests any raw provider payload, applies request sequencing, validates data,
 * and produces a single deterministic canonical MatchState.
 */
export function normalizeMatch(raw = {}, previous = {}, options = {}) {
  const requestId = options.requestId || `norm-${Date.now()}`;
  const matchId = String(raw.id || raw.matchId || previous.matchId || `match_${Date.now()}`);
  const format = detectCanonicalFormat(raw);
  const isTest = format === CRICKET_FORMATS.TEST;

  // Stale request protection
  const incomingTime = Number(raw.providerUpdatedAt || raw.fetchedAt || Date.now());
  const prevTime = Number(previous.lastUpdated || previous.fetchedAt || 0);
  if (prevTime > 0 && incomingTime < prevTime && previous.matchId === matchId) {
    // Stale request discarded
    return previous;
  }

  const rawLd = raw.liveDetails || raw.live || raw.matchScore || {};
  const prevLd = previous.liveDetails || previous.rawLiveDetails || {};

  // Team extraction
  const t1Name = raw.team1?.name || raw.matchHeader?.team1?.name || previous.homeTeam?.name || previous.team1?.name || 'Home Team';
  const t2Name = raw.team2?.name || raw.matchHeader?.team2?.name || previous.awayTeam?.name || previous.team2?.name || 'Away Team';
  const t1Short = formatTeamShortName(t1Name, raw.team1?.shortName || previous.homeTeam?.shortName || previous.team1?.shortName);
  const t2Short = formatTeamShortName(t2Name, raw.team2?.shortName || previous.awayTeam?.shortName || previous.team2?.shortName);

  const homeTeam = {
    id: String(raw.team1?.id || raw.team1?.teamId || 'tm_1'),
    name: t1Name,
    shortName: t1Short,
    color: raw.team1?.color || previous.homeTeam?.color || null,
  };

  const awayTeam = {
    id: String(raw.team2?.id || raw.team2?.teamId || 'tm_2'),
    name: t2Name,
    shortName: t2Short,
    color: raw.team2?.color || previous.awayTeam?.color || null,
  };

  // Build Unified Innings List (Guaranteed 1 Innings -> 1 Batting Team)
  let rawInnings = [];

  if (Array.isArray(rawLd.testInnings) && rawLd.testInnings.length > 0) {
    rawInnings = rawLd.testInnings.map((inn, idx) => ({
      inningsId: inn.inningsId ?? idx + 1,
      batTeam: inn.batTeam || inn.teamName || '',
      ...sanitizeScoreFields(inn),
    }));
  } else if (Array.isArray(raw.scorecardInnings) && raw.scorecardInnings.length > 0) {
    rawInnings = raw.scorecardInnings.map((inn, idx) => ({
      inningsId: inn.inningsId ?? idx + 1,
      batTeam: inn.batTeamName || inn.teamName || '',
      ...sanitizeScoreFields(inn),
    }));
  } else {
    // Check first & chase innings from liveDetails
    const hasExplicitChase = (Number(rawLd.inningsId) >= 2)
      || (Number(rawLd.chaseRuns) > 0)
      || (rawLd.chaseOvers && rawLd.chaseOvers !== '0.0' && rawLd.chaseOvers !== '0');

    if (hasExplicitChase) {
      const firstTeam = rawLd.firstTeamName || (matchesTeamIdentifier(t2Name, rawLd.chaseTeamName, t2Short) ? t1Name : t2Name);
      const chaseTeam = rawLd.chaseTeamName || (firstTeam === t1Name ? t2Name : t1Name);

      const firstScores = sanitizeScoreFields({
        runs: rawLd.firstRuns ?? rawLd.runs ?? 0,
        wickets: rawLd.firstWickets ?? rawLd.wickets ?? 0,
        overs: rawLd.firstOvers ?? rawLd.overs ?? '50.0',
        declared: rawLd.declared1 || rawLd.declared,
      });

      const chaseScores = sanitizeScoreFields({
        runs: rawLd.chaseRuns ?? rawLd.score2 ?? 0,
        wickets: rawLd.chaseWickets ?? rawLd.wickets2 ?? 0,
        overs: rawLd.chaseOvers ?? rawLd.overs2 ?? '0.0',
        declared: rawLd.declared2,
      });

      rawInnings.push({ inningsId: 1, batTeam: firstTeam, ...firstScores });
      rawInnings.push({ inningsId: 2, batTeam: chaseTeam, ...chaseScores });
    } else {
      // 1st Innings only
      let batTeam = rawLd.firstTeamName || '';
      if (!batTeam) {
        const t1r = Number(raw.team1?.runs ?? rawLd.score1 ?? 0);
        const t2r = Number(raw.team2?.runs ?? rawLd.score2 ?? 0);
        if (t2r > 0 && t1r === 0) batTeam = t2Name;
        else batTeam = t1Name;
      }
      const singleScores = sanitizeScoreFields({
        runs: rawLd.runs ?? raw.runs ?? rawLd.score1 ?? raw.score1 ?? 0,
        wickets: rawLd.wickets ?? raw.wickets ?? rawLd.wickets1 ?? raw.wickets1 ?? 0,
        overs: rawLd.overs ?? raw.overs ?? rawLd.firstOvers ?? '0.0',
        declared: rawLd.declared || rawLd.declared1,
      });
      rawInnings.push({ inningsId: 1, batTeam, ...singleScores });
    }
  }

  // Sort and assign each innings strictly to Home or Away
  const homeInnings = [];
  const awayInnings = [];
  const normalizedInnings = [];

  for (const inn of rawInnings) {
    const isHome = matchesTeamIdentifier(t1Name, inn.batTeam, t1Short);
    const isAway = matchesTeamIdentifier(t2Name, inn.batTeam, t2Short);

    let mappedTo = 'UNMAPPED';
    if (isHome && !isAway) {
      mappedTo = 'HOME';
      homeInnings.push(inn);
    } else if (isAway && !isHome) {
      mappedTo = 'AWAY';
      awayInnings.push(inn);
    } else if (inn.inningsId % 2 === 1) {
      // Default odd innings to team 1 if unmapped, even to team 2
      mappedTo = 'HOME';
      homeInnings.push({ ...inn, batTeam: t1Name });
    } else {
      mappedTo = 'AWAY';
      awayInnings.push({ ...inn, batTeam: t2Name });
    }

    logScoreMapping({
      matchId,
      inningsId: inn.inningsId,
      battingTeamId: mappedTo === 'HOME' ? homeTeam.id : awayTeam.id,
      battingTeamName: inn.batTeam || (mappedTo === 'HOME' ? t1Name : t2Name),
      runs: inn.runs,
      wickets: inn.wickets,
      overs: inn.overs,
      mappedTo,
      requestId,
    });

    normalizedInnings.push({
      inningsId: inn.inningsId,
      batTeam: mappedTo === 'HOME' ? t1Name : t2Name,
      batTeamId: mappedTo === 'HOME' ? homeTeam.id : awayTeam.id,
      batTeamShort: mappedTo === 'HOME' ? t1Short : t2Short,
      runs: inn.runs,
      wickets: inn.wickets,
      overs: inn.overs,
      declared: inn.declared,
    });
  }

  // Calculate formatted team display score strings
  const formatInningsScoreString = (inningsList) => {
    if (!inningsList || inningsList.length === 0) return '0/0';
    if (inningsList.length === 1 || !isTest) {
      const inn = inningsList[inningsList.length - 1];
      return `${inn.runs}/${inn.wickets}${inn.declared ? 'd' : ''}`;
    }
    return inningsList.map((i) => `${i.runs}/${i.wickets}${i.declared ? 'd' : ''}`).join(' & ');
  };

  const homeScoreStr = formatInningsScoreString(homeInnings);
  const awayScoreStr = formatInningsScoreString(awayInnings);

  const homeTotalRuns = homeInnings.reduce((sum, i) => sum + i.runs, 0);
  const awayTotalRuns = awayInnings.reduce((sum, i) => sum + i.runs, 0);

  const homeLatest = homeInnings[homeInnings.length - 1] || { runs: 0, wickets: 0, overs: '0.0' };
  const awayLatest = awayInnings[awayInnings.length - 1] || { runs: 0, wickets: 0, overs: '0.0' };

  // Current active innings
  const activeInnings = normalizedInnings[normalizedInnings.length - 1] || {
    inningsId: 1,
    batTeam: t1Name,
    batTeamId: homeTeam.id,
    batTeamShort: t1Short,
    runs: 0,
    wickets: 0,
    overs: '0.0',
  };

  // Preserve valid player data across partial responses
  const prevBatter1 = previous.currentBatters?.striker;
  const prevBatter2 = previous.currentBatters?.nonStriker;
  const prevBowler = previous.currentBowler;

  const candidateB1 = rawLd.batter1 || raw.batter1;
  const candidateB2 = rawLd.batter2 || raw.batter2;
  const candidateBowler = rawLd.bowler || raw.bowler;

  const resolvePlayer = (candidate, fallback) => {
    if (candidate && candidate.name && typeof candidate.name === 'string' && candidate.name.trim()) {
      return {
        name: candidate.name.trim(),
        runs: Number(candidate.runs ?? fallback?.runs ?? 0),
        balls: Number(candidate.balls ?? fallback?.balls ?? 0),
        fours: Number(candidate.fours ?? fallback?.fours ?? 0),
        sixes: Number(candidate.sixes ?? fallback?.sixes ?? 0),
        strikeRate: String(candidate.strikeRate ?? fallback?.strikeRate ?? '0.00'),
      };
    }
    if (fallback && fallback.name) {
      return fallback;
    }
    return { name: '', runs: 0, balls: 0, fours: 0, sixes: 0, strikeRate: '0.00' };
  };

  const resolveBowler = (candidate, fallback) => {
    if (candidate && candidate.name && typeof candidate.name === 'string' && candidate.name.trim()) {
      return {
        name: candidate.name.trim(),
        overs: normalizeCricbuzzOvers(candidate.overs ?? fallback?.overs ?? '0.0'),
        maidens: Number(candidate.maidens ?? fallback?.maidens ?? 0),
        runs: Number(candidate.runs ?? fallback?.runs ?? 0),
        wickets: Number(candidate.wickets ?? fallback?.wickets ?? 0),
        economy: String(candidate.economy ?? fallback?.economy ?? '0.00'),
      };
    }
    if (fallback && fallback.name) {
      return fallback;
    }
    return { name: '', overs: '0.0', maidens: 0, runs: 0, wickets: 0, economy: '0.00' };
  };

  const currentBatters = {
    striker: resolvePlayer(candidateB1, prevBatter1),
    nonStriker: resolvePlayer(candidateB2, prevBatter2),
  };

  const currentBowler = resolveBowler(candidateBowler, prevBowler);

  const isLive = raw.isLive ?? ((raw.matchState === 'in' || raw.status === 'LIVE') ? true : (previous.isLive ?? true));
  const matchState = raw.matchState || (isLive ? 'in' : 'pre');

  const maxOvers = getFormatMaxOvers(format);

  return {
    matchId,
    providerMatchId: raw.cricbuzzMatchId || raw.providerMatchId || null,
    format,
    isTest,
    maxOvers,
    status: isLive ? 'LIVE' : (raw.matchState === 'post' || raw.status === 'FINISHED' ? 'COMPLETED' : 'SCHEDULED'),
    matchState,
    isLive,
    league: raw.league || raw.seriesName || previous.league || 'Cricket',
    seriesName: raw.seriesName || raw.league || previous.seriesName || 'Cricket',
    time: raw.time || previous.time || (isLive ? 'LIVE' : 'Scheduled'),

    homeTeam: {
      ...homeTeam,
      score: homeScoreStr,
      runs: homeTotalRuns,
      wickets: homeLatest.wickets,
      overs: homeLatest.overs,
      innings: homeInnings,
    },

    awayTeam: {
      ...awayTeam,
      score: awayScoreStr,
      runs: awayTotalRuns,
      wickets: awayLatest.wickets,
      overs: awayLatest.overs,
      innings: awayInnings,
    },

    teams: {
      team1: {
        name: t1Name,
        shortName: t1Short,
        score: homeScoreStr,
        runs: homeTotalRuns,
        wickets: homeLatest.wickets,
        overs: homeLatest.overs,
        innings: homeInnings,
      },
      team2: {
        name: t2Name,
        shortName: t2Short,
        score: awayScoreStr,
        runs: awayTotalRuns,
        wickets: awayLatest.wickets,
        overs: awayLatest.overs,
        innings: awayInnings,
      },
    },

    innings: normalizedInnings,
    testInnings: isTest ? normalizedInnings : undefined,

    currentInnings: {
      number: activeInnings.inningsId,
      batTeam: activeInnings.batTeam,
      batTeamId: activeInnings.batTeamId,
      batTeamShort: activeInnings.batTeamShort,
      runs: activeInnings.runs,
      wickets: activeInnings.wickets,
      overs: activeInnings.overs,
      isChase: !isTest ? activeInnings.inningsId >= 2 : activeInnings.inningsId === 4,
    },

    currentBatters,
    currentBowler,

    commentary: rawLd.commentary || raw.commentary || previous.commentary || '',
    recentBalls: rawLd.currentOverBalls || previous.recentBalls || [],
    toss: rawLd.toss || raw.toss || previous.toss || null,

    lastUpdated: incomingTime,
    version: (previous.version || 0) + 1,
    source: raw.source || previous.source || 'aggregator',
    rawLiveDetails: rawLd,
  };
}
