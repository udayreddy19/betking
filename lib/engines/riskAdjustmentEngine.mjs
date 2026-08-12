/**
 * Risk & Exposure Adjustment Engine (lib/engines/riskAdjustmentEngine.mjs)
 * Adjusts prices based on market exposure/liabilities or suspends markets if risk limits are breached.
 * Keeps probability, pricing, and risk adjustment strictly separate.
 */

export class RiskAdjustmentEngine {
  constructor() {
    this.liabilitiesStore = new Map();
  }

  getMarketLiability(marketId) {
    return this.liabilitiesStore.get(marketId) || { totalStake: 0, liabilityOver: 0, liabilityUnder: 0 };
  }

  recordBetLiability(marketId, selection, stake, potentialPayout) {
    const current = this.getMarketLiability(marketId);
    if (/over/i.test(selection)) {
      current.liabilityOver += (potentialPayout - stake);
    } else if (/under/i.test(selection)) {
      current.liabilityUnder += (potentialPayout - stake);
    }
    current.totalStake += stake;
    this.liabilitiesStore.set(marketId, current);
    return current;
  }

  applyRiskShift(probabilities = {}, marketId = '') {
    const liab = this.getMarketLiability(marketId);
    const diff = liab.liabilityOver - liab.liabilityUnder;

    if (Math.abs(diff) < 1000) {
      return probabilities;
    }

    // High exposure on Over -> decrease Over odds (increase Over prob), increase Under odds
    const shift = Math.max(-0.08, Math.min(0.08, diff * 0.00001));
    const newOver = Math.max(0.05, Math.min(0.95, (probabilities.over || 0.5) + shift));

    return {
      over: Number(newOver.toFixed(3)),
      under: Number((1 - newOver).toFixed(3)),
    };
  }

  isRiskLimitExceeded(marketId, maxAllowedLiability = 1000000) {
    const liab = this.getMarketLiability(marketId);
    return Math.max(liab.liabilityOver, liab.liabilityUnder) > maxAllowedLiability;
  }
}

export const riskAdjustmentEngine = new RiskAdjustmentEngine();
