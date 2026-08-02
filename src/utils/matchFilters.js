import { getMatchState, isTrulyLiveMatch, isMockMatch, isApiBackedMatch } from './matchBetting';
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

  return matches.filter((match) => {
    if (stateTab === 'live') return isTrulyLiveMatch(match);
    const state = getMatchState(match);
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

function normalizeLiveFlags(match) {
  const state = getMatchState(match);
  return {
    ...match,
    matchState: state,
    isLive: state === 'in',
  };
}

function demoteStaleMock(match, apiSports, consumedPairs) {
  if (!isMockMatch(match) || isApiBackedMatch(match)) return match;
  if (consumedPairs.has(getMatchPairKey(match))) return match;

  const claimsLive = match.isLive || match.matchState === 'in';
  const sportCoveredByApi = apiSports.has(match.sport);

  if (!claimsLive && getMatchState(match) !== 'in') return match;

  // Unpaired demo matches must not appear as live when real API data exists,
  // or when they are hardcoded mock entries.
  if (sportCoveredByApi || claimsLive) {
    return {
      ...match,
      isLive: false,
      matchState: 'pre',
      time: match.time === 'Live' ? 'Demo' : match.time,
    };
  }

  return match;
}

export function mergeApiAndDefaultMatches(apiMatches, defaultMatches) {
  if (!apiMatches.length) return dedupeMatches(defaultMatches);

  const apiByPair = new Map(apiMatches.map((match) => [getMatchPairKey(match), match]));
  const apiSports = new Set(apiMatches.map((m) => m.sport));
  const consumedPairs = new Set();

  const updatedDefaults = defaultMatches.map((match) => {
    const pairKey = getMatchPairKey(match);
    const apiMatch = apiByPair.get(pairKey);
    if (!apiMatch) return demoteStaleMock(match, apiSports, consumedPairs);

    consumedPairs.add(pairKey);
    return normalizeLiveFlags({
      ...match,
      isMock: false,
      league: apiMatch.league || match.league,
      time: apiMatch.time || match.time,
      isLive: apiMatch.isLive,
      matchState: apiMatch.matchState,
      liveDetails: {
        ...match.liveDetails,
        ...apiMatch.liveDetails,
      },
      cricbuzzMatchId: apiMatch.cricbuzzMatchId || match.cricbuzzMatchId,
      fancodeMatchId: apiMatch.fancodeMatchId || match.fancodeMatchId,
      espnEventId: apiMatch.espnEventId || match.espnEventId,
      espnPath: apiMatch.espnPath || match.espnPath,
      scoreSource: apiMatch.source || 'api',
      source: apiMatch.source || match.source,
    });
  });

  const freshApiMatches = apiMatches
    .filter((match) => !consumedPairs.has(getMatchPairKey(match)))
    .map((m) => normalizeLiveFlags({ ...m, isMock: false, scoreSource: m.source || 'api' }));
  const preservedOtherSports = updatedDefaults
    .filter((m) => !apiSports.has(m.sport))
    .map((m) => demoteStaleMock(m, apiSports, consumedPairs));
  const preservedSameSport = updatedDefaults
    .filter((m) => apiSports.has(m.sport) && !consumedPairs.has(getMatchPairKey(m)))
    .map((m) => demoteStaleMock(m, apiSports, consumedPairs));

  return dedupeMatches([...freshApiMatches, ...preservedSameSport, ...preservedOtherSports]);
}
