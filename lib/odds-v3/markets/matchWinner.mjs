/**
 * OddsEngineV3 — Extended Match Markets (Group 1)
 * 
 * Generates:
 * 1. Match Winner (incl. Super Over)
 * 2. Will There Be A Tie
 * 3. Double Chance
 * 4. Team To Score Most Runs
 * 5. Team To Score Most Sixes
 * 6. Team To Score Most Fours
 */

import { calculateWinProbability } from '../models/winProbabilityModel.mjs';
import { priceSelection } from '../pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../models/MarketDefinition.mjs';

/**
 * Calculate boundary-lead probability using a logistic model.
 *
 * If actual boundary counts (fours/sixes) are available in match state,
 * derives probability from the current lead plus remaining-balls context.
 * Otherwise falls back to the team win probability with a correlation damper.
 *
 * @param {Object} state - Canonical match state
 * @param {'fours'|'sixes'} boundaryType
 * @param {number} pTeam1Win - Pre-computed team-1 win probability
 * @returns {number} Probability that team 1 scores more of this boundary type
 */
function calculateBoundaryLeadProbability(state, boundaryType, pTeam1Win) {
  const t1Count = state.team1[boundaryType] ?? state.liveDetails?.team1?.[boundaryType];
  const t2Count = state.team2[boundaryType] ?? state.liveDetails?.team2?.[boundaryType];

  // If we have actual counts, derive from them
  if (t1Count != null && t2Count != null) {
    const diff = t1Count - t2Count;
    const ballsRemaining = state.ballsRemaining || 60;
    // Weight: more balls remaining → lead matters less (more can change)
    const certaintyFactor = Math.max(0.3, 1 - (ballsRemaining / 240));
    // Logistic sigmoid based on lead
    const rawP = 1 / (1 + Math.exp(-diff * 0.3 * certaintyFactor));
    return Math.max(0.10, Math.min(0.90, rawP));
  }

  // Fallback: correlate with win probability but dampen
  // Winning team is more likely to hit more boundaries, but not perfectly correlated
  const correlation = boundaryType === 'sixes' ? 0.80 : 0.75;
  const damped = 0.5 + (pTeam1Win - 0.5) * correlation;
  return Math.max(0.15, Math.min(0.85, damped));
}

export function generateExtendedMatchMarkets(state, validation = {}, marginConfig = {}) {
  const overround = marginConfig.liveMatchWinnerOverround || 0.05;
  const { pTeam1, pTeam2, pTie } = calculateWinProbability(state);

  const t1Name = state.team1.name;
  const t2Name = state.team2.name;

  const markets = [];

  // 1. Super Over Winner
  markets.push(createMarketDefinition({
    marketId: 'match_winner_super_over',
    marketType: 'MATCH_WINNER_SUPER_OVER',
    category: 'main',
    name: 'Winner (incl. Super Over)',
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_t1_so', name: t1Name, probability: pTeam1, overround }),
      priceSelection({ selectionId: 'sel_t2_so', name: t2Name, probability: pTeam2, overround }),
    ],
  }));

  // 2. Will There Be A Tie
  const pTieNorm = Math.max(0.01, pTie || 0.01);
  markets.push(createMarketDefinition({
    marketId: 'will_there_be_a_tie',
    marketType: 'WILL_THERE_BE_A_TIE',
    category: 'main',
    name: 'Will There Be A Tie',
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_tie_yes', name: 'Yes', probability: pTieNorm, overround }),
      priceSelection({ selectionId: 'sel_tie_no', name: 'No', probability: 1.0 - pTieNorm, overround }),
    ],
  }));

  // 3. Double Chance
  const p1Tie = Math.min(0.99, pTeam1 + pTieNorm);
  const p2Tie = Math.min(0.99, pTeam2 + pTieNorm);
  markets.push(createMarketDefinition({
    marketId: 'double_chance',
    marketType: 'DOUBLE_CHANCE',
    category: 'main',
    name: 'Double Chance',
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_dc_1x', name: `${t1Name} or Tie`, probability: p1Tie, overround }),
      priceSelection({ selectionId: 'sel_dc_2x', name: `${t2Name} or Tie`, probability: p2Tie, overround }),
    ],
  }));

  // 4. Most Sixes — boundary-lead model
  const p1Sixes = calculateBoundaryLeadProbability(state, 'sixes', pTeam1);
  markets.push(createMarketDefinition({
    marketId: 'most_sixes',
    marketType: 'MOST_SIXES',
    category: 'main',
    name: 'Team To Score Most Sixes',
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_sixes_t1', name: t1Name, probability: p1Sixes, overround }),
      priceSelection({ selectionId: 'sel_sixes_t2', name: t2Name, probability: 1.0 - p1Sixes, overround }),
    ],
  }));

  // 5. Most Fours — boundary-lead model
  const p1Fours = calculateBoundaryLeadProbability(state, 'fours', pTeam1);
  markets.push(createMarketDefinition({
    marketId: 'most_fours',
    marketType: 'MOST_FOURS',
    category: 'main',
    name: 'Team To Score Most Fours',
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_fours_t1', name: t1Name, probability: p1Fours, overround }),
      priceSelection({ selectionId: 'sel_fours_t2', name: t2Name, probability: 1.0 - p1Fours, overround }),
    ],
  }));

  return markets;
}
