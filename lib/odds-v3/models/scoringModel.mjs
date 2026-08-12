/**
 * OddsEngineV3 — ScoringModel
 * 
 * Mathematical model for expected remaining runs and score probability distributions.
 * Incorporates current score, balls remaining, wickets lost, required run rate, and format rules.
 */

import { getFormatRules } from '../format/CricketFormatRules.mjs';

/**
 * Calculates expected remaining runs and expected total runs.
 * 
 * @param {Object} params
 * @param {number} params.currentScore
 * @param {number} params.ballsRemaining
 * @param {number} params.wicketsRemaining
 * @param {number} params.ballsCompleted
 * @param {string} params.format
 * @param {number} [params.target]
 * @returns {{ expectedRemainingRuns: number, expectedTotal: number, projectedRunRate: number }}
 */
export function calculateScoringExpectation({
  currentScore = 0,
  ballsRemaining = 120,
  wicketsRemaining = 10,
  ballsCompleted = 0,
  format = 'T20',
  target = null,
}) {
  const rules = getFormatRules(format) || getFormatRules('T20');
  const baseRate = rules.historicalRunsPerBall;

  // Wicket resource factor (Frank Duckworth / Tony Lewis exponential decay principle)
  const wicketResourceFactor = Math.pow(wicketsRemaining / rules.maxWickets, 0.65);
  
  // Current run rate (blended with historical baseline for small sample size)
  const currentRR = ballsCompleted > 6 ? (currentScore / ballsCompleted) : baseRate;
  const blendedRate = (currentRR * 0.45 + baseRate * 0.55) * wicketResourceFactor;

  let expectedRemainingRuns = Math.max(0, ballsRemaining * blendedRate);

  if (target != null) {
    if (currentScore >= target) {
      expectedRemainingRuns = 0;
    } else if (ballsRemaining > 0) {
      const runsNeeded = target - currentScore;
      const maxPossibleRemaining = runsNeeded + 2; // Match ends when target is hit (max 6 on winning ball = +5)
      expectedRemainingRuns = Math.min(expectedRemainingRuns, maxPossibleRemaining);
    }
  }

  const expectedTotal = target != null ? Math.min(target + 2, currentScore + expectedRemainingRuns) : (currentScore + expectedRemainingRuns);
  const projectedRunRate = ballsRemaining > 0 ? (expectedRemainingRuns / ballsRemaining) * 6 : 0;

  return {
    expectedRemainingRuns,
    expectedTotal,
    projectedRunRate,
  };
}
