/**
 * OddsEngineV3 — Historical Replay & Price Backtest Engine
 * 
 * Re-runs deterministic odds generation for past match events to verify:
 * - Determinism: Did past inputs generate identical odds?
 * - Price Divergence: What would new models have priced vs. actual recorded odds?
 */

import { generate } from '../OddsEngineV3.mjs';

/**
 * Replays match state and compares generated snapshot with historical recorded odds.
 * 
 * @param {Object} historicalEvent
 * @param {Object} historicalEvent.matchState
 * @param {Array} [historicalEvent.recordedOdds]
 * @param {Object} [configOverride]
 * @returns {{
 *   matchId: string,
 *   replayDeterministic: boolean,
 *   snapshot: Object,
 *   comparisons: Array<{ marketId: string, selectionId: string, recordedOdds: number, replayedOdds: number, delta: number }>
 * }}
 */
export function replayHistoricalOdds(historicalEvent = {}, configOverride = {}) {
  const { matchState, recordedOdds = [] } = historicalEvent;
  if (!matchState) {
    throw new Error('HistoricalReplayEngine: matchState is required for replay');
  }

  const snapshot = generate(matchState, configOverride);
  const comparisons = [];
  let isDeterministic = true;

  const recordedMap = new Map();
  for (const item of recordedOdds) {
    recordedMap.set(`${item.marketId}::${item.selectionId}`, item.odds);
  }

  for (const market of snapshot.markets || []) {
    for (const sel of market.selections || []) {
      const rec = recordedMap.get(`${market.marketId}::${sel.selectionId}`);
      if (rec != null) {
        const delta = Number((sel.odds - rec).toFixed(4));
        if (Math.abs(delta) > 0.001) isDeterministic = false;
        comparisons.push({
          marketId: market.marketId,
          selectionId: sel.selectionId,
          recordedOdds: rec,
          replayedOdds: sel.odds,
          delta,
        });
      }
    }
  }

  return {
    matchId: matchState.matchId || matchState.id,
    replayDeterministic: isDeterministic,
    snapshotStatus: snapshot.status,
    totalMarkets: snapshot.markets?.length || 0,
    comparisons,
  };
}
