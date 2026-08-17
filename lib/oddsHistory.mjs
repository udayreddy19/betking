/**
 * Enterprise Odds History Module — OddsYra Sportsbook (lib/oddsHistory.mjs)
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
    marketId: changeRecord.marketId || 'match_winner',
    selectionId: changeRecord.selectionId || changeRecord.selection || 'selection',
    provider: changeRecord.provider || 'cricbuzz',
    oldOdds: changeRecord.oldOdds || null,
    newOdds: changeRecord.newOdds || null,
    matchVersion: changeRecord.matchVersion || 1,
    oddsVersion: changeRecord.oddsVersion || (history.length + 1),
    probability: changeRecord.probability || null,
    exposureAdjustment: changeRecord.exposureAdjustment || 0,
    riskAdjustment: changeRecord.riskAdjustment || 0,
    margin: changeRecord.margin || 0.05,
    reason: changeRecord.reason || 'AUTOMATED_PROBABILITY_SHIFT',
    userOverrideBy: changeRecord.userOverrideBy || null,
    timestamp,
    formattedTime: new Date(timestamp).toISOString(),
    explanation: changeRecord.explanation || explainOddsMovement(changeRecord),
  };

  history.push(entry);
  if (history.length > 500) history.shift();
  HISTORICAL_ODDS_STORE.set(matchId, history);

  return entry;
}

export function explainOddsMovement(record = {}) {
  const { oldOdds, newOdds, reason, scoreState } = record;
  if (!oldOdds || !newOdds) return 'Initial market pricing established';
  const diff = (newOdds - oldOdds).toFixed(2);
  const direction = newOdds > oldOdds ? 'lengthened' : 'shortened';
  return `Price ${direction} by ${Math.abs(diff)} (${oldOdds} -> ${newOdds}) due to ${reason || 'live score progression'}${scoreState ? ` at ${scoreState}` : ''}.`;
}

export function getMatchOddsHistory(matchId) {
  return HISTORICAL_ODDS_STORE.get(matchId) || [];
}
