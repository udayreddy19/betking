/**
 * Central registry mapping market templates → liveMatchSettlement graders.
 * Pricing lives in odds-v3/marketRegistry; settlement routes here.
 */

export const MARKET_SETTLEMENT_REGISTRY = {
  MATCH_WINNER: {
    pattern: /^(match_winner|winner|1x2)/i,
    grader: 'openBetOutcome',
    boundary: 'MATCH_COMPLETE',
  },
  NEXT_OVER_TOTAL: {
    pattern: /^(?:i\d+_)?next_over_\d+_total$/i,
    grader: 'overMarket',
    boundary: 'OVER_COMPLETE',
  },
  MILESTONE_OVER_TOTAL: {
    pattern: /^(?:i\d+_)?overs_0_\d+_total$/i,
    grader: 'overMarket',
    boundary: 'OVER_COMPLETE',
  },
  NEXT_DELIVERY: {
    pattern: /next_delivery_/i,
    grader: 'deliveryMarket',
    boundary: 'BALL_CONFIRMED',
  },
  DISMISSAL_SCORE: {
    pattern: /^(?:i\d+_)?team_score_at_\d+_dismissal$/i,
    grader: 'dismissalMarket',
    boundary: 'WICKET_CONFIRMED',
  },
  TEAM_TOTAL: {
    pattern: /^team_total/i,
    grader: 'totalsMarket',
    boundary: 'INNINGS_COMPLETE',
  },
  MATCH_TOTAL: {
    pattern: /^match_total/i,
    grader: 'totalsMarket',
    boundary: 'MATCH_COMPLETE',
  },
};

export function getSettlementBoundary(marketId) {
  const id = String(marketId || '');
  for (const [name, entry] of Object.entries(MARKET_SETTLEMENT_REGISTRY)) {
    if (entry.pattern.test(id)) return { marketType: name, boundary: entry.boundary };
  }
  return { marketType: 'UNKNOWN', boundary: 'MATCH_COMPLETE' };
}

export function resolveSettlementGrader(marketId) {
  const id = String(marketId || '');
  for (const entry of Object.values(MARKET_SETTLEMENT_REGISTRY)) {
    if (entry.pattern.test(id)) return entry.grader;
  }
  return null;
}
