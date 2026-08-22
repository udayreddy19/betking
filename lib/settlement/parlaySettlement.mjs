/**
 * Central parlay (accumulator) settlement policy.
 * All legs must win for the bet to win; any definitive loss loses the whole bet.
 * VOID legs void the entire accumulator (standard refund policy).
 */

export function combineParlayLegOutcomes(legOutcomes = []) {
  if (!legOutcomes.length) {
    return { outcome: null, reason: 'acca_no_legs' };
  }

  let pending = 0;
  let anyLost = false;
  let anyVoid = false;

  for (const leg of legOutcomes) {
    if (!leg || leg.outcome == null) {
      pending += 1;
      continue;
    }
    const o = String(leg.outcome).toUpperCase();
    if (o === 'LOST') anyLost = true;
    else if (o === 'VOID' || o === 'PUSH') anyVoid = true;
    else if (o !== 'WON') pending += 1;
  }

  if (anyLost) {
    return { outcome: 'LOST', reason: 'acca_leg_lost' };
  }
  if (pending > 0) {
    return { outcome: null, reason: 'acca_legs_pending' };
  }
  if (anyVoid) {
    return { outcome: 'VOID', reason: 'acca_leg_void' };
  }
  return { outcome: 'WON', reason: 'acca_all_legs_won' };
}
