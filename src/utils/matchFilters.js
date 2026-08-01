import { getMatchState } from './matchBetting';

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
  if (!sportId) return matches;
  const target = normalizeSportId(sportId);
  return matches.filter(match => normalizeSportId(match.sport) === target);
}

export function filterMatchesByState(matches, stateTab = 'all') {
  if (stateTab === 'all') return matches;

  return matches.filter(match => {
    const state = getMatchState(match);
    if (stateTab === 'live') return state === 'in';
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
      match.team1.name.toLowerCase().includes(q) ||
      match.team2.name.toLowerCase().includes(q) ||
      match.league.toLowerCase().includes(q)
    );
  }

  return result;
}

export function mergeApiAndDefaultMatches(apiMatches, defaultMatches) {
  if (!apiMatches.length) return dedupeMatches(defaultMatches);

  const apiSports = new Set(apiMatches.map(m => m.sport));
  const apiPairKeys = new Set(apiMatches.map(m => `${m.team1.name}|${m.team2.name}`));

  const preservedOtherSports = defaultMatches.filter(m => !apiSports.has(m.sport));
  const preservedSameSport = defaultMatches.filter(
    m => apiSports.has(m.sport) && !apiPairKeys.has(`${m.team1.name}|${m.team2.name}`)
  );

  return dedupeMatches([...apiMatches, ...preservedSameSport, ...preservedOtherSports]);
}
