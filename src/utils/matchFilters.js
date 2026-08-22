import { getMatchState, isApiBackedMatch, isDisplayableLiveMatch, isPreMatchHold } from './matchBetting.js';

const PRELIVE_WINDOW_HOURS = 48;

export function resolveMatchStartMs(match) {
  if (!match) return null;
  if (match.startTime) {
    const t = new Date(match.startTime).getTime();
    if (Number.isFinite(t)) return t;
  }
  if (match.matchDate) {
    const t = new Date(match.matchDate).getTime();
    if (Number.isFinite(t)) return t;
  }
  const time = String(match?.time || '');
  const timeMatch = time.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const now = new Date();
    const target = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      parseInt(timeMatch[1], 10),
      parseInt(timeMatch[2], 10),
    );
    if (target.getTime() < now.getTime()) target.setDate(target.getDate() + 1);
    return target.getTime();
  }
  return null;
}

/** Pre-match fixtures starting soon (within 48h) or in a pre-match hold state. */
export function isPreLiveMatch(match) {
  if (getMatchState(match) !== 'pre') return false;
  const start = resolveMatchStartMs(match);
  if (start == null) return isPreMatchHold(match);
  const hours = (start - Date.now()) / 3600000;
  return hours >= 0 && hours <= PRELIVE_WINDOW_HOURS;
}

/** Scheduled fixtures further out than the pre-live window. */
export function isUpcomingMatch(match) {
  if (getMatchState(match) !== 'pre') return false;
  return !isPreLiveMatch(match);
}

export function countMatchesByStateTabs(matches = []) {
  const list = matches || [];
  return {
    live: list.filter((m) => isDisplayableLiveMatch(m)).length,
    prelive: list.filter((m) => isPreLiveMatch(m)).length,
    upcoming: list.filter((m) => isUpcomingMatch(m)).length,
  };
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
    if (stateTab === 'prelive') return isPreLiveMatch(match);
    if (stateTab === 'bettable') return state === 'in' || state === 'pre';
    if (stateTab === 'upcoming') return isUpcomingMatch(match);
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
