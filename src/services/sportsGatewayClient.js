/**
 * Client-side Sports Gateway API Client.
 * Connects React UI components to /api/v1 Gateway Aggregator endpoints.
 */

const API_BASE = '/api/v1';

async function gatewayFetch(endpoint) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Accept': 'application/json',
        'X-API-Key': 'bk_live_998877665544332211',
      },
    });
    if (!res.ok) throw new Error(`Gateway HTTP ${res.status}`);
    const json = await res.json();
    return json.data || json;
  } catch (err) {
    console.warn(`[Gateway Client] Error fetching ${endpoint}:`, err.message);
    return [];
  }
}

export const sportsGatewayClient = {
  // 1. Sport Specific Live / Scheduled / Completed
  getCricket: (type = 'live') => gatewayFetch(`/cricket/${type}`),
  getFootball: (type = 'live') => gatewayFetch(`/football/${type}`),
  getBasketball: (type = 'live') => gatewayFetch(`/basketball/${type}`),
  getTennis: (type = 'live') => gatewayFetch(`/tennis/${type}`),
  getFormula1: (type = 'live') => gatewayFetch(`/formula1/${type}`),
  getHockey: (type = 'live') => gatewayFetch(`/hockey/${type}`),
  getAmericanFootball: (type = 'live') => gatewayFetch(`/american-football/${type}`),
  getMultiSport: (type = 'live') => gatewayFetch(`/multi-sport/${type}`),

  // 2. Multi-Entity Search
  search: (query) => gatewayFetch(`/search?q=${encodeURIComponent(query)}`),

  // 3. Match Details & Rankings
  getMatchScore: (matchId) => gatewayFetch(`/matches/${matchId}/score`),
  getMatchEvents: (matchId) => gatewayFetch(`/matches/${matchId}/events`),
  getMatchLineups: (matchId) => gatewayFetch(`/matches/${matchId}/lineups`),
  getRankings: () => gatewayFetch(`/rankings`),
  getStandings: () => gatewayFetch(`/standings`),
};
