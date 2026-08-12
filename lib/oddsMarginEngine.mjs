/**
 * Odds Margin & Implied Probability Calculator
 * Computes market overround / margin and validates quantitative integrity.
 */

import { convertToDecimalOdds } from './normalizers/oddsNormalizer.mjs';

export class OddsMarginEngine {
  /** Calculate implied probability for a single selection decimal odds */
  calculateImpliedProbability(odds) {
    const dec = convertToDecimalOdds(odds);
    return parseFloat((1.0 / dec).toFixed(4));
  }

  /** Calculate total market overround / margin for a set of selections */
  calculateMarketMargin(selections = []) {
    if (!Array.isArray(selections) || selections.length === 0) {
      return 0;
    }

    let sumImplied = 0;
    for (const sel of selections) {
      const dec = convertToDecimalOdds(sel.odds);
      sumImplied += (1.0 / dec);
    }

    const margin = sumImplied - 1.0;
    return parseFloat(margin.toFixed(4));
  }

  /** Validate market margin limits */
  validateMarketMargin(selections = [], maxMargin = 0.50) {
    const margin = this.calculateMarketMargin(selections);
    if (margin < 0.00) {
      throw new Error(`Negative market margin (arbitrage opportunity) detected: ${(margin * 100).toFixed(2)}%`);
    }
    if (margin > maxMargin) {
      throw new Error(`Market margin exceeds maximum threshold of ${(maxMargin * 100)}%: ${(margin * 100).toFixed(2)}%`);
    }
    return margin;
  }
}

export const oddsMarginEngine = new OddsMarginEngine();
