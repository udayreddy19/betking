/**
 * OddsEngineV3 — PlayerPerformanceModel
 * 
 * Computes probabilities for player runs, player milestones (25+, 50+, 75+, 100+),
 * player boundaries (Fours/Sixes), and Head-to-Head player comparisons.
 */

import { normalCDF } from './distributionModel.mjs';

/**
 * Calculates probability of a batter reaching targetMilestone (e.g. 25, 50, 75, 100).
 * 
 * @param {number} currentRuns
 * @param {number} targetMilestone
 * @param {number} ballsRemaining
 * @returns {number} Probability
 */
export function calculatePlayerMilestoneProbability(currentRuns, targetMilestone, ballsRemaining) {
  if (currentRuns >= targetMilestone) {
    return 1.0; // Already achieved
  }
  if (ballsRemaining <= 0) {
    return 0.0;
  }

  const runsNeeded = targetMilestone - currentRuns;
  // Average remaining balls faced by an active batter ~ 35% of team balls remaining
  const expectedBallsFaced = Math.min(60, ballsRemaining * 0.35);
  const expectedRuns = expectedBallsFaced * 1.35; // Strike rate 135

  if (expectedRuns <= 0) return 0.01;

  const stdDev = Math.sqrt(expectedRuns * 2.0);
  const z = (runsNeeded - 0.5 - expectedRuns) / stdDev;
  const pReach = 1.0 - normalCDF(z);

  return Math.max(0.01, Math.min(0.99, pReach));
}

/**
 * Calculates Head-to-Head win probability for Batter A vs Batter B.
 * 
 * @param {number} playerARuns
 * @param {number} playerBRuns
 * @returns {{ pPlayerA: number, pPlayerB: number, pTie: number }}
 */
export function calculateBatterH2HProbability(playerARuns = 0, playerBRuns = 0) {
  const diff = playerARuns - playerBRuns;
  const pTie = 0.02;
  const pARaw = 1 / (1 + Math.exp(-diff * 0.1));
  const pA = pARaw * (1.0 - pTie);
  const pB = (1.0 - pARaw) * (1.0 - pTie);
  return { pPlayerA: pA, pPlayerB: pB, pTie };
}
