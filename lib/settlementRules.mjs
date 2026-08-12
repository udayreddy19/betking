/**
 * Enterprise Settlement Rule Engine — BetKing Sportsbook (lib/settlementRules.mjs)
 * Evaluates settlement exception rules: Void Markets, Abandoned Matches,
 * Dead Heat rules, Push, Ties, Cancelled Matches, and Partial Settlements.
 */

export function evaluateSettlementRule(matchState = {}, leg = {}) {
  const status = String(matchState.status || matchState.matchState || '').toLowerCase();

  // Cancelled or Abandoned Match -> VOID
  if (status.includes('cancelled') || status.includes('abandoned') || status.includes('postponed')) {
    return { outcome: 'VOID', payoutMultiplier: 1.0, reason: `Match ${status}` };
  }

  // Rain Delay / Interrupted Match
  if (status.includes('rain delay') && matchState.completedOvers < 5) {
    return { outcome: 'VOID', payoutMultiplier: 1.0, reason: 'Match abandoned due to rain' };
  }

  // Dead Heat Split (e.g. 2 winners in a selection market)
  if (leg.isDeadHeat) {
    return { outcome: 'HALF_WIN', payoutMultiplier: 0.5, reason: 'Dead Heat rule applied' };
  }

  return { outcome: 'STANDARD', payoutMultiplier: 1.0, reason: 'Standard result evaluation' };
}

const SETTLED_TRANSACTIONS = new Set();

export function settleIPLSRLMarket(marketKey = 'winner', selection = '1', matchState = {}, transactionId = '') {
  if (transactionId && SETTLED_TRANSACTIONS.has(transactionId)) {
    return { outcome: 'ALREADY_SETTLED', payoutMultiplier: 0.0, reason: 'Duplicate settlement transaction blocked by idempotency guard' };
  }

  const status = matchState.status;

  if (status === 'ABANDONED' || status === 'NO_RESULT') {
    if (transactionId) SETTLED_TRANSACTIONS.add(transactionId);
    return { outcome: 'VOID', payoutMultiplier: 1.0, reason: `Match ended in ${status}` };
  }

  if (status !== 'COMPLETED') {
    return { outcome: 'PENDING', payoutMultiplier: 0.0, reason: 'Match not completed' };
  }

  const winnerTeamId = matchState.winnerId;
  const homeTeamId = matchState.homeTeam?.teamId;
  const awayTeamId = matchState.awayTeam?.teamId;

  if (transactionId) SETTLED_TRANSACTIONS.add(transactionId);

  if (winnerTeamId === 'TIE' || winnerTeamId === 'DRAW') {
    return { outcome: 'PUSH', payoutMultiplier: 1.0, reason: 'Match tied' };
  }

  const isHomeSelected = selection === '1' || selection === homeTeamId;
  const isAwaySelected = selection === '2' || selection === awayTeamId;

  if ((isHomeSelected && winnerTeamId === homeTeamId) || (isAwaySelected && winnerTeamId === awayTeamId) || (selection === winnerTeamId)) {
    return { outcome: 'WIN', payoutMultiplier: 1.0, reason: 'Winning selection' };
  }
  return { outcome: 'LOSS', payoutMultiplier: 0.0, reason: 'Losing selection' };
}
