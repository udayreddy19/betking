import { getMatchState, hasCricketPlayStarted } from './matchBetting.js';
import { resolveCricketTeamScores } from './cricketScores.js';

export function parseRunsWickets(score) {
  const text = String(score || '').trim();
  const match = text.match(/^(\d+)\s*\/\s*(\d+)/);
  if (!match) return { runs: 0, wickets: 0 };
  return { runs: Number(match[1]), wickets: Number(match[2]) };
}

function isCricketMatch(match) {
  const sport = normalizeSportId(match?.sport || 'cricket');
  return !sport || sport.includes('cricket');
}

/** Live cricket that still shows 0/0 has not started; scored games rank first. */
export function cricketBoardActivity(match, displayedScores = null) {
  if (!isCricketMatch(match)) {
    return { started: getMatchState(match) === 'in', totalRuns: 0, totalWickets: 0 };
  }

  let runs = 0;
  let wickets = 0;
  if (displayedScores) {
    const team1 = parseRunsWickets(displayedScores.team1Score);
    const team2 = parseRunsWickets(displayedScores.team2Score);
    runs = team1.runs + team2.runs;
    wickets = team1.wickets + team2.wickets;
  } else {
    const resolved = resolveCricketTeamScores(match, match?.liveDetails || {});
    runs = (Number(resolved?.team1?.runs) || 0) + (Number(resolved?.team2?.runs) || 0);
    wickets = (Number(resolved?.team1?.wickets) || 0) + (Number(resolved?.team2?.wickets) || 0);
  }

  return {
    started: runs > 0 || wickets > 0 || hasCricketPlayStarted(match),
    totalRuns: runs,
    totalWickets: wickets,
  };
}

export function compareMatchesForSportsBoard(a, b, getDisplayedScores) {
  const liveA = getMatchState(a) === 'in' ? 0 : 1;
  const liveB = getMatchState(b) === 'in' ? 0 : 1;
  if (liveA !== liveB) return liveA - liveB;

  const scoresA = typeof getDisplayedScores === 'function' ? getDisplayedScores(a) : null;
  const scoresB = typeof getDisplayedScores === 'function' ? getDisplayedScores(b) : null;
  const actA = cricketBoardActivity(a, scoresA);
  const actB = cricketBoardActivity(b, scoresB);
  if (actA.started !== actB.started) return actA.started ? -1 : 1;
  if (actA.totalRuns !== actB.totalRuns) return actB.totalRuns - actA.totalRuns;

  const leagueCmp = String(a.league || a.seriesName || '').localeCompare(String(b.league || b.seriesName || ''));
  if (leagueCmp) return leagueCmp;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

export function normalizeSportId(sport) {
  return String(sport || '').toLowerCase().trim();
}

export function dedupeMatches(matches) {
  const seen = new Set();
  return matches.filter(match => {
    if (!match?.id || seen.has(match.id)) return false;
    seen.add(match.id);
    return true;
  });
}

export function filterMatchesBySport(matches, sportId) {
  if (!sportId || sportId === 'all' || sportId === '') return matches;
  const target = normalizeSportId(sportId);
  return matches.filter(match => {
    const s = normalizeSportId(match.sport || 'cricket');
    return s === target;
  });
}

export function filterMatchesByState(matches, stateTab = 'all') {
  if (stateTab === 'all') return matches;

  return matches.filter((match) => {
    const state = getMatchState(match);
    if (stateTab === 'bettable') return state === 'in' || state === 'pre';
    if (stateTab === 'completed') return state === 'post';
    return true;
  });
}

export function filterMatches(matches, { sport, stateTab = 'all', searchQuery = '' } = {}) {
  let result = matches;
  result = filterMatchesBySport(result, sport);
  result = filterMatchesByState(result, stateTab);

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter(match =>
      match.team1?.name?.toLowerCase().includes(q) ||
      match.team2?.name?.toLowerCase().includes(q) ||
      (match.league || match.seriesName || '').toLowerCase().includes(q)
    );
  }

  return result;
}

function normalizeLiveFlags(match) {
  if (!match) return null;
  const state = getMatchState(match);

  return {
    ...match,
    isMock: false,
    matchState: state,
    isLive: state === 'in',
    time: match.time || 'Live',
    scoreSource: match.source || match.scoreSource || 'api',
  };
}

/** Normalize API-sourced matches only — no mock/demo merge. */
export function normalizeApiMatches(apiMatches = []) {
  return dedupeMatches(
    (apiMatches || []).map((match) => normalizeLiveFlags(match)).filter(Boolean),
  );
}

/** @deprecated Use normalizeApiMatches — kept for any stale imports */
export function mergeApiAndDefaultMatches(apiMatches) {
  return normalizeApiMatches(apiMatches);
}
