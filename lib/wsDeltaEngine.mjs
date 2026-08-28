/**
 * WebSocket Delta Compression Engine
 * 
 * Computes difference deltas between successive market snapshots.
 * Only transmits modified selection prices and statuses rather than full match trees.
 */

const PREVIOUS_SNAPSHOT_MAP = new Map();

/**
 * Compute compact diff delta between old and new snapshot
 * @param {string} matchId
 * @param {object} newSnapshot
 * @returns {object} { type: 'DELTA'|'FULL', matchId, stateVersion, changedMarkets }
 */
export function computeSnapshotDelta(matchId, newSnapshot) {
  if (!matchId || !newSnapshot || !Array.isArray(newSnapshot.markets)) {
    return { type: 'FULL', matchId, snapshot: newSnapshot };
  }

  const prev = PREVIOUS_SNAPSHOT_MAP.get(matchId);
  if (!prev || !Array.isArray(prev.markets)) {
    PREVIOUS_SNAPSHOT_MAP.set(matchId, newSnapshot);
    return { type: 'FULL', matchId, stateVersion: newSnapshot.stateVersion, markets: newSnapshot.markets };
  }

  const prevMarketMap = new Map(prev.markets.map((m) => [m.marketId, m]));
  const changedMarkets = [];

  for (const nextM of newSnapshot.markets) {
    const prevM = prevMarketMap.get(nextM.marketId);
    if (!prevM) {
      // New market added
      changedMarkets.push(nextM);
      continue;
    }

    const changedSelections = [];
    const prevSelMap = new Map((prevM.selections || []).map((s) => [s.id, s]));

    for (const nextS of nextM.selections || []) {
      const prevS = prevSelMap.get(nextS.id);
      if (!prevS || prevS.price !== nextS.price || prevS.suspended !== nextS.suspended) {
        changedSelections.push({
          id: nextS.id,
          price: nextS.price,
          prob: nextS.prob,
          suspended: nextS.suspended,
        });
      }
    }

    if (changedSelections.length > 0 || prevM.status !== nextM.status) {
      changedMarkets.push({
        marketId: nextM.marketId,
        status: nextM.status,
        selections: changedSelections,
      });
    }
  }

  PREVIOUS_SNAPSHOT_MAP.set(matchId, newSnapshot);

  return {
    type: 'DELTA',
    matchId,
    stateVersion: newSnapshot.stateVersion,
    status: newSnapshot.status,
    changedCount: changedMarkets.length,
    markets: changedMarkets,
    timestamp: Date.now(),
  };
}

/**
 * Clear cached delta history for a match
 */
export function clearDeltaHistory(matchId) {
  PREVIOUS_SNAPSHOT_MAP.delete(matchId);
}
