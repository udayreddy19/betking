/**
 * Bet Risk & Payout Engine
 * Computes precise potential payout, profit, bookmaker liability, and market exposure limits.
 */

import { convertToDecimalOdds } from './normalizers/oddsNormalizer.mjs';

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

    let combinedOdds = 1.0;
    for (const sel of selections) {
      const dec = convertToDecimalOdds(sel.odds);
      combinedOdds *= dec;
    }

    const roundedCombinedOdds = parseFloat(combinedOdds.toFixed(2));
    const potentialPayout = parseFloat((decStake * roundedCombinedOdds).toFixed(2));
    const potentialProfit = parseFloat((potentialPayout - decStake).toFixed(2));

    return {
      stake: decStake,
      combinedOdds: roundedCombinedOdds,
      potentialPayout,
      potentialProfit,
      liability: potentialProfit,
    };
  }
}

export const betRiskEngine = new BetRiskEngine();
