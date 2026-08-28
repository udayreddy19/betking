/**
 * OddsEngineV3 — Market Relationship & Cross-Market Coherence Engine
 * 
 * Validates logical and mathematical dependencies between related markets
 * (Match Winner vs Double Chance, Multi-Line Totals, Team Totals vs Match Totals)
 * to detect cross-market pricing contradictions and internal arbitrage.
 */

export const VIOLATION_TYPES = Object.freeze({
  ARBITRAGE_DUTCH_BOOK: 'ARBITRAGE_DUTCH_BOOK',
  MONOTONICITY_LINE_INVERSION: 'MONOTONICITY_LINE_INVERSION',
  PROBABILITY_PARTITION_MISMATCH: 'PROBABILITY_PARTITION_MISMATCH',
  DOUBLE_CHANCE_CONTRADICTION: 'DOUBLE_CHANCE_CONTRADICTION',
});

/**
 * Validates coherent relationship across all markets in a snapshot.
 */
export function validateMarketRelationships(markets = []) {
  const violations = [];
  const marketMap = new Map();

  for (const m of markets) {
    if (m && m.marketId) marketMap.set(m.marketId, m);
  }

  // 1. Check Dutch-Book on all exclusive partitions
  for (const m of markets) {
    if (m.status === 'OPEN' && Array.isArray(m.selections) && m.selections.length >= 2) {
      const sumInv = m.selections.reduce((acc, s) => acc + (s.odds > 0 ? 1 / s.odds : 0), 0);
      if (sumInv < 0.999) {
        violations.push({
          type: VIOLATION_TYPES.ARBITRAGE_DUTCH_BOOK,
          marketId: m.marketId,
          details: `Inverted overround detected: sum(1/odds) = ${sumInv.toFixed(4)} < 1.0`,
        });
      }
    }
  }

  // 2. Check Line Monotonicity across Totals (e.g. Over 150.5 vs Over 160.5)
  // Higher run lines MUST have lower probability (higher odds) for OVER selection
  const totalMarkets = markets.filter((m) => (m.marketId?.includes('total') || m.marketId?.includes('over')) && m.line != null);
  totalMarkets.sort((a, b) => Number(a.line) - Number(b.line));

  for (let i = 0; i < totalMarkets.length - 1; i++) {
    const lowerLine = totalMarkets[i];
    const higherLine = totalMarkets[i + 1];

    const lowerOver = lowerLine.selections?.find((s) => s.name?.includes('Over') || s.selectionId === 'over');
    const higherOver = higherLine.selections?.find((s) => s.name?.includes('Over') || s.selectionId === 'over');

    if (lowerOver && higherOver && lowerOver.odds > higherOver.odds + 0.001) {
      violations.push({
        type: VIOLATION_TYPES.MONOTONICITY_LINE_INVERSION,
        market1: lowerLine.marketId,
        market2: higherLine.marketId,
        details: `Line inversion: Over ${lowerLine.line} (odds ${lowerOver.odds}) > Over ${higherLine.line} (odds ${higherOver.odds})`,
      });
    }
  }

  // 3. Check Match Winner vs Double Chance Coherence
  const winner = marketMap.get('match_winner');
  const doubleChance = marketMap.get('double_chance');

  if (winner && doubleChance && winner.status === 'OPEN' && doubleChance.status === 'OPEN') {
    const p1 = winner.selections?.[0]?.probability ?? 0;
    const pDraw = winner.selections?.[2]?.probability ?? 0;
    const dc1X = doubleChance.selections?.find((s) => s.selectionId === '1X')?.probability ?? 0;

    // In a 3-way market, P(1X) should equal P(1) + P(X) within margin tolerance
    if (pDraw > 0 && Math.abs((p1 + pDraw) - dc1X) > 0.15) {
      violations.push({
        type: VIOLATION_TYPES.DOUBLE_CHANCE_CONTRADICTION,
        market1: 'match_winner',
        market2: 'double_chance',
        details: `Double chance P(1X)=${dc1X} contradicts P(1)+P(Draw)=${(p1 + pDraw).toFixed(4)}`,
      });
    }
  }

  return {
    coherent: violations.length === 0,
    violationsCount: violations.length,
    violations,
    checkedMarketsCount: markets.length,
    evaluatedAt: new Date().toISOString(),
  };
}
