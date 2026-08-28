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
  const maxBallsFaced = Math.min(60, ballsRemaining * 0.45);
  if (runsNeeded > maxBallsFaced * 6) {
    return 0.0; // Physically impossible even with 6 on every ball
  }

  const expectedBallsFaced = Math.min(60, ballsRemaining * 0.35);
  const expectedRuns = expectedBallsFaced * 1.35; // Strike rate 135

  if (expectedRuns <= 0) return 0.0;

  const stdDev = Math.sqrt(expectedRuns * 2.0);
  const z = (runsNeeded - 0.5 - expectedRuns) / stdDev;
  const pReach = 1.0 - normalCDF(z);

  return Math.max(1e-12, Math.min(0.99, pReach));
}

/**
 * Higher milestones must never be priced as likely as lower ones.
 * Applies a multiplicative gap when the model returns tied/near-tied tiny values.
 *
 * @param {number[]} probabilities - ascending milestone targets (25, 50, 100…)
 * @returns {number[]}
 */
export function enforceMilestoneProbabilityOrdering(probabilities) {
  if (!Array.isArray(probabilities) || probabilities.length === 0) return [];
  const out = probabilities.map((p) => Math.max(0, Number(p) || 0));
  const MIN_RATIO = 0.42;
  const anchor = Math.max(...out, 1e-8);

  for (let i = 0; i < out.length; i += 1) {
    if (out[i] <= 0) {
      out[i] = anchor * Math.pow(MIN_RATIO, i + 1);
    }
  }

  for (let i = 1; i < out.length; i += 1) {
    const cap = out[i - 1] * MIN_RATIO;
    if (out[i] >= out[i - 1]) {
      out[i] = cap;
    }
  }

  return out.map((p) => Math.max(1e-15, p));
}

/** Display caps per milestone — safe bounded levels (avoid unhedged multi-hundred multiplier vulnerabilities) */
export const MILESTONE_MAX_ODDS = Object.freeze({
  25: 50.0,
  50: 100.0,
  100: 250.0,
});

/**
 * Calculates Head-to-Head win probability for Batter A vs Batter B.
 * 
 * @param {number} playerARuns
 * @param {number} playerBRuns
 * @returns {{ pPlayerA: number, pPlayerB: number, pTie: number }}
 */
export function calculateBatterH2HProbability(playerARuns = 0, playerBRuns = 0, ballsRemaining = 60) {
  const remaining = Math.max(0, Number(ballsRemaining) || 0);
  const expExtra = remaining * 0.35 * 1.35;
  const projA = playerARuns + expExtra;
  const projB = playerBRuns + expExtra;
  const diff = projA - projB;
  const pTie = Math.max(0.02, Math.min(0.12, 0.08 * Math.exp(-Math.abs(diff) / 18)));
  const pARaw = 1 / (1 + Math.exp(-diff * 0.12));
  const pA = Math.max(0.0001, Math.min(0.9999, pARaw * (1.0 - pTie)));
  const pB = Math.max(0.0001, Math.min(0.9999, (1.0 - pARaw) * (1.0 - pTie)));
  const sum = pA + pB + pTie;
  return { pPlayerA: pA / sum, pPlayerB: pB / sum, pTie: pTie / sum };
}
