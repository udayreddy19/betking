/**
 * OddsEngineV3 — WicketModel
 * 
 * Computes probabilities for next wicket, wicket in current over, wicket in next over,
 * and dismissal methods (Caught, Bowled, LBW, Run Out, Other).
 */

/**
 * Calculates probability of a wicket occurring in N balls.
 * 
 * @param {number} balls
 * @param {number} currentWickets
 * @returns {number} Probability of at least 1 wicket
 */
export function calculateWicketInOverProbability(balls = 6, currentWickets = 0) {
  // Historical wicket probability per ball in T20 ~ 0.05 (1 wicket every 20 balls)
  const baseBallWicketProb = 0.048 + Math.min(0.02, currentWickets * 0.005);
  const pNoWicket = Math.pow(1 - baseBallWicketProb, balls);
  return Math.max(0.05, Math.min(0.85, 1 - pNoWicket));
}

/**
 * Dismissal method probability distribution based on historical ICC match statistics.
 * Caught: ~62%, Bowled: ~18%, LBW: ~12%, Run Out: ~6%, Stumped/Other: ~2%
 */
export const DISMISSAL_METHOD_PROBABILITIES = {
  CAUGHT: 0.62,
  BOWLED: 0.18,
  LBW: 0.12,
  RUN_OUT: 0.06,
  STUMPED_OTHER: 0.02,
};
