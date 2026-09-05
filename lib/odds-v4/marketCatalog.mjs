/**
 * OddsEngineV4 live catalog policy.
 * Wider than V3 compact — keep all settlement-supported cricket markets.
 */

/**
 * @param {string} marketId
 * @returns {boolean} true = drop from V4 live snapshot
 */
export function shouldSkipV4LiveMarket(marketId = '') {
  return !String(marketId || '').trim();
}

/** Families unlocked vs V3 compact skip (for docs / tests). */
export const V4_UNLOCKED_VS_COMPACT = Object.freeze([
  'will_there_be_a_tie',
  'double_chance',
  'most_sixes',
  'most_fours',
  'total_match_wickets',
  'total_match_fours',
  'total_match_sixes',
  'team_total_alt_high',
  'team_total_alt_low',
  'team_total_fours',
  'team_total_sixes',
  'batter_h2h_runs',
  'batter_h2h_sixes',
  'top_batter',
  'method_of_next_wicket',
  'odd_even',
  'match_run_range',
  'btts_score_x',
]);
