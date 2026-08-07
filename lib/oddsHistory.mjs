/**
 * Enterprise Odds History Module — BetKing Sportsbook (lib/oddsHistory.mjs)
 * Stores versioned odds updates, trader manual overrides, and historical odds queries.
 */

const HISTORICAL_ODDS_STORE = new Map();

export function recordOddsChange(changeRecord = {}) {
  const matchId = changeRecord.matchId || 'global';
  const timestamp = Date.now();

  let history = HISTORICAL_ODDS_STORE.get(matchId) || [];
  const entry = {
    version: history.length + 1,
    matchId,
    marketId: changeRecord.marketId || 'winner',
    provider: changeRecord.provider || 'cricbuzz',
    oldOdds: changeRecord.oldOdds || null,
    newOdds: changeRecord.newOdds || null,
    reason: changeRecord.reason || 'AUTOMATED_PROBABILITY_SHIFT',
    userOverrideBy: changeRecord.userOverrideBy || null,
    timestamp,
    formattedTime: new Date(timestamp).toISOString(),
  };

  history.push(entry);
  if (history.length > 200) history.shift();
  HISTORICAL_ODDS_STORE.set(matchId, history);

  return entry;
}

export function getMatchOddsHistory(matchId) {
  return HISTORICAL_ODDS_STORE.get(matchId) || [];
}
