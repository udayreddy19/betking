/**
 * OddsEngineV3 — Public API Adapter
 * 
 * Transforms V3 OddsSnapshot into the standard public API response contract.
 * Preserves all V3 probabilities, fair odds, margins, and final odds without alteration.
 */

/**
 * Transforms a raw OddsSnapshot from OddsEngineV3 into the public API contract format.
 * 
 * @param {import('../models/OddsSnapshot.mjs').OddsSnapshot} v3Snapshot
 * @param {Object} [matchObj]
 * @returns {Object} Public API contract snapshot
 */
export function adaptV3SnapshotToPublicContract(v3Snapshot, matchObj = {}) {
  if (!v3Snapshot) return null;

  const now = v3Snapshot.generatedAt || Date.now();
  const expiresAt = new Date(now + 10000).toISOString();
  const oddsVersion = v3Snapshot.oddsVersion || 1;

  const adaptedMarkets = (v3Snapshot.markets || []).map((m) => {
    const adaptedSelections = (m.selections || []).map((s) => ({
      selectionId: s.selectionId,
      selection: s.selectionId,
      name: s.name,
      probability: s.probability,
      fairOdds: s.fairOdds,
      margin: s.margin,
      finalProbability: s.finalProbability,
      odds: s.odds,
      status: m.status === 'OPEN' ? 'ACTIVE' : m.status,
      bettable: m.status === 'OPEN' && s.odds > 1.0,
      won: s.won || false,
    }));

    const key = m.marketId === 'match_winner' ? 'winner' : (m.marketId === 'team_total' ? 'team1_runs' : (m.marketId === 'match_total' ? 'match_total_runs' : m.marketId));
    const rawCat = m.category || (m.marketId === 'match_winner' ? 'main' : 'totals');
    const categoryMap = {
      main: 'main',
      totals: 'totals',
      overs: 'over',
      over: 'over',
      deliveries: 'delivery',
      delivery: 'delivery',
      wickets: 'partnership',
      partnership: 'partnership',
      player_props: 'props',
      props: 'props',
      h2h: 'props',
    };
    const category = categoryMap[rawCat] || rawCat;

    return {
      marketId: m.marketId,
      key,
      marketType: m.marketType,
      name: m.name,
      title: m.name,
      category,
      categoryGroup: category,
      status: m.status,
      line: m.line,
      selections: adaptedSelections,
      options: adaptedSelections,
    };
  });

  return {
    success: true,
    engine: v3Snapshot.engine || 'OddsEngineV3',
    engineVersion: v3Snapshot.engineVersion || '3.0.0',
    matchId: v3Snapshot.matchId,
    stateVersion: v3Snapshot.stateVersion,
    oddsVersion,
    generatedAt: new Date(now).toISOString(),
    expiresAt,
    status: v3Snapshot.status,
    markets: adaptedMarkets,
    source: 'ODDS_ENGINE_V3',
  };
}
