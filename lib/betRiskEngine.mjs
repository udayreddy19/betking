/**
 * Bet Risk & Payout Engine
 * Computes precise potential payout, profit, bookmaker liability, and market exposure limits.
 */

import { convertToDecimalOdds } from './normalizers/oddsNormalizer.mjs';
import { computeAccumulatorPayout } from '../src/utils/accumulatorPayout.js';

export class BetRiskEngine {
  /** Calculate potential payout and profit for single bet */
  calculateSinglePayout(stake, odds) {
    const decStake = typeof stake === 'number' ? stake : parseFloat(stake);
    const decOdds = convertToDecimalOdds(odds);

    const potentialPayout = parseFloat((decStake * decOdds).toFixed(2));
    const potentialProfit = parseFloat((potentialPayout - decStake).toFixed(2));
    const liability = potentialProfit;

    return {
      stake: decStake,
      odds: decOdds,
      potentialPayout,
      potentialProfit,
      liability,
    };
  }

  /** Calculate potential payout for accumulator bet */
  calculateAccumulatorPayout(stake, selections = []) {
    const decStake = typeof stake === 'number' ? stake : parseFloat(stake);
    const legOdds = selections.map((sel) => convertToDecimalOdds(sel.odds));
    const calc = computeAccumulatorPayout(decStake, legOdds);

    return {
      stake: decStake,
      combinedOdds: calc.combinedOdds,
      potentialPayout: calc.potentialPayout,
      potentialProfit: calc.potentialProfit,
      liability: calc.liability,
    };
  }
}

export const betRiskEngine = new BetRiskEngine();
