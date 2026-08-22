/**
 * Immutable placement context captured at bet acceptance — used for settlement audit.
 */

import { parseOuLine } from './odds-v3/lineIdentity.mjs';

/** Parse canonical market instance identity from market_id (no hardcoded results). */
export function parseMarketInstance(marketId) {
  const id = String(marketId || '').trim();
  if (!id) return { type: 'UNKNOWN', marketId: id };

  const delivery = id.match(/^(?:i(\d+)_)?next_delivery_([a-z]+)_(\d+)_(\d+)$/i);
  if (delivery) {
    return {
      type: 'NEXT_DELIVERY',
      marketType: `NEXT_DELIVERY_${delivery[2].toUpperCase()}`,
      innings: delivery[1] != null ? Number(delivery[1]) : 1,
      over: Number(delivery[3]),
      ball: Number(delivery[4]),
      instanceKey: `NEXT_DELIVERY:I${delivery[1] ?? 1}:O${delivery[3]}:B${delivery[4]}`,
    };
  }

  const nextOver = id.match(/^(?:i(\d+)_)?next_over_(\d+)_total$/i);
  if (nextOver) {
    return {
      type: 'NEXT_OVER_TOTAL',
      marketType: 'OVER_TOTAL_RUNS',
      innings: nextOver[1] != null ? Number(nextOver[1]) : null,
      over: Number(nextOver[2]),
      instanceKey: `OVER_TOTAL:I${nextOver[1] ?? 'X'}:O${nextOver[2]}`,
    };
  }

  const milestone = id.match(/^(?:i(\d+)_)?overs_0_(\d+)_total$/i);
  if (milestone) {
    return {
      type: 'MILESTONE_OVER_TOTAL',
      marketType: 'INNINGS_MILESTONE_TOTAL',
      innings: milestone[1] != null ? Number(milestone[1]) : null,
      over: Number(milestone[2]),
      instanceKey: `MILESTONE:I${milestone[1] ?? 'X'}:O${milestone[2]}`,
    };
  }

  const dismissal = id.match(/^(?:i(\d+)_)?team_score_at_(\d+)_dismissal$/i);
  if (dismissal) {
    return {
      type: 'DISMISSAL_SCORE',
      marketType: 'FALL_OF_WICKET',
      innings: dismissal[1] != null ? Number(dismissal[1]) : null,
      wicket: Number(dismissal[2]),
      instanceKey: `FOW:I${dismissal[1] ?? 'X'}:W${dismissal[2]}`,
    };
  }

  if (/^match_winner/i.test(id)) {
    return { type: 'MATCH_WINNER', marketType: 'MATCH_WINNER', instanceKey: 'MATCH_WINNER' };
  }
  if (/^match_total/i.test(id)) {
    return { type: 'MATCH_TOTAL', marketType: 'MATCH_TOTAL', instanceKey: 'MATCH_TOTAL' };
  }
  if (/^team_total/i.test(id)) {
    return { type: 'TEAM_TOTAL', marketType: 'TEAM_TOTAL', instanceKey: id };
  }

  return { type: 'UNKNOWN', marketId: id, instanceKey: id };
}

export function buildLegPlacementContext(sel) {
  const marketId = sel.marketId || sel.market_id;
  const selectionId = sel.selectionId || sel.selection_id;
  const selectionName = sel.selectionName || sel.selection_name || selectionId;
  const line = parseOuLine(selectionName) ?? parseOuLine(selectionId);
  const instance = parseMarketInstance(marketId);

  return {
    matchId: sel.matchId || sel.match_id,
    marketId,
    selectionId,
    selectionName,
    odds: Number(sel.odds),
    line,
    marketType: instance.marketType || instance.type,
    marketName: sel.marketName || sel.market_name || null,
    marketInstance: instance,
    selectionSide: /\bover\b/i.test(`${selectionId} ${selectionName}`) && !/\bunder\b/i.test(`${selectionId} ${selectionName}`)
      ? 'OVER'
      : (/\bunder\b/i.test(`${selectionId} ${selectionName}`) ? 'UNDER' : null),
  };
}

export function buildPlacementSnapshot({
  betType,
  validatedSelections = [],
  stateVersion = null,
  oddsVersion = null,
  matchOversAtPlacement = null,
  inningsAtPlacement = null,
}) {
  const legs = validatedSelections.map(buildLegPlacementContext);
  return {
    capturedAt: new Date().toISOString(),
    betType,
    stateVersionAtPlacement: stateVersion,
    oddsVersionAtPlacement: oddsVersion,
    oversAtPlacement: matchOversAtPlacement,
    inningsAtPlacement,
    legs,
  };
}
