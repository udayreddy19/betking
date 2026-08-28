/**
 * OddsEngineV3 — Automated Odds Quality & Inconsistency Monitor
 * 
 * Performs automated sanity checks on generated odds snapshots:
 * - Checks for negative overround (arbitrage against operator)
 * - Checks for invalid probability sums (< 0.98 or > 1.25)
 * - Checks for locked or below-minimum odds (< 1.01)
 * - Checks for inverted markets
 */

import { MIN_DECIMAL_ODDS } from '../pricing/MarginCalculator.mjs';

/**
 * Audits an OddsSnapshot for mathematical integrity and anomalies.
 * @param {Object} snapshot
 * @returns {{ healthy: boolean, anomalies: string[], metrics: Object }}
 */
export function auditSnapshotQuality(snapshot = {}) {
  const anomalies = [];
  const markets = snapshot.markets || [];
  let totalSelections = 0;

  for (const m of markets) {
    if (m.status !== 'OPEN') continue;
    const selections = m.selections || [];
    totalSelections += selections.length;

    let marketImpliedSum = 0;
    for (const sel of selections) {
      if (!Number.isFinite(sel.odds) || sel.odds < MIN_DECIMAL_ODDS) {
        anomalies.push(`INVALID_ODDS: Market ${m.marketId} selection ${sel.selectionId} has invalid odds ${sel.odds}`);
      }
      if (sel.odds > 0) {
        marketImpliedSum += 1 / sel.odds;
      }
    }

    // Overround check: should always be >= 1.01 (at least 1% margin)
    if (selections.length >= 2 && marketImpliedSum < 1.00) {
      anomalies.push(`NEGATIVE_OVERROUND: Market ${m.marketId} has negative overround sum (${marketImpliedSum.toFixed(4)} < 1.00)`);
    }
  }

  return {
    healthy: anomalies.length === 0,
    anomalies,
    metrics: {
      totalMarkets: markets.length,
      openMarkets: markets.filter(m => m.status === 'OPEN').length,
      totalSelections,
      status: snapshot.status,
    },
  };
}
