/**
 * OddsEngineV3 — ProbabilityModel
 * 
 * Deterministic cricket match-winner probability model for live chases.
 * 
 * ═══════════════════════════════════════════════════════════════
 * MODEL DOCUMENTATION
 * ═══════════════════════════════════════════════════════════════
 * 
 * The model calculates P(chasing team wins) using three factors:
 * 
 *   1. RUN RATE RATIO (rr)
 *      rr = requiredRunRate / currentRunRate
 *      When rr < 1, the chaser is ahead of pace.
 *      When rr > 1, the chaser is behind pace.
 *      Clamped to [0.1, 10] to avoid extremes at start of innings.
 * 
 *   2. WICKETS IN HAND FACTOR (wf)
 *      wf = wicketsRemaining / maxWickets
 *      More wickets in hand = higher probability of success.
 *      Range: [0, 1]
 * 
 *   3. BALLS PROGRESS FACTOR (bf)
 *      bf = ballsCompleted / ballsPerInnings
 *      How deep into the innings the chase is.
 *      Used to weight the wickets factor: early wickets hurt less.
 * 
 * FORMULA:
 *   runRateFactor = 1 / (1 + e^(k * (rr - 1)))     [logistic sigmoid]
 *   wicketFactor  = wf ^ (0.5 + 0.5 * bf)           [progressive weighting]
 *   rawP_chase    = runRateFactor * wicketFactor
 *   P_chase       = clamp(rawP_chase, 0.01, 0.99)
 *   P_field       = 1 - P_chase
 * 
 * Where:
 *   k = steepness parameter (default 3.5, configurable per format)
 * 
 * The sigmoid ensures a smooth, continuous probability transition.
 * The wicket factor ensures all-out risk is priced in.
 * 
 * DETERMINISM:
 *   Same inputs always produce the same outputs.
 *   No randomness. No external state. No side effects.
 * 
 * ═══════════════════════════════════════════════════════════════
 */

import { getFormatRules } from '../format/CricketFormatRules.mjs';

/**
 * Model configuration — can be overridden per format.
 */
const MODEL_CONFIG = Object.freeze({
  THE_HUNDRED: Object.freeze({
    steepness: 3.5,
  }),
  T20: Object.freeze({
    steepness: 3.5,
  }),
  T10: Object.freeze({
    steepness: 5.0,
  }),
  ODI: Object.freeze({
    steepness: 3.2,
  }),
});

/**
 * Calculates match-winner probabilities for a live chase scenario.
 * 
 * @param {Object} params
 * @param {number} params.runsRequired       - Runs needed to win
 * @param {number} params.ballsRemaining     - Balls left in innings
 * @param {number} params.wicketsRemaining   - Wickets in hand (10 - wickets fallen)
 * @param {number} params.ballsCompleted     - Balls bowled so far in this innings
 * @param {number} params.ballsPerInnings    - Total balls in innings
 * @param {number} params.target             - Target score
 * @param {number} params.chasingScore       - Current score of chasing team
 * @param {string} params.format             - 'THE_HUNDRED' | 'T20'
 * @param {string} params.chasingTeamId      - ID of chasing team
 * @param {string} params.fieldingTeamId     - ID of fielding/bowling team
 * 
 * @returns {{ chasingTeamId: string, fieldingTeamId: string, pChase: number, pField: number }}
 */
export function calculateMatchWinnerProbability({
  runsRequired,
  ballsRemaining,
  wicketsRemaining,
  ballsCompleted,
  ballsPerInnings,
  target,
  chasingScore,
  format,
  chasingTeamId,
  fieldingTeamId,
}) {
  const rules = getFormatRules(format);
  if (!rules) throw new Error(`ProbabilityModel: unsupported format '${format}'`);

  const config = MODEL_CONFIG[format] || MODEL_CONFIG.T20;
  const k = config.steepness;

  // --- Step 1: Run Rate Ratio ---
  // Compare required rate against the historical achievable rate for the format
  const requiredRunRate = ballsRemaining > 0 ? runsRequired / ballsRemaining : Infinity;
  let achievableRate = rules.historicalRunsPerBall;

  // Phase 13: Early-Overs Run-Rate Smoothing (overs 0-3 / balls <= 18)
  // For the first 18 balls, actual run rate can jump wildly on single deliveries.
  // We blend achievableRate with an empirical Bayesian prior: CRR_smoothed = (chasingScore + 8) / (ballsCompleted / 6 + 1.0) / 6
  if (ballsCompleted <= 18 && ballsCompleted > 0) {
    const smoothedCRRPerBall = ((chasingScore + 8) / (ballsCompleted / 6 + 1.0)) / 6;
    achievableRate = 0.70 * rules.historicalRunsPerBall + 0.30 * Math.min(2.5, Math.max(0.5, smoothedCRRPerBall));
  }

  const rr = requiredRunRate / achievableRate;
  const rrClamped = Math.max(0.1, Math.min(10, rr));

  // --- Step 2: Logistic Sigmoid for Run Rate ---
  // When rr = 1, probability ≈ 0.5 (required rate equals historical average)
  // When rr < 1, probability > 0.5 (chaser needs less than average)
  // When rr > 1, probability < 0.5 (chaser needs more than average)
  const runRateFactor = 1 / (1 + Math.exp(k * (rrClamped - 1)));

  // --- Step 3: Wickets Factor ---
  const maxWickets = rules.maxWickets;
  const wf = wicketsRemaining / maxWickets;
  const bf = ballsPerInnings > 0 ? ballsCompleted / ballsPerInnings : 0;
  // Early in innings, wicket loss matters less; late, it matters more
  const wicketExponent = 0.5 + 0.5 * bf;
  const wicketFactor = Math.pow(wf, wicketExponent);

  // --- Step 4: Target Progress Factor ---
  // How much of the target has already been scored.
  // progressFraction ranges from 0 (nothing scored) to ~1 (almost there).
  // This ensures that scoring runs always moves the probability upward
  // (as long as wickets are constant), even if rate ratio is temporarily flat.
  const progressFraction = target > 0 ? chasingScore / target : 0;
  const ratePenalty = Math.min(1, achievableRate / Math.max(requiredRunRate, 0.01));
  const progressBoost = progressFraction * 0.35 * ratePenalty;

  // --- Step 5: Combine ---
  let rawPChase = runRateFactor * wicketFactor + progressBoost;
  if (requiredRunRate > 2.4) rawPChase = Math.min(rawPChase, 0.10);
  if (requiredRunRate > 3.0) rawPChase = Math.min(rawPChase, 0.05);

  // --- Step 6: Clamp to valid probability range ---
  const pChase = Math.max(0.01, Math.min(0.99, rawPChase));
  const pField = 1 - pChase;

  return {
    chasingTeamId,
    fieldingTeamId,
    pChase,
    pField,
  };
}

/**
 * Calculates expected remaining runs for the batting team.
 * Used by Team Total and Match Total markets.
 * 
 * Model: expectedRemaining = ballsRemaining * adjustedRunRate
 * adjustedRunRate = blendedRate * wicketDecay * heatBoost
 * 
 * @param {Object} params
 * @param {number} params.currentScore
 * @param {number} params.ballsRemaining
 * @param {number} params.wicketsRemaining
 * @param {number} params.ballsCompleted
 * @param {string} params.format
 * @returns {{ expectedTotal: number, expectedRemaining: number }}
 */
export function calculateExpectedTotal({
  currentScore,
  ballsRemaining,
  wicketsRemaining,
  ballsCompleted,
  format,
  target = null,
}) {
  const rules = getFormatRules(format);
  if (!rules) throw new Error(`ProbabilityModel: unsupported format '${format}'`);

  const maxWickets = rules.maxWickets;
  const wf = wicketsRemaining / maxWickets;

  // Milder wicket decay so early wickets don't crush a hot scoring rate
  const wicketDecay = Math.pow(Math.max(wf, 0.01), 0.22);

  // Actual scoring rate so far (if balls bowled)
  let effectiveRate = rules.historicalRunsPerBall;
  let heatBoost = 1;
  if (ballsCompleted > 0) {
    const actualRate = currentScore / ballsCompleted;
    const progress = ballsCompleted / rules.ballsPerInnings;
    // Trust live RR harder than before (was capped at 80%) — under-projection
    // was selling ~2.2 Overs that finished 1–3 runs over the line.
    const actualWeight = Math.min(0.92, Math.max(0.35, progress * 2.4));
    effectiveRate = actualWeight * actualRate + (1 - actualWeight) * rules.historicalRunsPerBall;
    if (actualRate > rules.historicalRunsPerBall) {
      heatBoost = Math.min(1.18, actualRate / rules.historicalRunsPerBall);
    }
  }

  const adjustedRate = effectiveRate * wicketDecay * heatBoost;
  let expectedRemaining = Math.max(0, ballsRemaining) * adjustedRate;

  if (target != null) {
    if (currentScore >= target) {
      expectedRemaining = 0;
    } else {
      expectedRemaining = Math.min(expectedRemaining, target - currentScore + 2);
    }
  }

  const rawExpectedTotal = currentScore + expectedRemaining;
  const expectedTotal = target != null ? Math.min(target + 2, rawExpectedTotal) : rawExpectedTotal;

  return { expectedTotal, expectedRemaining };
}
