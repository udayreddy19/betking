/**
 * Enterprise Historical Sports Database — OddsYra Enterprise Platform (lib/historyEngine.mjs)
 * Stores historical matches, historical odds, historical events, player statistics, and head-to-head records.
 */

const HISTORICAL_MATCHES_STORE = new Map();

export function storeHistoricalMatch(matchRecord = {}) {
  const matchId = matchRecord.id || `hist_${Date.now()}`;
  HISTORICAL_MATCHES_STORE.set(matchId, {
    ...matchRecord,
    archivedAt: new Date().toISOString(),
  });
  return matchRecord;
}

export function getHistoricalMatch(matchId) {
  return HISTORICAL_MATCHES_STORE.get(matchId) || null;
}
