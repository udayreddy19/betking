/**
 * Enterprise Bet Builder Engine — BetKing Sportsbook (lib/betBuilderEngine.mjs)
 * Supports Same-Match & Cross-Match Bet Builders, correlation rules,
 * combined odds calculation, and validation checks.
 */

export function calculateBetBuilderOdds(selections = []) {
  if (!Array.isArray(selections) || selections.length === 0) {
    return { valid: false, combinedOdds: 1.0, reason: 'No selections provided' };
  }

  let combinedOdds = 1.0;
  let correlationDiscount = 1.0;

  const matchIds = new Set(selections.map((s) => s.matchId));
  const isSameMatch = matchIds.size === 1;

  for (const sel of selections) {
    const dec = Number(sel.odds || 1.0);
    combinedOdds *= dec;
  }

  // Same-match correlated outcomes discount (e.g. Home Win + Over Goals)
  if (isSameMatch && selections.length > 1) {
    correlationDiscount = Math.pow(0.92, selections.length - 1);
  }

  const finalCombinedOdds = Number((combinedOdds * correlationDiscount).toFixed(2));

  return {
    valid: true,
    isSameMatchBuilder: isSameMatch,
    selectionsCount: selections.length,
    rawCombinedOdds: Number(combinedOdds.toFixed(2)),
    correlationDiscountPct: Number(((1 - correlationDiscount) * 100).toFixed(1)),
    finalCombinedOdds: Math.max(1.05, finalCombinedOdds),
    calculatedAt: new Date().toISOString(),
  };
}
