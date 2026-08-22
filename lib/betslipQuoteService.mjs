/**
 * Quote current server odds for betslip selections (refresh + pre-place sync).
 */

import { resolveServerOdds } from './oddsQuoteService.mjs';

export async function quoteBetslipSelections(selections = []) {
  const quoted = [];
  const updates = [];

  for (const sel of selections) {
    const matchId = sel.matchId;
    const marketId = sel.marketId || 'match_winner';
    const selectionId = sel.selectionId || sel.selection;
    const clientOdds = sel.odds ?? sel.clientOdds ?? null;

    const result = await resolveServerOdds({
      matchId,
      marketId,
      selectionId,
      clientOdds,
      selectionName: sel.selectionName || sel.name || null,
    });

    const nextOdds = Number(result.odds);
    quoted.push({
      matchId,
      marketId,
      selectionId,
      selectionName: sel.selectionName || sel.name || selectionId,
      odds: nextOdds,
      changed: Boolean(result.changed),
      previousOdds: result.previousOdds,
    });

    if (result.changed) {
      updates.push({
        matchId,
        marketId,
        selectionId,
        selectionName: sel.selectionName || sel.name || selectionId,
        previousOdds: result.previousOdds,
        odds: nextOdds,
      });
    }
  }

  return { selections: quoted, updates };
}
