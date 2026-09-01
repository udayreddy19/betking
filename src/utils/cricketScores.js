import { normalizeCricbuzzOvers, oversToBalls } from './oversUtils.js';
import { normalizeMatchOvers, oversToBallsForMatch } from './cricketFormat.js';
import {
  normalizeMatch,
  normalizeMatchScore,
  matchesTeamIdentifier,
  normalizeToken,
  CRICKET_FORMATS,
  detectCanonicalFormat,
} from './cricketMatchNormalizer.js';

export { normalizeMatch, normalizeMatchScore };

/** Wickets in a single innings cannot exceed 10 (except test multi-day formats). */
export function clampInningsWickets(wickets, match) {
  const w = Number(wickets) || 0;
  if (w <= 0) return 0;
  const format = String(
    match?.liveDetails?.matchFormat
    || match?.matchType
    || match?.format
    || '',
  ).toLowerCase();
  if (/test/.test(format)) return w;
  return Math.min(w, 10);
}

function scoreEntry(token, runs, wickets, overs, match) {
  const normalized = match ? normalizeMatchOvers(overs ?? '0.0', match) : normalizeCricbuzzOvers(overs ?? '0.0');
  return {
    token: token || '',
    runs: runs ?? 0,
    wickets: clampInningsWickets(wickets, match),
    overs: normalized,
    balls: match ? oversToBallsForMatch(overs ?? '0.0', match) : oversToBalls(overs ?? '0.0'),
  };
}

export function teamNameMatches(teamName, token, teamId = null, candidateId = null) {
  return matchesTeamIdentifier(teamName, token, '', candidateId, teamId);
}

export function pickPositiveScore(primary, fallback, lastResort = 0) {
  const p = primary == null ? null : Number(primary);
  const f = fallback == null ? null : Number(fallback);
  if (p != null && Number.isFinite(p) && p > 0) return p;
  if (f != null && Number.isFinite(f) && f > 0) return f;
  if (p != null && Number.isFinite(p)) return p;
  if (f != null && Number.isFinite(f)) return f;
  return lastResort;
}

/** Feed copied the batting score onto both teams (often still labelled innings 2). */
export function looksLikeMirroredFirstInnings(match, ld = {}) {
  const text = String(ld.commentary || ld.minute || ld.period || match?.time || '');
  const firstInningsLabel = /first\s+innings/i.test(text) && !/second\s+innings/i.test(text);

  const t1 = Number(match?.team1?.runs ?? ld.score1 ?? ld.runs ?? 0);
  const t2 = Number(match?.team2?.runs ?? ld.score2 ?? 0);
  const w1 = Number(match?.team1?.wickets ?? ld.wickets1 ?? ld.wickets ?? 0);
  const w2 = Number(match?.team2?.wickets ?? ld.wickets2 ?? ld.chaseWickets ?? 0);
  const sameScore = t1 > 0 && t1 === t2;
  const sameWkts = w1 === w2;

  const firstRuns = Number(ld.firstRuns);
  const chaseRuns = Number(ld.chaseRuns);
  const distinctTotals = Number.isFinite(firstRuns) && firstRuns > 0
    && Number.isFinite(chaseRuns)
    && firstRuns !== chaseRuns;

  const firstOvers = String(ld.firstOvers || '');
  const chaseOvers = String(ld.chaseOvers || '');
  const distinctOvers = firstOvers
    && chaseOvers
    && firstOvers !== '0.0'
    && chaseOvers !== '0.0'
    && firstOvers !== chaseOvers;

  if (distinctTotals || distinctOvers) return false;
  if (firstInningsLabel) return true;
  if (!sameScore) return false;
  if (sameWkts && w1 > 10) return true;
  if (ld.chaseTeamName && Number(ld.chaseRuns) > 0 && Number(ld.firstRuns) > 0 && Number(ld.firstRuns) !== Number(ld.chaseRuns)) {
    return false;
  }
  return sameWkts || w2 === 0 || Number(ld.score2) === t1;
}

/**
 * Authoritative score resolver using the canonical normalizer.
 * Maps liveDetails fields onto team1/team2 strictly partitioning innings by batting team.
 */
export function resolveCricketTeamScores(match, ld = {}) {
  const enriched = {
    ...match,
    liveDetails: {
      ...(match?.liveDetails || {}),
      ...ld,
    },
  };

  const normalized = normalizeMatch(enriched);

  const t1Latest = normalized.homeTeam.innings[normalized.homeTeam.innings.length - 1];
  const t2Latest = normalized.awayTeam.innings[normalized.awayTeam.innings.length - 1];

  const t1Score = scoreEntry(
    normalized.homeTeam.name,
    t1Latest ? t1Latest.runs : 0,
    t1Latest ? t1Latest.wickets : 0,
    t1Latest ? t1Latest.overs : '0.0',
    match,
  );

  const t2Score = scoreEntry(
    normalized.awayTeam.name,
    t2Latest ? t2Latest.runs : 0,
    t2Latest ? t2Latest.wickets : 0,
    t2Latest ? t2Latest.overs : '0.0',
    match,
  );

  // Compact single scores for roster cards (e.g. "256/3" or "—")
  t1Score.displayScore = normalized.homeTeam.hasBatted ? `${t1Latest.runs}/${t1Latest.wickets}${t1Latest.declared ? 'd' : ''}` : '';
  t2Score.displayScore = normalized.awayTeam.hasBatted ? `${t2Latest.runs}/${t2Latest.wickets}${t2Latest.declared ? 'd' : ''}` : '';

  // Detailed multi-innings strings and arrays for detail view & scorecard
  t1Score.fullInningsSummary = normalized.homeTeam.fullInningsSummary;
  t2Score.fullInningsSummary = normalized.awayTeam.fullInningsSummary;
  t1Score.innings = normalized.homeTeam.innings;
  t2Score.innings = normalized.awayTeam.innings;
  t1Score.hasBatted = normalized.homeTeam.hasBatted;
  t2Score.hasBatted = normalized.awayTeam.hasBatted;

  return {
    team1: t1Score,
    team2: t2Score,
    currentInnings: normalized.currentInnings,
    innings: normalized.innings,
    homeTeam: normalized.homeTeam,
    awayTeam: normalized.awayTeam,
  };
}

/** Compact cricket line for My Bets / bet cards. Never repeats a copied first-innings total as 42/2 : 42/2. */
export function formatCricketInlineScore(match, ld = {}) {
  const live = { ...(match?.liveDetails || {}), ...ld };
  const scores = resolveCricketTeamScores(match || { sport: 'cricket', liveDetails: live }, live);
  const t1 = scores.team1.hasBatted ? scores.team1.displayScore : '';
  const t2 = scores.team2.hasBatted ? scores.team2.displayScore : '';
  if (t1 && t2 && t1 === t2 && looksLikeMirroredFirstInnings(match, live)) {
    return t1;
  }
  if (t1 && t2) return `${t1} : ${t2}`;
  return t1 || t2 || null;
}

export function flattenCricketTeamScores(scores) {
  return {
    runs: scores.team1.runs,
    wickets: scores.team1.wickets,
    overs: scores.team1.overs,
    score2: scores.team2.runs,
    wickets2: scores.team2.wickets,
    overs2: scores.team2.overs,
  };
}

export function isEmptyOversValue(value) {
  return value == null || value === '' || value === 0 || value === '0' || value === '0.0';
}

export function isCricketSecondInnings(match, ld = {}) {
  const format = detectCanonicalFormat({ ...match, liveDetails: ld });
  if (format === CRICKET_FORMATS.TEST) {
    return (ld.inningsId ?? 0) === 4;
  }

  if (looksLikeMirroredFirstInnings(match, ld)) return false;

  const inningsId = Number(ld.inningsId) || 0;
  if (inningsId >= 2) return true;

  const chaseProgress = Number(ld.chaseRuns) > 0 || Number(ld.chaseWickets) > 0;

  if (inningsId === 1) {
    if (chaseProgress) return true;
    if (Number(match?.team1?.runs) > 0 && Number(match?.team2?.runs) > 0) return true;
    return false;
  }

  if (chaseProgress) return true;

  if (match?.matchState !== 'in' && !match?.isLive) return false;

  const chaseOversStarted = ld.chaseOvers && ld.chaseOvers !== '0.0' && ld.chaseOvers !== '0';
  if (chaseOversStarted && Number(ld.chaseBallNbr) > 0) return true;

  if (ld.chaseTeamName && ld.firstTeamName && Number(ld.chaseRuns) > 0) return true;

  if (Number(match?.team1?.runs) > 0 && Number(match?.team2?.runs) > 0) return true;

  return false;
}

export function resolveCricketTossText(match, extraState) {
  if (!match) return null;
  const isCricket = match.sport === 'cricket' || match.sport === 'virtual-cricket' || !match.sport;
  if (!isCricket) return null;

  const t = match.toss
    || match.liveDetails?.toss
    || match.matchHeader?.toss
    || extraState?.toss
    || match.matchHeader?.tossResults;
  if (t && typeof t === 'object' && (t.tossWinnerName || t.winnerName) && !t.winner) {
    const winner = t.tossWinnerName || t.winnerName;
    const raw = String(t.decision || '').toLowerCase();
    const decision = raw.includes('bowl') ? 'bowl' : raw.includes('bat') ? 'bat' : t.decision;
    if (winner && decision) return `${winner} won the toss & elected to ${decision}`;
    if (winner) return `${winner} won the toss`;
  }
  if (typeof t === 'string' && t.trim()) return t.trim();
  if (t && typeof t === 'object') {
    const winner = t.winnerName || t.winner || t.teamWinnerName;
    const decision = t.decision || t.decisionChoice;
    if (winner && decision) {
      return `${winner} won the toss & elected to ${String(decision).toLowerCase()}`;
    }
    if (winner) return `${winner} won the toss`;
  }

  const comm = extraState?.commentary || match.liveDetails?.commentary || '';
  if (/won the toss|opt(?:ed)? to (?:bat|bowl)|elected to/i.test(comm)) return comm;
  return null;
}
