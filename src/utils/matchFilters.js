import { getMatchState } from './matchBetting';
import { getMatchPairKey } from './teamNames';

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

  const apiByPair = new Map(apiMatches.map((match) => [getMatchPairKey(match), match]));
  const apiSports = new Set(apiMatches.map((m) => m.sport));
  const consumedPairs = new Set();

  const updatedDefaults = defaultMatches.map((match) => {
    const pairKey = getMatchPairKey(match);
    const apiMatch = apiByPair.get(pairKey);
    if (!apiMatch) return match;

    consumedPairs.add(pairKey);
    return {
      ...match,
      league: apiMatch.league || match.league,
      time: apiMatch.time || match.time,
      isLive: apiMatch.isLive,
      matchState: apiMatch.matchState,
      liveDetails: {
        ...match.liveDetails,
        ...apiMatch.liveDetails,
      },
      fancodeMatchId: apiMatch.fancodeMatchId,
      scoreSource: apiMatch.source || 'api',
    };
  });

  const freshApiMatches = apiMatches.filter((match) => !consumedPairs.has(getMatchPairKey(match)));
  const preservedOtherSports = updatedDefaults.filter((m) => !apiSports.has(m.sport));
  const preservedSameSport = updatedDefaults.filter(
    (m) => apiSports.has(m.sport) && !consumedPairs.has(getMatchPairKey(m))
  );

  return dedupeMatches([...freshApiMatches, ...preservedSameSport, ...preservedOtherSports]);
}
