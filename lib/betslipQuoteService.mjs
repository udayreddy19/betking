/**
 * Quote current server odds for betslip selections (refresh + pre-place sync).
 */

import { loadLiveOddsSnapshot, resolveServerOddsFromSnapshot } from './oddsQuoteService.mjs';
import { calculateSgpJointOdds } from './odds-v3/pricing/correlationEngine.mjs';

export async function quoteBetslipSelections(selections = []) {
  const quoted = [];
  const updates = [];

  const matchIds = [...new Set(selections.map((sel) => sel.matchId).filter(Boolean))];
  const snapshots = new Map();
  await Promise.all(matchIds.map(async (matchId) => {
    snapshots.set(matchId, await loadLiveOddsSnapshot(matchId));
  }));

  for (const sel of selections) {
    const matchId = sel.matchId;
    const marketId = sel.marketId || 'match_winner';
    const selectionId = sel.selectionId || sel.selection;
    const clientOdds = sel.odds ?? sel.clientOdds ?? null;
    const liveSnap = snapshots.get(matchId);

    const result = resolveServerOddsFromSnapshot(liveSnap, {
      matchId,
      marketId,
      selectionId,
      clientOdds,
      selectionName: sel.selectionName || sel.name || null,
    });

    const nextOdds = Number(result.odds);
    const resolvedMarketId = result.marketId || marketId;
    const resolvedSelectionId = result.selectionId || selectionId;

    quoted.push({
      matchId,
      marketId: resolvedMarketId,
      selectionId: resolvedSelectionId,
      selectionName: sel.selectionName || sel.name || selectionId,
      odds: nextOdds,
      changed: Boolean(result.changed),
      previousOdds: result.previousOdds,
    });

    if (result.changed) {
      updates.push({
        matchId,
        marketId: resolvedMarketId,
        selectionId: resolvedSelectionId,
        selectionName: sel.selectionName || sel.name || selectionId,
        previousOdds: result.previousOdds,
        odds: nextOdds,
      });
    }
  }

  const matchIdsQuoted = [...new Set(quoted.map((q) => q.matchId).filter(Boolean))];
  let sgp = null;
  if (matchIdsQuoted.length === 1 && quoted.length >= 2) {
    const liveSnap = snapshots.get(matchIdsQuoted[0]);
    const copulaLegs = quoted.map((q) => {
      const market = (liveSnap?.markets || []).find((m) => m.marketId === q.marketId);
      const sel = (market?.selections || market?.options || []).find((s) => String(s.selectionId) === String(q.selectionId));
      return {
        marketType: String(q.marketId || '').replace(/_alt_.*$/, '').replace(/_i\d+.*$/, ''),
        probability: Number(sel?.probability) || (Number(q.odds) > 1 ? 1 / Number(q.odds) : 0.5),
        isSameTeam: true,
      };
    });
    sgp = calculateSgpJointOdds(copulaLegs);
  }

  return { selections: quoted, updates, sgp };
}
