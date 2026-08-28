/**
 * OddsEngineV3 — Composite Real-Time Odds Quality Engine
 * 
 * Aggregates calibration, feed freshness, provider consensus, cross-market consistency,
 * temporal ordering, state completeness, and volatility into a unified 0-100 quality score.
 * 
 * INTERNAL DIAGNOSTICS ONLY.
 */

export const ODDS_QUALITY_TIERS = Object.freeze({
  EXCELLENT: 'EXCELLENT',
  GOOD: 'GOOD',
  FAIR: 'FAIR',
  WEAK: 'WEAK',
  INVALID: 'INVALID',
});

/**
 * Computes unified real-time odds quality score.
 */
export function calculateOddsQualityScore({
  calibrationEce = 0.038,
  feedAgeMs = 120,
  providerSpread = 0.02,
  marketConsistencyValid = true,
  temporalOrderValid = true,
  stateCompletenessPct = 100,
  volatilityScore = 0.05,
} = {}) {
  let score = 100;
  const deductions = [];

  // 1. Calibration (ECE > 0.05 penalized)
  if (calibrationEce > 0.10) {
    score -= 20;
    deductions.push(`High calibration error (ECE ${(calibrationEce * 100).toFixed(1)}%)`);
  } else if (calibrationEce > 0.05) {
    score -= 10;
    deductions.push(`Moderate calibration error (ECE ${(calibrationEce * 100).toFixed(1)}%)`);
  }

  // 2. Feed Freshness
  if (feedAgeMs > 10000) {
    score -= 30;
    deductions.push(`Stale feed (${feedAgeMs}ms)`);
  } else if (feedAgeMs > 3000) {
    score -= 12;
    deductions.push(`Elevated feed delay (${feedAgeMs}ms)`);
  }

  // 3. Provider Spread / Disagreement
  if (providerSpread > 0.15) {
    score -= 20;
    deductions.push(`High provider disagreement (${(providerSpread * 100).toFixed(1)}%)`);
  } else if (providerSpread > 0.06) {
    score -= 8;
    deductions.push(`Moderate provider disagreement (${(providerSpread * 100).toFixed(1)}%)`);
  }

  // 4. Market Inconsistencies (Severe)
  if (!marketConsistencyValid) {
    score -= 35;
    deductions.push('Cross-market relationship or Dutch-book violation detected');
  }

  // 5. Temporal Invariants (Severe)
  if (!temporalOrderValid) {
    score -= 40;
    deductions.push('Temporal order or future clock skew anomaly detected');
  }

  // 6. State Completeness
  if (stateCompletenessPct < 100) {
    const missingPen = Math.round((100 - stateCompletenessPct) * 0.2);
    score -= missingPen;
    deductions.push(`Incomplete canonical state (${stateCompletenessPct}%)`);
  }

  // 7. Extreme Volatility
  if (volatilityScore > 0.40) {
    score -= 10;
    deductions.push(`High volatility regime (${(volatilityScore * 100).toFixed(1)}%)`);
  }

  const oddsQualityScore = Math.max(0, Math.min(100, Math.round(score)));

  let tier = ODDS_QUALITY_TIERS.EXCELLENT;
  if (oddsQualityScore < 30) {
    tier = ODDS_QUALITY_TIERS.INVALID;
  } else if (oddsQualityScore < 50) {
    tier = ODDS_QUALITY_TIERS.WEAK;
  } else if (oddsQualityScore < 70) {
    tier = ODDS_QUALITY_TIERS.FAIR;
  } else if (oddsQualityScore < 85) {
    tier = ODDS_QUALITY_TIERS.GOOD;
  }

  return {
    oddsQualityScore,
    tier,
    deductions,
    evaluatedAt: new Date().toISOString(),
  };
}
