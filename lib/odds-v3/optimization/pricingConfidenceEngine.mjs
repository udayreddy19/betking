/**
 * OddsEngineV3 — Pricing Confidence & Uncertainty Engine
 * 
 * Computes multi-factor pricing confidence and uncertainty scores
 * based on provider spread, feed latency, model convergence, and volatility.
 * 
 * INTERNAL DIAGNOSTICS ONLY: Not exposed to public bettors.
 */

export const CONFIDENCE_LEVELS = Object.freeze({
  VERY_HIGH: 'VERY_HIGH',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  VERY_LOW: 'VERY_LOW',
});

/**
 * Evaluates pricing confidence for an active market evaluation.
 */
export function calculatePricingConfidence({
  feedAgeMs = 150,
  providerDivergence = 0.02,
  volatilityScore = 0.05,
  stateCompleteness = 1.0,
  historicalSampleCount = 1500,
  modelAgreement = 0.95,
} = {}) {
  let score = 100;
  const penalties = [];

  // Feed age penalty
  if (feedAgeMs > 10000) {
    score -= 40;
    penalties.push(`Stale feed (${feedAgeMs}ms)`);
  } else if (feedAgeMs > 3000) {
    score -= 15;
    penalties.push(`Elevated feed delay (${feedAgeMs}ms)`);
  }

  // Provider disagreement penalty
  if (providerDivergence > 0.15) {
    score -= 35;
    penalties.push(`High provider spread (${(providerDivergence * 100).toFixed(1)}%)`);
  } else if (providerDivergence > 0.06) {
    score -= 15;
    penalties.push(`Moderate provider spread (${(providerDivergence * 100).toFixed(1)}%)`);
  }

  // Volatility penalty
  if (volatilityScore > 0.35) {
    score -= 20;
    penalties.push(`High market volatility (${(volatilityScore * 100).toFixed(1)}%)`);
  }

  // State completeness penalty
  if (stateCompleteness < 0.8) {
    score -= 25;
    penalties.push(`Incomplete canonical state (${(stateCompleteness * 100).toFixed(1)}%)`);
  }

  // Sample size boost / penalty
  if (historicalSampleCount < 500) {
    score -= 15;
    penalties.push('Low empirical sample count (< 500)');
  }

  const confidenceScore = Math.max(0, Math.min(100, Math.round(score)));
  const uncertaintyScore = 100 - confidenceScore;

  let confidenceLevel = CONFIDENCE_LEVELS.VERY_HIGH;
  if (confidenceScore < 30) {
    confidenceLevel = CONFIDENCE_LEVELS.VERY_LOW;
  } else if (confidenceScore < 50) {
    confidenceLevel = CONFIDENCE_LEVELS.LOW;
  } else if (confidenceScore < 70) {
    confidenceLevel = CONFIDENCE_LEVELS.MEDIUM;
  } else if (confidenceScore < 85) {
    confidenceLevel = CONFIDENCE_LEVELS.HIGH;
  }

  return {
    confidenceScore,
    confidenceLevel,
    uncertaintyScore,
    penalties,
    evaluatedAt: new Date().toISOString(),
  };
}
