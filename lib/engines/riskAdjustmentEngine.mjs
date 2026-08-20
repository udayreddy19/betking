/**
 * Risk & Exposure Adjustment Engine (lib/engines/riskAdjustmentEngine.mjs)
 * Adjusts prices based on market exposure/liabilities or suspends markets if risk limits are breached.
 * Keeps probability, pricing, and risk adjustment strictly separate.
 */

import {
  getMarketLiabilityAggregate,
  getSelectionLiability,
  recordSelectionLiability,
} from '../marketLiabilityStore.mjs';

export class RiskAdjustmentEngine {
  getMarketLiability(marketId) {
    return getMarketLiabilityAggregate(marketId);
  }

  async recordBetLiability(marketId, selection, stake, potentialPayout) {
    await recordSelectionLiability({
      marketId,
      selectionId: String(selection || ''),
      stake,
      potentialPayout,
    });
    return this.getMarketLiability(marketId);
  }

  /**
   * High liability on a selection → lengthen that price (lower its probability)
   * so the book stops attracting the same side.
   */
  applyTwoWayShift(p0, p1, marketId = '', selId0 = '', selId1 = '') {
    const liab = this.getMarketLiability(marketId);
    const by = liab.bySelection || {};
    let diff = (by[selId0] || getSelectionLiability(marketId, selId0))
      - (by[selId1] || getSelectionLiability(marketId, selId1));
    if (Math.abs(diff) < 1) {
      diff = (liab.liabilityOver || 0) - (liab.liabilityUnder || 0);
    }
    if (Math.abs(diff) < 1000) {
      return { p0, p1 };
    }
    const shift = Math.max(-0.08, Math.min(0.08, diff * 0.00001));
    const np0 = Math.max(0.05, Math.min(0.95, p0 - shift));
    return { p0: np0, p1: 1 - np0 };
  }

  applyRiskShift(probabilities = {}, marketId = '') {
    const { p0, p1 } = this.applyTwoWayShift(
      probabilities.over || 0.5,
      probabilities.under || 0.5,
      marketId,
      'over',
      'under',
    );
    if (Math.abs(p0 - (probabilities.over || 0.5)) < 0.0005) return probabilities;
    return {
      over: Number(p0.toFixed(3)),
      under: Number(p1.toFixed(3)),
    };
  }

  isRiskLimitExceeded(marketId, maxAllowedLiability = 1000000) {
    const liab = this.getMarketLiability(marketId);
    return Math.max(liab.liabilityOver, liab.liabilityUnder) > maxAllowedLiability;
  }
}

export const riskAdjustmentEngine = new RiskAdjustmentEngine();
