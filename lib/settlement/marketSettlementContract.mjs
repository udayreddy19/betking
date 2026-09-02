/**
 * OddsYra / BetKing — Central Market Settlement Contract
 * 
 * Authoritative source of truth declaring the settlement contract for every market type:
 * - marketPattern: Regular expression matching market_id
 * - sport: Target sport ('cricket', 'soccer', 'tennis', etc.)
 * - settlementTiming: 'IN_PLAY' | 'BALL_CONFIRMED' | 'OVER_COMPLETE' | 'INNINGS_COMPLETE' | 'MATCH_COMPLETE'
 * - resolver: Identifier of the settlement grader function
 * - requiredEvidence: Array of required scorecard or ball event fields
 * - voidPolicy: Explicit void rule when conditions are unmet
 * - supported: Boolean indicating whether the market has active settlement support
 */

export const MARKET_SETTLEMENT_CONTRACTS = [
  // 1. Match Main Markets
  {
    marketPattern: /^(match_winner|winner|1x2)/i,
    name: 'Match Winner / 1X2',
    sport: 'all',
    settlementTiming: 'MATCH_COMPLETE',
    resolver: 'openBetOutcome',
    requiredEvidence: ['match.winner', 'match.status'],
    voidPolicy: 'VOID_IF_ABANDONED_OR_NO_RESULT',
    supported: true,
  },
  {
    marketPattern: /^match_winner_super_over/i,
    name: 'Winner (incl. Super Over)',
    sport: 'cricket',
    settlementTiming: 'MATCH_COMPLETE',
    resolver: 'openBetOutcome',
    requiredEvidence: ['match.winner', 'match.superOverWinner'],
    voidPolicy: 'VOID_IF_ABANDONED_OR_NO_RESULT',
    supported: true,
  },
  {
    marketPattern: /^will_there_be_a_tie/i,
    name: 'Will There Be A Tie',
    sport: 'cricket',
    settlementTiming: 'MATCH_COMPLETE',
    resolver: 'specialMatchMarket',
    requiredEvidence: ['match.winner', 'match.team1.runs', 'match.team2.runs'],
    voidPolicy: 'VOID_IF_ABANDONED_OR_NO_RESULT',
    supported: true,
  },
  {
    marketPattern: /^double_chance/i,
    name: 'Double Chance',
    sport: 'all',
    settlementTiming: 'MATCH_COMPLETE',
    resolver: 'specialMatchMarket',
    requiredEvidence: ['match.score1', 'match.score2'],
    voidPolicy: 'VOID_IF_ABANDONED_OR_NO_RESULT',
    supported: true,
  },
  {
    marketPattern: /^most_sixes/i,
    name: 'Team To Score Most Sixes',
    sport: 'cricket',
    settlementTiming: 'MATCH_COMPLETE',
    resolver: 'mostBoundariesMarket',
    requiredEvidence: ['team1.sixes', 'team2.sixes'],
    voidPolicy: 'VOID_IF_MATCH_NOT_COMPLETED',
    supported: true,
  },
  {
    marketPattern: /^most_fours/i,
    name: 'Team To Score Most Fours',
    sport: 'cricket',
    settlementTiming: 'MATCH_COMPLETE',
    resolver: 'mostBoundariesMarket',
    requiredEvidence: ['team1.fours', 'team2.fours'],
    voidPolicy: 'VOID_IF_MATCH_NOT_COMPLETED',
    supported: true,
  },

  // 2. Boundary Totals (P0: Must precede generic team_total & match_total)
  {
    marketPattern: /^(?:i\d+_)?team_total_(fours|sixes)/i,
    name: 'Team Total Boundaries (Fours / Sixes)',
    sport: 'cricket',
    settlementTiming: 'INNINGS_COMPLETE',
    resolver: 'teamBoundaryMarket',
    requiredEvidence: ['team.fours', 'team.sixes', 'innings.status'],
    voidPolicy: 'VOID_IF_INNINGS_NOT_COMPLETED',
    supported: true,
  },
  {
    marketPattern: /^total_match_(sixes|fours|wickets)/i,
    name: 'Total Match Aggregate Boundaries/Wickets',
    sport: 'cricket',
    settlementTiming: 'MATCH_COMPLETE',
    resolver: 'matchAggregateMarket',
    requiredEvidence: ['match.totalSixes', 'match.totalFours', 'match.totalWickets'],
    voidPolicy: 'VOID_IF_MATCH_NOT_COMPLETED',
    supported: true,
  },
  {
    marketPattern: /^match_run_range/i,
    name: 'Match Run Range',
    sport: 'cricket',
    settlementTiming: 'MATCH_COMPLETE',
    resolver: 'matchAggregateMarket',
    requiredEvidence: ['team1.runs', 'team2.runs'],
    voidPolicy: 'VOID_IF_MATCH_NOT_COMPLETED',
    supported: true,
  },
  {
    marketPattern: /^btts_score_x/i,
    name: 'Both Teams To Score X+ Runs',
    sport: 'cricket',
    settlementTiming: 'MATCH_COMPLETE',
    resolver: 'specialMatchMarket',
    requiredEvidence: ['team1.runs', 'team2.runs'],
    voidPolicy: 'VOID_IF_MATCH_NOT_COMPLETED',
    supported: true,
  },

  // 3. Innings & Match Runs Totals
  {
    marketPattern: /^(?:i\d+_)?team_total/i,
    name: 'Team Total Runs',
    sport: 'cricket',
    settlementTiming: 'INNINGS_COMPLETE',
    resolver: 'totalsMarket',
    requiredEvidence: ['team.runs', 'innings.status'],
    voidPolicy: 'VOID_IF_INNINGS_NOT_COMPLETED',
    supported: true,
  },
  {
    marketPattern: /^match_total/i,
    name: 'Total Match Runs',
    sport: 'cricket',
    settlementTiming: 'MATCH_COMPLETE',
    resolver: 'totalsMarket',
    requiredEvidence: ['team1.runs', 'team2.runs'],
    voidPolicy: 'VOID_IF_MATCH_NOT_COMPLETED',
    supported: true,
  },

  // 4. Over Markets
  {
    marketPattern: /^(?:i\d+_)?next_over_\d+_total$/i,
    name: 'Next Over Total Runs',
    sport: 'cricket',
    settlementTiming: 'OVER_COMPLETE',
    resolver: 'overMarket',
    requiredEvidence: ['match_over_snapshots.runs'],
    voidPolicy: 'VOID_IF_OVER_NEVER_BOWLED',
    supported: true,
  },
  {
    marketPattern: /^(?:i\d+_)?overs_0_\d+_total$/i,
    name: 'Milestone Overs Total Runs',
    sport: 'cricket',
    settlementTiming: 'OVER_COMPLETE',
    resolver: 'overMarket',
    requiredEvidence: ['match_over_snapshots.score'],
    voidPolicy: 'VOID_IF_SHORTENED_INNINGS',
    supported: true,
  },
  {
    marketPattern: /^(?:i\d+_)?(?:current|next)_over_\d+_odd_even$/i,
    name: 'Over Odd / Even Runs',
    sport: 'cricket',
    settlementTiming: 'OVER_COMPLETE',
    resolver: 'overOddEvenMarket',
    requiredEvidence: ['match_over_snapshots.runs'],
    voidPolicy: 'VOID_IF_OVER_NEVER_BOWLED',
    supported: true,
  },

  // 5. Delivery Markets
  {
    marketPattern: /^(?:i\d+_)?next_delivery_/i,
    name: 'Next Delivery Result (Runs / OU / Boundary / Wicket)',
    sport: 'cricket',
    settlementTiming: 'BALL_CONFIRMED',
    resolver: 'deliveryMarket',
    requiredEvidence: ['match_ball_events.runs', 'match_ball_events.is_wicket'],
    voidPolicy: 'VOID_IF_BALL_NEVER_BOWLED',
    supported: true,
  },

  // 6. Wicket Markets
  {
    marketPattern: /^(?:i\d+_)?wicket_in_(?:next_)?over_\d+$/i,
    name: 'Wicket In Over',
    sport: 'cricket',
    settlementTiming: 'OVER_COMPLETE',
    resolver: 'wicketInOverMarket',
    requiredEvidence: ['match_over_snapshots.wickets'],
    voidPolicy: 'VOID_IF_OVER_NEVER_BOWLED',
    supported: true,
  },
  {
    marketPattern: /^(?:i\d+_)?team_score_at_\d+_dismissal$/i,
    name: 'Team Score at Dismissal',
    sport: 'cricket',
    settlementTiming: 'WICKET_CONFIRMED',
    resolver: 'dismissalMarket',
    requiredEvidence: ['match_dismissal_snapshots.score'],
    voidPolicy: 'VOID_IF_DISMISSAL_NEVER_OCCURRED',
    supported: true,
  },
  {
    marketPattern: /^(?:i\d+_)?method_of_next_wicket_\d+$/i,
    name: 'Method of Next Wicket',
    sport: 'cricket',
    settlementTiming: 'WICKET_CONFIRMED',
    resolver: 'methodOfDismissalMarket',
    requiredEvidence: ['match_ball_events.wicket_type'],
    voidPolicy: 'VOID_IF_DISMISSAL_NEVER_OCCURRED',
    supported: true,
  },

  // 7. Player Props
  {
    marketPattern: /^player_(25|50|75|100)_/i,
    name: 'Player Milestone Runs (25/50/75/100)',
    sport: 'cricket',
    settlementTiming: 'PLAYER_INNINGS_COMPLETE',
    resolver: 'playerPropMarket',
    requiredEvidence: ['batter.runs', 'batter.balls_faced'],
    voidPolicy: 'VOID_IF_DID_NOT_BAT',
    supported: true,
  },
  {
    marketPattern: /^player_alt_/i,
    name: 'Player Runs (Alternate Line)',
    sport: 'cricket',
    settlementTiming: 'PLAYER_INNINGS_COMPLETE',
    resolver: 'playerPropMarket',
    requiredEvidence: ['batter.runs', 'batter.balls_faced'],
    voidPolicy: 'VOID_IF_DID_NOT_BAT',
    supported: true,
  },
  {
    marketPattern: /^top_batter/i,
    name: 'Team Top Batter',
    sport: 'cricket',
    settlementTiming: 'INNINGS_COMPLETE',
    resolver: 'topBatterMarket',
    requiredEvidence: ['innings.scorecard.batters'],
    voidPolicy: 'VOID_IF_INNINGS_INCOMPLETE',
    supported: true,
  },

  // 8. Head-To-Head Markets
  {
    marketPattern: /^batter_h2h_(runs|sixes)/i,
    name: 'Batter Head-To-Head Runs / Sixes',
    sport: 'cricket',
    settlementTiming: 'INNINGS_COMPLETE',
    resolver: 'batterH2HMarket',
    requiredEvidence: ['batter1.runs', 'batter2.runs', 'batter1.sixes', 'batter2.sixes'],
    voidPolicy: 'VOID_IF_EITHER_BATTER_DNB',
    supported: true,
  },

  // 9. Soccer & Multi-Sport Markets
  {
    marketPattern: /^(btts|goals_line)/i,
    name: 'Soccer BTTS / Total Goals Line',
    sport: 'soccer',
    settlementTiming: 'MATCH_COMPLETE',
    resolver: 'soccerGoalsMarket',
    requiredEvidence: ['match.score1', 'match.score2'],
    voidPolicy: 'VOID_IF_MATCH_CANCELLED',
    supported: true,
  },
  {
    marketPattern: /^dnb$/i,
    name: 'Draw No Bet',
    sport: 'soccer',
    settlementTiming: 'MATCH_COMPLETE',
    resolver: 'soccerChanceMarket',
    requiredEvidence: ['match.score1', 'match.score2'],
    voidPolicy: 'VOID_IF_DRAW',
    supported: true,
  },
  {
    marketPattern: /^spread$/i,
    name: 'Point Spread',
    sport: 'all',
    settlementTiming: 'MATCH_COMPLETE',
    resolver: 'scoreSpreadMarket',
    requiredEvidence: ['match.score1', 'match.score2'],
    voidPolicy: 'VOID_IF_PUSH_OR_MATCH_CANCELLED',
    supported: true,
  },
  {
    marketPattern: /^(total_pts|total_games|total_points|total_sets)$/i,
    name: 'Score-sport totals',
    sport: 'all',
    settlementTiming: 'MATCH_COMPLETE',
    resolver: 'scoreTotalMarket',
    requiredEvidence: ['match.score1', 'match.score2'],
    voidPolicy: 'VOID_IF_MATCH_CANCELLED',
    supported: true,
  },
  {
    marketPattern: /^set1_winner$/i,
    name: 'Set 1 Winner',
    sport: 'all',
    settlementTiming: 'MATCH_COMPLETE',
    resolver: 'setWinnerMarket',
    requiredEvidence: ['liveDetails.sets1', 'liveDetails.sets2'],
    voidPolicy: 'VOID_IF_SET_SCORES_MISSING',
    supported: true,
  },
];

/**
 * Resolve the settlement contract definition for a given marketId.
 */
export function resolveMarketContract(marketId) {
  const id = String(marketId || '');
  for (const contract of MARKET_SETTLEMENT_CONTRACTS) {
    if (contract.marketPattern.test(id)) {
      return contract;
    }
  }
  return null;
}

/**
 * Validates whether a market definition satisfies all prerequisites for publishing and bet placement.
 * Enforces the strict invariant: NO GENERATED MARKET CAN BE BETTABLE WITHOUT A DETERMINISTIC SETTLEMENT PATH.
 * 
 * @param {Object} market - The generated market definition
 * @returns {Object} Compatibility result
 */
export function validateMarketSettlementCompatibility(market) {
  if (!market || !market.marketId) {
    return {
      compatible: false,
      reason: 'INVALID_MARKET: Missing market definition or marketId',
      resolver: null,
      missingEvidence: [],
      supported: false,
    };
  }

  const contract = resolveMarketContract(market.marketId);
  if (!contract) {
    return {
      compatible: false,
      reason: `ORPHAN_MARKET: No registered settlement contract for marketId '${market.marketId}'`,
      resolver: null,
      missingEvidence: ['contract_definition'],
      supported: false,
    };
  }

  if (!contract.supported || !contract.resolver) {
    return {
      compatible: false,
      reason: `UNSUPPORTED_MARKET: Contract for '${market.marketId}' is flagged supported=false or missing resolver`,
      resolver: contract.resolver,
      missingEvidence: contract.requiredEvidence || [],
      supported: false,
    };
  }

  return {
    compatible: true,
    reason: 'COMPATIBLE',
    resolver: contract.resolver,
    settlementTiming: contract.settlementTiming,
    voidPolicy: contract.voidPolicy,
    supported: true,
  };
}
