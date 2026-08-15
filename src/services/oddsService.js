/**
 * Frontend Authoritative Odds Service (src/services/oddsService.js)
 * Connects React UI components to backend OddsEngineV3 API endpoints.
 * NO fallback to local hardcoded markets / invented prices.
 */

const oddsCacheMap = new Map();
const CLIENT_CACHE_TTL_MS = 30_000;

export function getCachedMatchOdds(matchId) {
  if (!matchId) return null;
  const cached = oddsCacheMap.get(matchId);
  if (cached && (Date.now() - cached.timestamp < CLIENT_CACHE_TTL_MS)) {
    return cached.data;
  }
  return null;
}

/**
 * Instant UI seed from list-card odds already on the match object.
 * Only used when a full snapshot is not cached yet — never invents prices.
 */
export function provisionalWinnerMarketsFromMatch(match) {
  if (!match) return [];
  const t1Odds = Number(match.odds?.team1 ?? match.odds?.home);
  const t2Odds = Number(match.odds?.team2 ?? match.odds?.away);
  if (!(t1Odds > 1 && t2Odds > 1)) return [];

  const team1Name = match.team1?.name || match.team1 || 'Team 1';
  const team2Name = match.team2?.name || match.team2 || 'Team 2';
  const selections = [
    {
      selectionId: '1',
      selection: '1',
      name: team1Name,
      odds: t1Odds,
      status: 'ACTIVE',
      bettable: true,
    },
    {
      selectionId: '2',
      selection: '2',
      name: team2Name,
      odds: t2Odds,
      status: 'ACTIVE',
      bettable: true,
    },
  ];

  return [{
    marketId: 'match_winner',
    key: 'winner',
    marketType: 'MATCH_WINNER',
    name: 'Match Winner',
    title: 'Match Winner',
    category: 'main',
    categoryGroup: 'main',
    status: 'OPEN',
    selections,
    options: selections,
  }];
}

export async function fetchAuthoritativeMatchOdds(matchId, team1Name, team2Name) {
  if (!matchId) return null;
  try {
    let url = `/api/public/sports/matches/${encodeURIComponent(matchId)}/odds`;
    const params = new URLSearchParams();
    if (team1Name && typeof team1Name === 'string' && !team1Name.includes('undefined')) {
      params.append('team1', team1Name);
    }
    if (team2Name && typeof team2Name === 'string' && !team2Name.includes('undefined')) {
      params.append('team2', team2Name);
    }
    const qStr = params.toString();
    if (qStr) url += `?${qStr}`;

    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data && (data.success || data.status === 'OK' || Array.isArray(data.markets))) {
      oddsCacheMap.set(matchId, { data, timestamp: Date.now() });
      return data;
    }
    return null;
  } catch (err) {
    console.error(`[OddsService] Failed to fetch odds for match ${matchId}:`, err.message);
    const cached = oddsCacheMap.get(matchId);
    return cached?.data || null;
  }
}
