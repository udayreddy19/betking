/**
 * Central parlay (accumulator) settlement policy.
 * All legs must win for the bet to win; any definitive loss loses the whole bet.
 * Configurable VOID policy: VOID_ENTIRE_BET (default) or REDUCE_LEG_ODDS.
 */

export const ACCUMULATOR_VOID_POLICIES = {
  VOID_ENTIRE_BET: 'VOID_ENTIRE_BET',
  REDUCE_LEG_ODDS: 'REDUCE_LEG_ODDS',
};

export const DEFAULT_ACCA_POLICY = process.env.ACCUMULATOR_VOID_POLICY || ACCUMULATOR_VOID_POLICIES.VOID_ENTIRE_BET;

export function combineParlayLegOutcomes(legOutcomes = [], options = {}) {
  if (!legOutcomes.length) {
    return { outcome: null, reason: 'acca_no_legs', legOutcomes: [] };
  }

  const voidPolicy = options.voidPolicy || DEFAULT_ACCA_POLICY;
  let pending = 0;
  let wonCount = 0;
  let anyLost = false;
  let voidCount = 0;

  for (const leg of legOutcomes) {
    if (!leg || leg.outcome == null) {
      pending += 1;
      continue;
    }
    const o = String(leg.outcome).toUpperCase();
    if (o === 'LOST') anyLost = true;
    else if (o === 'VOID' || o === 'PUSH' || o === 'CANCELLED' || o === 'ABANDONED') voidCount += 1;
    else if (o === 'WON') wonCount += 1;
    else pending += 1;
  }

  if (anyLost) {
    return { outcome: 'LOST', reason: 'acca_leg_lost', legOutcomes, voidCount, wonCount };
  }
  if (pending > 0) {
    return { outcome: null, reason: 'acca_legs_pending', legOutcomes, voidCount, wonCount };
  }

  if (voidCount > 0) {
    if (voidPolicy === ACCUMULATOR_VOID_POLICIES.REDUCE_LEG_ODDS) {
      if (wonCount > 0) {
        return {
          outcome: 'WON',
          reason: 'acca_won_with_void_legs_reduced',
          voidLegsReduced: true,
          voidCount,
          wonCount,
          legOutcomes,
        };
      }
      return { outcome: 'VOID', reason: 'acca_all_legs_void', legOutcomes, voidCount, wonCount: 0 };
    }
    return { outcome: 'VOID', reason: 'acca_leg_void', legOutcomes, voidCount, wonCount };
  }

  return { outcome: 'WON', reason: 'acca_all_legs_won', legOutcomes, voidCount: 0, wonCount };
}
