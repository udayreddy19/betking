/**
 * Read immutable placement context from bets.placement_snapshot at settlement time.
 */

import { parseMarketInstance } from '../placementSnapshot.mjs';
import { parseOuLine } from '../odds-v3/lineIdentity.mjs';

export function parsePlacementSnapshot(bet) {
  const raw = bet?.placement_snapshot;
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getPrimaryLegContext(bet) {
  const snap = parsePlacementSnapshot(bet);
  if (!snap?.legs?.length) return null;
  return snap.legs[0];
}

/** Prefer line frozen at placement over re-parsing selection text. */
export function resolveSettlementLine(bet, selectionId, selectionName) {
  const leg = getPrimaryLegContext(bet);
  if (leg?.line != null && Number.isFinite(Number(leg.line))) {
    return Number(leg.line);
  }
  return parseOuLine(selectionName) ?? parseOuLine(selectionId);
}

export function resolveMarketInstanceKey(bet, marketId) {
  const leg = getPrimaryLegContext(bet);
  if (leg?.marketInstance?.instanceKey) {
    return leg.marketInstance.instanceKey;
  }
  return parseMarketInstance(marketId).instanceKey || marketId;
}

export function resolvePlacementOverBall(bet, marketId) {
  const leg = getPrimaryLegContext(bet);
  if (leg?.marketInstance) {
    return {
      over: leg.marketInstance.over ?? null,
      ball: leg.marketInstance.ball ?? null,
      innings: leg.marketInstance.innings ?? null,
    };
  }
  const inst = parseMarketInstance(marketId);
  return { over: inst.over ?? null, ball: inst.ball ?? null, innings: inst.innings ?? null };
}
