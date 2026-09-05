/**
 * ODDSYRA — Authoritative Cricket Match Normalizer & State Engine.
 * Single Source of Truth for normalizing, mapping, and validating cricket match states.
 *
 * Core Invariants:
 *  1. One innings maps to exactly ONE batting team using stable identifiers.
 *  2. No duplicate/mirrored scores between home and away teams.
 *  3. Compact match cards show only ONE relevant/latest score per team.
 *  4. Detailed match views and scorecards show all innings grouped by batting team.
 *  5. Strict mutual exclusivity: an innings cannot belong to both teams.
 *  6. Test match multi-innings (up to 4 innings) supported with accurate lead/trail tracking.
 *  7. If score data is incomplete, show "—" (dash); NEVER duplicate another team's score.
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
  // Join all fields so provider matchType "T20" cannot hide a T10 series name.
  const rawFormat = [
    match.league,
    match.seriesName,
    match.competition,
    match.matchFormat,
    match.format,
    ld.matchFormat,
    match.matchType,
  ].filter(Boolean).join(' ').toLowerCase();

  const isSRL = /\bsrl\b|simulated reality/i.test(
    `${match.id || ''} ${match.league || ''} ${match.seriesName || ''} ${match.team1?.name || ''} ${match.team2?.name || ''}`
  );

  if (/\btest\b|first[- ]class|ranji|county championship|sheffield shield/i.test(rawFormat)) {
    return isSRL ? CRICKET_FORMATS.SRL : CRICKET_FORMATS.TEST;
  }
  if (/hundred|100-ball/i.test(rawFormat)) {
    return CRICKET_FORMATS.THE_HUNDRED;
  }
  // T10 before T20 — Cricbuzz often buckets T10 under the T20 typeMatches block
  if (/\bt10\b|ten10|t-10|european cricket series|\becs\b|abu dhabi t10|max60|german super league|quantum cricket|\bqcl\b|10[\s-]?overs?/i.test(rawFormat)) {
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
 * Normalize team token for alphanumeric comparisons.
 */
export function normalizeToken(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/\(women\)|\bwomen\b|\bw\b$/gi, 'w')
    .replace(/\(men\)|\bmen\b/gi, 'm')
    .replace(/thunderers/g, 'thunders')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/** When firstTeamName matches neither side, use who actually has the runs. */
export function resolveFirstInningsIsHome(homeTeam, awayTeam, firstTeamName, homeRuns = 0, awayRuns = 0) {
  if (firstTeamName) {
    const home = matchesTeamIdentifier(homeTeam, firstTeamName);
    const away = matchesTeamIdentifier(awayTeam, firstTeamName);
    if (home && !away) return true;
    if (away && !home) return false;
  }
  const t1 = Number(homeRuns) || 0;
  const t2 = Number(awayRuns) || 0;
  if (t2 > 0 && t1 === 0) return false;
  return true;
}

/**
 * Extracts team initials with at least 2 letters (never single letters!).
 */
function extractMultiLetterInitials(name = '') {
  const letters = String(name)
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return letters.length >= 2 ? letters : '';
}

/**
 * Robust team identifier match.
 * Uses stable IDs first, then short codes and multi-character prefixes.
 * NEVER matches on 1-letter initials to prevent cross-team collision (e.g. Sussex vs Somerset).
 */
export function matchesTeamIdentifier(team, candidateName, candidateShort = '', candidateId = null) {
  const teamName = typeof team === 'object' ? (team?.name || '') : String(team || '');
  const teamShort = typeof team === 'object' ? (team?.shortName || '') : '';
  const teamId = typeof team === 'object' ? (team?.id || team?.teamId || null) : null;

  // Priority 1: Direct ID equality
  if (teamId && candidateId && String(teamId) === String(candidateId)) {
    return true;
  }

  const tn = normalizeToken(teamName);
  const ts = normalizeToken(teamShort);
  const cn = normalizeToken(candidateName);
  const cs = normalizeToken(candidateShort);

  if (!tn && !ts) return false;
  if (!cn && !cs) return false;

  // Priority 2: Exact string matches
  if (cn && tn && cn === tn) return true;
  if (cs && ts && cs === ts) return true;
  if (cs && tn && cs === tn) return true;
  if (cn && ts && cn === ts) return true;

  // Priority 3: Multi-letter initials (min 2 chars, e.g. "CSK", "MI", "ENG", "IND")
  const initials = extractMultiLetterInitials(teamName);
  if (initials && initials.length >= 2) {
    if (cn && (cn === initials || initials === cn)) return true;
    if (cs && (cs === initials || initials === cs)) return true;
  }

  // Priority 4: 3+ character prefix match (e.g. "sussex" -> "sus", "somerset" -> "som")
  if (cn && cn.length >= 3 && tn.length >= 3) {
    if (tn.startsWith(cn) || cn.startsWith(tn)) return true;
  }
  if (cs && cs.length >= 3 && tn.length >= 3) {
    if (tn.startsWith(cs)) return true;
  }

  // Priority 5: Substring match only for distinct 4+ character tokens
  if (cn && cn.length >= 4 && (tn.includes(cn) || cn.includes(tn))) {
    return true;
  }

  return false;
}

/**
 * Structured debug logger and validator for score assignments.
 */
export function logScoreMapping({
  matchId,
  homeTeam,
  homeInnings,
  awayTeam,
  awayInnings,
  currentInnings,
  source = 'normalizer',
}) {
  if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_SCORE_MAPPING === 'true') {
    console.log('[SCORE_MAPPING_DEBUG]', JSON.stringify({
      matchId,
      source,
      homeTeam: `${homeTeam.name} (ID: ${homeTeam.id})`,
      homeInnings: homeInnings.map((i) => ({ inningsId: i.inningsId, score: `${i.runs}/${i.wickets}` })),
      awayTeam: `${awayTeam.name} (ID: ${awayTeam.id})`,
      awayInnings: awayInnings.map((i) => ({ inningsId: i.inningsId, score: `${i.runs}/${i.wickets}` })),
      currentInnings: currentInnings ? {
        inningsId: currentInnings.number || currentInnings.inningsId,
        batTeam: currentInnings.batTeam,
        score: `${currentInnings.runs}/${currentInnings.wickets}`,
        overs: currentInnings.overs,
      } : null,
    }));
  }
}

/**
 * Validate that an innings belongs to exactly ONE team.
 */
export function validateInningsPartition(homeInnings, awayInnings) {
  const homeSet = new Set(homeInnings);
  for (const inn of awayInnings) {
    if (homeSet.has(inn)) {
      throw new Error(`[INNINGS_MUTUAL_EXCLUSIVITY_VIOLATION] Innings ${inn.inningsId} mapped to BOTH Home and Away teams!`);
    }
  }
}

/**
 * Extract clean integer runs, wickets, and overs.
 */
function sanitizeScoreFields(raw = {}) {
  const sd = raw.scoreDetails || {};
  const rawRuns = raw.runs ?? raw.score ?? sd.runs;
  const rawWickets = raw.wickets ?? raw.wkts ?? sd.wickets;
  const rawOvers = raw.overs ?? raw.over ?? sd.overs;
  const runs = Number.isFinite(Number(rawRuns)) ? Math.max(0, Math.floor(Number(rawRuns))) : 0;
  const wickets = Number.isFinite(Number(rawWickets)) ? Math.max(0, Math.min(10, Math.floor(Number(rawWickets)))) : 0;
  const overs = normalizeCricbuzzOvers(rawOvers ?? '0.0');
  const declared = Boolean(raw.declared || raw.isDeclared || raw.isDeclaredInnings || sd.isDeclared);
  return { runs, wickets, overs, declared };
}

/**
 * Canonical match score normalization.
 * Consumes any raw provider format and returns a normalized score structure.
 */
export function normalizeMatchScore(raw = {}, previous = {}, options = {}) {
  return normalizeMatch(raw, previous, options);
}

/**
 * Authoritative match normalizer.
 * Ingests any raw provider payload, applies strict innings ownership, and produces
 * a single deterministic canonical MatchState.
 */
export function normalizeMatch(raw = {}, previous = {}, options = {}) {
  const matchId = String(raw.id || raw.matchId || previous.matchId || `match_${Date.now()}`);
  const format = detectCanonicalFormat(raw);
  const isTest = format === CRICKET_FORMATS.TEST;

  // Stale request protection: Only accept if newer than or equal to current valid state
  const incomingTime = Number(raw.providerUpdatedAt || raw.completedAt || raw.fetchedAt || Date.now());
  const prevTime = Number(previous.providerUpdatedAt || previous.lastUpdated || previous.fetchedAt || 0);
  if (prevTime > 0 && incomingTime < prevTime && previous.matchId === matchId) {
    return previous;
  }

  const rawLd = raw.liveDetails || raw.live || raw.matchScore || {};

  // Team extraction with persistent fallbacks
  const t1Id = String(raw.team1?.id || raw.team1?.teamId || raw.matchHeader?.team1?.id || previous.homeTeam?.id || 'tm_1');
  const t2Id = String(raw.team2?.id || raw.team2?.teamId || raw.matchHeader?.team2?.id || previous.awayTeam?.id || 'tm_2');

  const t1Name = raw.team1?.name || raw.matchHeader?.team1?.name || previous.homeTeam?.name || previous.team1?.name || 'Home Team';
  const t2Name = raw.team2?.name || raw.matchHeader?.team2?.name || previous.awayTeam?.name || previous.team2?.name || 'Away Team';
  const t1Short = formatTeamShortName(t1Name, raw.team1?.shortName || previous.homeTeam?.shortName || previous.team1?.shortName);
  const t2Short = formatTeamShortName(t2Name, raw.team2?.shortName || previous.awayTeam?.shortName || previous.team2?.shortName);

  const homeTeam = {
    id: t1Id,
    name: t1Name,
    shortName: t1Short,
    color: raw.team1?.color || previous.homeTeam?.color || null,
  };

  const awayTeam = {
    id: t2Id,
    name: t2Name,
    shortName: t2Short,
    color: raw.team2?.color || previous.awayTeam?.color || null,
  };

  // Build Raw Innings List from incoming provider payload
  let rawInnings = [];

  if (Array.isArray(rawLd.testInnings) && rawLd.testInnings.length > 0) {
    rawInnings = rawLd.testInnings.map((inn, idx) => ({
      inningsId: inn.inningsId ?? inn.inningsNum ?? idx + 1,
      batTeamId: inn.battingTeamId || inn.batTeamId || inn.teamId || inn.team_id || null,
      batTeam: inn.batTeam || inn.teamName || inn.team || '',
      batTeamShort: inn.teamSName || inn.shortName || inn.batTeamShort || '',
      ...sanitizeScoreFields(inn),
    }));
  } else if (Array.isArray(raw.scorecardInnings) && raw.scorecardInnings.length > 0) {
    rawInnings = raw.scorecardInnings.map((inn, idx) => ({
      inningsId: inn.inningsId ?? inn.inningsNum ?? idx + 1,
      batTeamId: inn.battingTeamId || inn.batTeamId || inn.teamId || inn.team_id || null,
      batTeam: inn.batTeamName || inn.teamName || inn.batTeam || '',
      batTeamShort: inn.batTeamShortName || inn.batTeamShort || '',
      ...sanitizeScoreFields(inn),
    }));
  } else if (Array.isArray(raw.innings) && raw.innings.length > 0) {
    rawInnings = raw.innings.map((inn, idx) => ({
      inningsId: inn.inningsId ?? inn.inningsNum ?? idx + 1,
      batTeamId: inn.battingTeamId || inn.batTeamId || inn.teamId || inn.team_id || null,
      batTeam: inn.batTeam || inn.teamName || '',
      batTeamShort: inn.batTeamShort || inn.teamSName || '',
      ...sanitizeScoreFields(inn),
    }));
  }

  // If rawInnings was constructed from partial scorecard/testInnings, ensure active live team scores are preserved
  if (rawInnings.length > 0) {
    const hasHome = rawInnings.some((inn) => matchesTeamIdentifier(homeTeam, inn.batTeam, inn.batTeamShort, inn.batTeamId));
    const hasAway = rawInnings.some((inn) => matchesTeamIdentifier(awayTeam, inn.batTeam, inn.batTeamShort, inn.batTeamId));

    const t1r = Number(raw.team1?.runs ?? rawLd.firstRuns ?? rawLd.score1 ?? (rawLd.firstTeamName && matchesTeamIdentifier(homeTeam, rawLd.firstTeamName) ? rawLd.runs : null) ?? 0);
    const t1w = Number(raw.team1?.wickets ?? rawLd.firstWickets ?? rawLd.wickets1 ?? 0);
    const t1o = normalizeCricbuzzOvers(raw.team1?.overs || rawLd.firstOvers || rawLd.overs || '0.0');

    const t2r = Number(raw.team2?.runs ?? rawLd.chaseRuns ?? rawLd.score2 ?? (rawLd.chaseTeamName && matchesTeamIdentifier(awayTeam, rawLd.chaseTeamName) ? rawLd.runs : null) ?? 0);
    const t2w = Number(raw.team2?.wickets ?? rawLd.chaseWickets ?? rawLd.wickets2 ?? 0);
    const t2o = normalizeCricbuzzOvers(raw.team2?.overs || rawLd.chaseOvers || rawLd.overs2 || '0.0');

    if (!hasHome && (t1r > 0 || (t1o && t1o !== '0.0' && t1o !== '0') || t1w > 0)) {
      rawInnings.push({
        inningsId: rawInnings.length + 1,
        batTeamId: t1Id,
        batTeam: t1Name,
        batTeamShort: t1Short,
        runs: t1r,
        wickets: t1w,
        overs: t1o,
        declared: false,
      });
    }

    if (!hasAway && (t2r > 0 || (t2o && t2o !== '0.0' && t2o !== '0') || t2w > 0)) {
      rawInnings.push({
        inningsId: rawInnings.length + 1,
        batTeamId: t2Id,
        batTeam: t2Name,
        batTeamShort: t2Short,
        runs: t2r,
        wickets: t2w,
        overs: t2o,
        declared: false,
      });
    }
  } else {
    // Legacy / LiveDetails fields extraction
    let firstRuns = rawLd.firstRuns ?? raw.runs ?? rawLd.score1 ?? raw.score1 ?? raw.team1?.runs;
    let firstWickets = rawLd.firstWickets ?? raw.wickets ?? rawLd.wickets1 ?? raw.wickets1 ?? raw.team1?.wickets;
    let firstOvers = rawLd.firstOvers ?? rawLd.overs ?? raw.overs ?? raw.team1?.overs ?? '0.0';

    const inningsId = Number(rawLd.inningsId) || 0;
    const explicitChaseRuns = rawLd.chaseRuns;
    const explicitChaseWickets = rawLd.chaseWickets;
    const explicitChaseOvers = rawLd.chaseOvers;
    const oversMeaningful = (o) => o != null && String(o).trim() !== ''
      && String(o) !== '0' && String(o) !== '0.0';

    // Never promote team-aligned score2/wickets2 into chase unless chase is already indicated.
    // Explicit chaseRuns:0 must NOT fall through to score2 via ?? (that invents 0 + wickets2).
    const chaseIndicated = inningsId >= 2
      || Number(explicitChaseRuns) > 0
      || Number(explicitChaseWickets) > 0
      || oversMeaningful(explicitChaseOvers)
      || !!(rawLd.chaseTeamName && rawLd.firstTeamName && explicitChaseRuns != null);

    let chaseRuns = explicitChaseRuns != null
      ? explicitChaseRuns
      : (chaseIndicated ? (rawLd.score2 ?? raw.score2) : undefined);
    let chaseWickets = explicitChaseWickets != null
      ? explicitChaseWickets
      : (chaseIndicated && (Number(chaseRuns) > 0 || oversMeaningful(explicitChaseOvers))
        ? (rawLd.wickets2 ?? raw.wickets2)
        : undefined);
    let chaseOvers = explicitChaseOvers != null
      ? explicitChaseOvers
      : (chaseIndicated ? rawLd.overs2 : undefined);

    // Sparse ld on a completed chase: restore from team card scores
    const t1Card = Number(raw.team1?.runs) || 0;
    const t2Card = Number(raw.team2?.runs) || 0;

    if (inningsId >= 2 && (!Number(firstRuns) || Number(firstRuns) === 0)) {
      const firstIsAway = rawLd.firstTeamName
        ? matchesTeamIdentifier(awayTeam, rawLd.firstTeamName)
        : false;
      if (firstIsAway && t2Card > 0) {
        firstRuns = t2Card;
        if (!Number(firstWickets)) firstWickets = Number(raw.team2?.wickets || 0);
      } else if (t1Card > 0) {
        firstRuns = t1Card;
        if (!Number(firstWickets)) firstWickets = Number(raw.team1?.wickets || 0);
      }
    }

    if (inningsId >= 2 && t1Card > 0 && t2Card > 0
      && (chaseRuns == null || Number(chaseRuns) === 0)
      && (chaseWickets == null || Number(chaseWickets) === 0)
      && !oversMeaningful(chaseOvers)) {
      const chaseIsHome = rawLd.chaseTeamName
        ? matchesTeamIdentifier(homeTeam, rawLd.chaseTeamName)
        : false;
      firstRuns = chaseIsHome ? t2Card : t1Card;
      firstWickets = chaseIsHome ? Number(raw.team2?.wickets || 0) : Number(raw.team1?.wickets || 0);
      firstOvers = chaseIsHome ? (raw.team2?.overs || '0.0') : (raw.team1?.overs || firstOvers);
      chaseRuns = chaseIsHome ? t1Card : t2Card;
      chaseWickets = chaseIsHome ? Number(raw.team1?.wickets || 0) : Number(raw.team2?.wickets || 0);
      chaseOvers = chaseIsHome ? (raw.team1?.overs || '0.0') : (raw.team2?.overs || '0.0');
    }

    const chaseHasRuns = chaseRuns != null && Number(chaseRuns) > 0;
    const chaseHasWickets = chaseWickets != null && Number(chaseWickets) > 0;
    const chaseHasOvers = oversMeaningful(chaseOvers);
    const isExplicitSecondInnings = inningsId >= 2;
    const firstOversNorm = normalizeCricbuzzOvers(firstOvers ?? '0.0');
    const chaseOversNorm = chaseHasOvers ? normalizeCricbuzzOvers(chaseOvers) : '';
    const chaseOversCopiedFromFirst = chaseHasOvers && chaseOversNorm === firstOversNorm;

    const sameTotalMirrored = Number(firstRuns) > 0
      && Number(firstRuns) === Number(chaseRuns)
      && Number(firstWickets ?? 0) === Number(chaseWickets ?? 0);
    const firstInningsCommentary = /first\s+innings/i.test(String(rawLd.commentary || raw.time || ''))
      && !/second\s+innings|2nd\s+innings/i.test(String(rawLd.commentary || raw.time || ''));
    const isMirroredScore = sameTotalMirrored
      && (firstInningsCommentary || !chaseHasOvers || chaseOversCopiedFromFirst
        || Number(raw.team1?.runs) === Number(raw.team2?.runs));

    // Fake stub: 0 runs + N wickets @ 0.0 while first innings incomplete (e.g. 36/2 → "need 37")
    const fakeChaseStub = (Number(chaseRuns || 0) === 0)
      && chaseHasWickets
      && !chaseHasOvers
      && Number(firstWickets ?? 0) < 10
      && !(rawLd.declared || rawLd.declared1)
      && oversToBalls(firstOversNorm) < 300;

    const hasValidChase = !fakeChaseStub
      && !isMirroredScore
      && (
        (isExplicitSecondInnings && (chaseHasRuns || chaseHasOvers || !!rawLd.chaseTeamName || !!rawLd.batter1?.name
          || (Number(chaseRuns) === 0 && Number(chaseWickets || 0) === 0 && Number(firstRuns) > 0)))
        || chaseHasRuns
        || (chaseHasWickets && chaseHasOvers)
        || (chaseHasOvers && Number(firstRuns) > 0)
      );

    if (hasValidChase) {
      const isTeam1First = resolveFirstInningsIsHome(
        homeTeam,
        awayTeam,
        rawLd.firstTeamName,
        Number(raw.team1?.runs ?? rawLd.score1 ?? firstRuns ?? 0),
        Number(raw.team2?.runs ?? rawLd.score2 ?? chaseRuns ?? 0),
      );
      const firstTeamName = isTeam1First ? t1Name : t2Name;
      const firstTeamId = isTeam1First ? t1Id : t2Id;
      const firstTeamShort = isTeam1First ? t1Short : t2Short;

      const chaseTeamName = isTeam1First ? t2Name : t1Name;
      const chaseTeamId = isTeam1First ? t2Id : t1Id;
      const chaseTeamShort = isTeam1First ? t2Short : t1Short;

      const firstScores = sanitizeScoreFields({
        runs: firstRuns ?? 0,
        wickets: firstWickets ?? 0,
        overs: firstOvers ?? '0.0',
        declared: rawLd.declared1 || rawLd.declared,
      });

      const chaseScores = sanitizeScoreFields({
        runs: chaseRuns ?? 0,
        wickets: chaseWickets ?? 0,
        overs: chaseOvers ?? '0.0',
        declared: rawLd.declared2,
      });

      rawInnings.push({
        inningsId: 1,
        batTeamId: firstTeamId,
        batTeam: firstTeamName,
        batTeamShort: firstTeamShort,
        ...firstScores,
      });
      rawInnings.push({
        inningsId: 2,
        batTeamId: chaseTeamId,
        batTeam: chaseTeamName,
        batTeamShort: chaseTeamShort,
        ...chaseScores,
      });
    } else {
      // 1st Innings only — never flip to team2 just because firstTeamName is a spelling variant
      const t1r = Number(raw.team1?.runs ?? rawLd.score1 ?? 0);
      const t2r = Number(raw.team2?.runs ?? rawLd.score2 ?? 0);
      const isTeam1Batting = resolveFirstInningsIsHome(
        homeTeam,
        awayTeam,
        rawLd.firstTeamName,
        t1r,
        t2r,
      );

      const batTeamName = isTeam1Batting ? t1Name : t2Name;
      const batTeamId = isTeam1Batting ? t1Id : t2Id;
      const batTeamShort = isTeam1Batting ? t1Short : t2Short;

      const singleScores = sanitizeScoreFields({
        runs: rawLd.runs ?? raw.runs ?? firstRuns ?? 0,
        wickets: rawLd.wickets ?? raw.wickets ?? firstWickets ?? 0,
        overs: rawLd.overs ?? raw.overs ?? firstOvers ?? '0.0',
        declared: rawLd.declared || rawLd.declared1,
      });

      rawInnings.push({
        inningsId: 1,
        batTeamId: batTeamId,
        batTeam: batTeamName,
        batTeamShort: batTeamShort,
        ...singleScores,
      });
    }
  }

  // =========================================================================
  // STRICT 1-TO-1 INNINGS OWNERSHIP MAPPING (MUTUALLY EXCLUSIVE)
  // =========================================================================
  const homeInnings = [];
  const awayInnings = [];
  const normalizedInnings = [];

  for (const inn of rawInnings) {
    let mappedTo = 'UNMAPPED';

    // Priority 1: Stable Team ID match
    if (inn.batTeamId) {
      if (String(inn.batTeamId) === t1Id) mappedTo = 'HOME';
      else if (String(inn.batTeamId) === t2Id) mappedTo = 'AWAY';
    }

    // Priority 2: Unambiguous Token / Short / Name match (NO 1-letter initials)
    if (mappedTo === 'UNMAPPED' && (inn.batTeam || inn.batTeamShort)) {
      const isHome = matchesTeamIdentifier(homeTeam, inn.batTeam, inn.batTeamShort, inn.batTeamId);
      const isAway = matchesTeamIdentifier(awayTeam, inn.batTeam, inn.batTeamShort, inn.batTeamId);

      if (isHome && !isAway) mappedTo = 'HOME';
      else if (isAway && !isHome) mappedTo = 'AWAY';
    }

    // Priority 3: Fallback based on innings sequence in match
    if (mappedTo === 'UNMAPPED') {
      const firstBatIsHome = homeInnings.length > 0
        || (rawInnings[0] && matchesTeamIdentifier(homeTeam, rawInnings[0].batTeam, rawInnings[0].batTeamShort, rawInnings[0].batTeamId));

      if (isTest) {
        // Standard Test sequence: Inn 1 (T1), Inn 2 (T2), Inn 3 (T1), Inn 4 (T2)
        if (inn.inningsId === 1) mappedTo = firstBatIsHome ? 'HOME' : 'AWAY';
        else if (inn.inningsId === 2) mappedTo = firstBatIsHome ? 'AWAY' : 'HOME';
        else if (inn.inningsId === 3) mappedTo = firstBatIsHome ? 'HOME' : 'AWAY';
        else if (inn.inningsId === 4) mappedTo = firstBatIsHome ? 'AWAY' : 'HOME';
      } else {
        // Limited Overs: Inn 1 (T1), Inn 2 (T2)
        if (inn.inningsId === 1) mappedTo = firstBatIsHome ? 'HOME' : 'AWAY';
        else if (inn.inningsId === 2) mappedTo = firstBatIsHome ? 'AWAY' : 'HOME';
      }
    }

    // Default to HOME if still unresolved on Innings 1, AWAY on Innings 2
    if (mappedTo === 'UNMAPPED') {
      mappedTo = inn.inningsId % 2 === 1 ? 'HOME' : 'AWAY';
    }

    const assignedTeamName = mappedTo === 'HOME' ? t1Name : t2Name;
    const assignedTeamId = mappedTo === 'HOME' ? t1Id : t2Id;
    const assignedTeamShort = mappedTo === 'HOME' ? t1Short : t2Short;
    const teamInningsIndex = mappedTo === 'HOME' ? homeInnings.length + 1 : awayInnings.length + 1;

    const cleanInnings = {
      inningsId: inn.inningsId,
      inningsNum: teamInningsIndex,
      matchInningsId: inn.inningsId,
      batTeam: assignedTeamName,
      batTeamId: assignedTeamId,
      batTeamShort: assignedTeamShort,
      runs: inn.runs,
      wickets: inn.wickets,
      overs: inn.overs,
      balls: oversToBalls(inn.overs),
      declared: inn.declared,
      displayScore: `${inn.runs}/${inn.wickets}${inn.declared ? 'd' : ''}`,
    };

    if (mappedTo === 'HOME') {
      homeInnings.push(cleanInnings);
    } else {
      awayInnings.push(cleanInnings);
    }

    normalizedInnings.push(cleanInnings);
  }

  // Validate Mutual Exclusivity
  validateInningsPartition(homeInnings, awayInnings);

  // Preserve previous team innings if incoming partial payload dropped them
  if (homeInnings.length === 0 && previous.homeTeam?.innings?.length > 0) {
    homeInnings.push(...previous.homeTeam.innings);
  }
  if (awayInnings.length === 0 && previous.awayTeam?.innings?.length > 0) {
    awayInnings.push(...previous.awayTeam.innings);
  }

  // Determine latest score for each team (NEVER duplicate or copy opponent score!)
  const homeLatest = homeInnings.length > 0 ? homeInnings[homeInnings.length - 1] : null;
  const awayLatest = awayInnings.length > 0 ? awayInnings[awayInnings.length - 1] : null;

  const homeHasBatted = Boolean(homeLatest);
  const awayHasBatted = Boolean(awayLatest);

  // Compact Roster Single Score (e.g. "256/3" or "—")
  const homeCompactScore = homeHasBatted ? `${homeLatest.runs}/${homeLatest.wickets}${homeLatest.declared ? 'd' : ''}` : '—';
  const awayCompactScore = awayHasBatted ? `${awayLatest.runs}/${awayLatest.wickets}${awayLatest.declared ? 'd' : ''}` : '—';

  // Full detailed multi-innings string for match detail view (e.g. "202 & 256/3d")
  const formatDetailedInningsSummary = (inningsList) => {
    if (!inningsList || inningsList.length === 0) return '—';
    return inningsList.map((i) => {
      // All-out totals conventionally drop the /10 (e.g. "250" not "250/10")
      if (i.wickets === 10 && !i.declared) return `${i.runs}`;
      return `${i.runs}/${i.wickets}${i.declared ? 'd' : ''}`;
    }).join(' & ');
  };

  const homeFullSummary = formatDetailedInningsSummary(homeInnings);
  const awayFullSummary = formatDetailedInningsSummary(awayInnings);

  const homeTotalRuns = homeInnings.reduce((sum, i) => sum + i.runs, 0);
  const awayTotalRuns = awayInnings.reduce((sum, i) => sum + i.runs, 0);

  // Active / Current Innings (Identify from normalized innings)
  const activeInnings = normalizedInnings.length > 0
    ? normalizedInnings[normalizedInnings.length - 1]
    : {
        inningsId: 1,
        inningsNum: 1,
        matchInningsId: 1,
        batTeam: t1Name,
        batTeamId: t1Id,
        batTeamShort: t1Short,
        runs: 0,
        wickets: 0,
        overs: '0.0',
        balls: 0,
        declared: false,
        displayScore: '0/0',
      };

  const isBattingHome = activeInnings.batTeamId === t1Id;
  const currentBowlTeamName = isBattingHome ? t2Name : t1Name;
  const currentBowlTeamId = isBattingHome ? t2Id : t1Id;
  const currentBowlTeamShort = isBattingHome ? t2Short : t1Short;

  const currentBalls = activeInnings.balls || oversToBalls(activeInnings.overs);
  const currentRunRate = currentBalls > 0 ? ((activeInnings.runs / (currentBalls / 6))).toFixed(2) : '0.00';

  const isChaseInnings = isTest ? activeInnings.inningsId === 4 : activeInnings.inningsId >= 2;

  // Log debug state for developer verification
  logScoreMapping({
    matchId,
    homeTeam,
    homeInnings,
    awayTeam,
    awayInnings,
    currentInnings: activeInnings,
  });

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
      score: homeCompactScore,
      latestScore: homeCompactScore,
      latestOvers: homeLatest?.overs || '0.0',
      displayScore: homeCompactScore,
      fullInningsSummary: homeFullSummary,
      runs: homeTotalRuns,
      wickets: homeLatest?.wickets ?? 0,
      overs: homeLatest?.overs || '0.0',
      innings: homeInnings,
      hasBatted: homeHasBatted,
    },

    awayTeam: {
      ...awayTeam,
      score: awayCompactScore,
      latestScore: awayCompactScore,
      latestOvers: awayLatest?.overs || '0.0',
      displayScore: awayCompactScore,
      fullInningsSummary: awayFullSummary,
      runs: awayTotalRuns,
      wickets: awayLatest?.wickets ?? 0,
      overs: awayLatest?.overs || '0.0',
      innings: awayInnings,
      hasBatted: awayHasBatted,
    },

    teams: {
      team1: {
        id: t1Id,
        name: t1Name,
        shortName: t1Short,
        score: homeCompactScore,
        latestScore: homeCompactScore,
        latestOvers: homeLatest?.overs || '0.0',
        displayScore: homeCompactScore,
        fullInningsSummary: homeFullSummary,
        runs: homeTotalRuns,
        wickets: homeLatest?.wickets ?? 0,
        overs: homeLatest?.overs || '0.0',
        innings: homeInnings,
        hasBatted: homeHasBatted,
      },
      team2: {
        id: t2Id,
        name: t2Name,
        shortName: t2Short,
        score: awayCompactScore,
        latestScore: awayCompactScore,
        latestOvers: awayLatest?.overs || '0.0',
        displayScore: awayCompactScore,
        fullInningsSummary: awayFullSummary,
        runs: awayTotalRuns,
        wickets: awayLatest?.wickets ?? 0,
        overs: awayLatest?.overs || '0.0',
        innings: awayInnings,
        hasBatted: awayHasBatted,
      },
    },

    innings: normalizedInnings,
    testInnings: isTest ? normalizedInnings : undefined,

    currentInnings: {
      number: activeInnings.inningsId,
      inningsNum: activeInnings.inningsNum,
      matchInningsId: activeInnings.inningsId,
      batTeam: activeInnings.batTeam,
      batTeamId: activeInnings.batTeamId,
      batTeamShort: activeInnings.batTeamShort,
      bowlTeam: currentBowlTeamName,
      bowlTeamId: currentBowlTeamId,
      bowlTeamShort: currentBowlTeamShort,
      runs: activeInnings.runs,
      wickets: activeInnings.wickets,
      overs: activeInnings.overs,
      balls: currentBalls,
      runRate: currentRunRate,
      isChase: isChaseInnings,
      isBattingHome,
    },

    currentBatters: raw.currentBatters || previous.currentBatters || { striker: null, nonStriker: null },
    currentBowler: raw.currentBowler || previous.currentBowler || null,

    commentary: rawLd.commentary || raw.commentary || previous.commentary || '',
    recentBalls: rawLd.currentOverBalls || previous.recentBalls || [],
    toss: rawLd.toss || raw.toss || previous.toss || null,

    providerUpdatedAt: incomingTime,
    lastUpdated: incomingTime,
    version: (previous.version || 0) + 1,
    source: raw.source || previous.source || 'aggregator',
    rawLiveDetails: rawLd,
  };
}
