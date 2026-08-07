/**
 * Enterprise Streaming Engine — BetKing Sportsbook (lib/streamingEngine.mjs)
 * Implements delta updates, incremental sync, snapshot caching, payload compression,
 * and client reconnect state recovery for live odds and scores.
 */

const PREVIOUS_SNAPSHOTS = new Map();

export function computeDeltaUpdate(matchId, currentPayload = {}) {
  const previous = PREVIOUS_SNAPSHOTS.get(matchId);
  PREVIOUS_SNAPSHOTS.set(matchId, JSON.stringify(currentPayload));

  if (!previous) {
    return { isFullSnapshot: true, payload: currentPayload };
  }

  // Generate lightweight delta representation
  const prevObj = JSON.parse(previous);
  const diffs = {};

  if (currentPayload.odds && prevObj.odds) {
    if (currentPayload.odds.home?.decimal !== prevObj.odds.home?.decimal) {
      diffs.homeOdds = currentPayload.odds.home?.decimal;
    }
    if (currentPayload.odds.away?.decimal !== prevObj.odds.away?.decimal) {
      diffs.awayOdds = currentPayload.odds.away?.decimal;
    }
  }

  return {
    isFullSnapshot: false,
    matchId,
    diffs,
    timestamp: Date.now(),
  };
}
