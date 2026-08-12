/**
 * Frontend Authoritative Odds Service (src/services/oddsService.js)
 * Connects React UI components to backend OddsEngineV3 API endpoints.
 * NO fallback to local hardcoded markets.
 */

const oddsCacheMap = new Map();

export function getCachedMatchOdds(matchId) {
  if (!matchId) return null;
  const cached = oddsCacheMap.get(matchId);
  if (cached && (Date.now() - cached.timestamp < 10000)) {
    return cached.data;
  }
  return null;
}

export async function fetchAuthoritativeMatchOdds(matchId, team1Name, team2Name) {
  if (!matchId) return null;
  try {
    let url = `/api/public/sports/matches/${matchId}/odds`;
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
        'Accept': 'application/json',
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
