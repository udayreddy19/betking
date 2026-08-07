import { getMatchState, isApiBackedMatch, isDisplayableLiveMatch } from './matchBetting.js';

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
  if (!sportId || sportId === 'all') return matches;
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
    if (stateTab === 'live') return isDisplayableLiveMatch(match);
    if (stateTab === 'bettable') return state === 'in' || state === 'pre';
    if (stateTab === 'upcoming') return state === 'pre';
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
  let state = getMatchState(match);
  const apiLive = match?.isLive === true || match?.matchState === 'in';

  return {
    ...match,
    isMock: false,
    matchState: state,
    isLive: state === 'in' || apiLive,
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
