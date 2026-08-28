import { convertToDecimalOdds } from './normalizers/oddsNormalizer.mjs';
import { computeAccumulatorPayout } from '../src/utils/accumulatorPayout.js';
import { calculateSgpJointOdds } from './odds-v3/pricing/correlationEngine.mjs';

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

  /** Calculate potential payout for accumulator bet with Same Game Parlay (SGP) correlation */
  calculateAccumulatorPayout(stake, selections = []) {
    const decStake = typeof stake === 'number' ? stake : parseFloat(stake);
    
    // Group selections by matchId to identify Same Game Parlay (SGP) combinations
    const byMatch = new Map();
    for (const sel of selections) {
      const mId = sel.matchId || 'independent';
      if (!byMatch.has(mId)) byMatch.set(mId, []);
      byMatch.get(mId).push(sel);
    }

    const matchGroupOdds = [];

    for (const [mId, legs] of byMatch.entries()) {
      if (mId !== 'independent' && legs.length >= 2) {
        // Evaluate correlated SGP joint odds using Gaussian Copula
        const firstSelId = legs[0]?.selectionId;
        const copulaLegs = legs.map((l) => ({
          marketType: l.marketId || 'match_winner',
          probability: Math.max(0.01, Math.min(0.99, 1 / convertToDecimalOdds(l.odds))),
          isSameTeam: l.marketId === legs[0]?.marketId ? l.selectionId === firstSelId : true,
        }));
        const sgp = calculateSgpJointOdds(copulaLegs);
        if (!sgp.valid) {
          throw new Error(`INVALID_SGP_BET: Contradictory or incompatible selections in Same Game Parlay: ${sgp.telemetry?.reason || 'rejected'}`);
        }
        matchGroupOdds.push(sgp.sgpOdds);
      } else {
        for (const l of legs) {
          matchGroupOdds.push(convertToDecimalOdds(l.odds));
        }
      }
    }

    const calc = computeAccumulatorPayout(decStake, matchGroupOdds);

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
