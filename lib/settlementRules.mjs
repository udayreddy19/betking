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
