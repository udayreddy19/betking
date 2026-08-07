/**
 * Enterprise Market Lifecycle Engine — BetKing Enterprise Platform (lib/marketLifecycle.mjs)
 * Automatically transitions market states between DRAFT, SCHEDULED, PRE_MATCH, OPEN,
 * LIVE, SUSPENDED, CLOSED, SETTLED, and ARCHIVED.
 */

const MARKET_LIFECYCLE_STATES = new Map();

export function transitionMarketState(marketId, nextState, reason = 'Automated State Change') {
  const ALLOWED_STATES = ['DRAFT', 'SCHEDULED', 'PRE_MATCH', 'OPEN', 'LIVE', 'SUSPENDED', 'CLOSED', 'SETTLED', 'ARCHIVED'];
  const state = String(nextState).toUpperCase();

  if (!ALLOWED_STATES.includes(state)) {
    throw new Error(`Invalid market state: ${state}`);
  }

  const currentRecord = MARKET_LIFECYCLE_STATES.get(marketId) || {
    marketId,
    state: 'DRAFT',
    history: [],
  };

  currentRecord.history.push({
    from: currentRecord.state,
    to: state,
    reason,
    timestamp: Date.now(),
  });

  currentRecord.state = state;
  currentRecord.updatedAt = new Date().toISOString();

  MARKET_LIFECYCLE_STATES.set(marketId, currentRecord);
  return currentRecord;
}

export function getMarketLifecycleState(marketId) {
  return MARKET_LIFECYCLE_STATES.get(marketId) || { marketId, state: 'OPEN' };
}
