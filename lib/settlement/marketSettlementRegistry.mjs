/**
 * Central registry mapping market templates → liveMatchSettlement graders.
 * Pricing lives in odds-v3/marketRegistry; settlement routes here.
 * 
 * CRITICAL MATCHER ORDERING INVARIANT:
 * Specific boundary matchers (e.g. TEAM_TOTAL_BOUNDARIES) MUST precede generic
 * runs matchers (TEAM_TOTAL) to prevent boundary markets from being evaluated as runs.
 */

export const MARKET_SETTLEMENT_REGISTRY = {
  // 0. Score-sport markets (must precede cricket SPECIAL_MATCH / MATCH_TOTAL)
  SOCCER_DNB: {
    pattern: /^dnb$/i,
    grader: 'soccerChanceMarket',
    boundary: 'MATCH_COMPLETE',
  },
  SCORE_SPREAD: {
    pattern: /^spread$/i,
    grader: 'scoreSpreadMarket',
    boundary: 'MATCH_COMPLETE',
  },
  SCORE_TOTAL: {
    pattern: /^(total_pts|total_games|total_points|total_sets)$/i,
    grader: 'scoreTotalMarket',
    boundary: 'MATCH_COMPLETE',
  },
  SET_WINNER: {
    pattern: /^set1_winner$/i,
    grader: 'setWinnerMarket',
    boundary: 'MATCH_COMPLETE',
  },

  // 1. Match Winner & Super Over
  MATCH_WINNER: {
    pattern: /^(match_winner|winner|1x2)/i,
    grader: 'openBetOutcome',
    boundary: 'MATCH_COMPLETE',
  },

  // 2. Special Match Markets (Tie, cricket Double Chance, BTTS Runs)
  // Soccer double_chance still matches here; evaluateSpecialMatchBet routes soccer to FT scores.
  SPECIAL_MATCH: {
    pattern: /^(will_there_be_a_tie|double_chance|btts_score_x)/i,
    grader: 'specialMatchMarket',
    boundary: 'MATCH_COMPLETE',
  },

  // 3. Most Boundaries (Team Most Fours / Sixes)
  MOST_BOUNDARIES: {
    pattern: /^(most_sixes|most_fours)/i,
    grader: 'mostBoundariesMarket',
    boundary: 'MATCH_COMPLETE',
  },

  // 4. Boundary Totals (P0 ORDERING: Placed BEFORE generic TEAM_TOTAL / MATCH_TOTAL)
  TEAM_TOTAL_BOUNDARIES: {
    pattern: /^(?:i\d+_)?team_total_(fours|sixes)/i,
    grader: 'teamBoundaryMarket',
    boundary: 'INNINGS_COMPLETE',
  },

  MATCH_AGGREGATE: {
    pattern: /^(total_match_(sixes|fours|wickets)|match_run_range)/i,
    grader: 'matchAggregateMarket',
    boundary: 'MATCH_COMPLETE',
  },

  // 5. Over Markets (Totals & Odd/Even)
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
  OVER_ODD_EVEN: {
    pattern: /^(?:i\d+_)?(?:current|next)_over_\d+_odd_even$/i,
    grader: 'overOddEvenMarket',
    boundary: 'OVER_COMPLETE',
  },

  // 6. Delivery Markets (In-Play Ball-by-Ball)
  NEXT_DELIVERY: {
    pattern: /^(?:i\d+_)?next_delivery_/i,
    grader: 'deliveryMarket',
    boundary: 'BALL_CONFIRMED',
  },

  // 7. Wicket & Dismissal Markets
  DISMISSAL_SCORE: {
    pattern: /^(?:i\d+_)?team_score_at_\d+_dismissal$/i,
    grader: 'dismissalMarket',
    boundary: 'WICKET_CONFIRMED',
  },
  METHOD_OF_DISMISSAL: {
    pattern: /^(?:i\d+_)?method_of_next_wicket_\d+$/i,
    grader: 'methodOfDismissalMarket',
    boundary: 'WICKET_CONFIRMED',
  },
  WICKET_IN_OVER: {
    pattern: /^(?:i\d+_)?wicket_in_(?:next_)?over_\d+$/i,
    grader: 'wicketInOverMarket',
    boundary: 'OVER_COMPLETE',
  },

  // 8. Innings & Match Runs Totals (Generic Runs fallbacks)
  TEAM_TOTAL: {
    pattern: /^(?:i\d+_)?team_total/i,
    grader: 'totalsMarket',
    boundary: 'INNINGS_COMPLETE',
  },
  MATCH_TOTAL: {
    pattern: /^match_total/i,
    grader: 'totalsMarket',
    boundary: 'MATCH_COMPLETE',
  },

  // 9. Player Props & Head-to-Head
  PLAYER_MILESTONE: {
    pattern: /^player_(25|50|75|100)_/i,
    grader: 'playerPropMarket',
    boundary: 'PLAYER_INNINGS_COMPLETE',
  },
  PLAYER_RUNS_ALT: {
    pattern: /^player_alt_/i,
    grader: 'playerPropMarket',
    boundary: 'PLAYER_INNINGS_COMPLETE',
  },
  TOP_BATTER: {
    pattern: /^top_batter/i,
    grader: 'topBatterMarket',
    boundary: 'INNINGS_COMPLETE',
  },
  BATTER_H2H: {
    pattern: /^batter_h2h_(runs|sixes)/i,
    grader: 'batterH2HMarket',
    boundary: 'INNINGS_COMPLETE',
  },

  // 10. Multi-Sport & Soccer
  SOCCER_GOALS: {
    pattern: /^(btts|goals_line)/i,
    grader: 'soccerGoalsMarket',
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
