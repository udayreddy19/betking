/**
 * OddsEngineV3 — Champion vs Challenger Statistical Comparison & Regression Engine
 * 
 * Compares empirical performance of production Champion vs shadow Challenger models,
 * detecting granular sub-category regressions before any promotion consideration.
 */

/**
 * Compares Champion and Challenger models across overall and segmented horizons.
 */
export function compareChampionAndChallenger({
  championScorecard = {},
  challengerScorecard = {},
  segmentedResults = {},
} = {}) {
  const champSettled = championScorecard.nSettledObservations || 0;
  const challSettled = challengerScorecard.nSettledObservations || 0;
  const n = Math.min(champSettled, challSettled);

  if (n < (championScorecard.minRequiredSettled || 1000)) {
    return {
      decision: 'INSUFFICIENT_DATA',
      sampleSize: n,
      minRequired: championScorecard.minRequiredSettled || 1000,
      reason: 'Settled production sample count is insufficient for statistical certification.',
      recommendation: 'KEEP_SHADOW',
      evaluatedAt: new Date().toISOString(),
    };
  }

  const champBrier = championScorecard.metrics?.brierScore || 0.185;
  const challBrier = challengerScorecard.metrics?.brierScore || 0.185;
  const brierDelta = Number((challBrier - champBrier).toFixed(4)); // Negative is improvement
  const brierImprovementPct = Number((((champBrier - challBrier) / champBrier) * 100).toFixed(2));

  const champEce = championScorecard.metrics?.expectedCalibrationError || 0.038;
  const challEce = challengerScorecard.metrics?.expectedCalibrationError || 0.038;
  const eceDelta = Number((challEce - champEce).toFixed(4));

  // Check sub-category regressions (e.g. late-game, high-volatility)
  const regressions = [];
  for (const [segment, segData] of Object.entries(segmentedResults)) {
    if (segData.challengerBrier > segData.championBrier * 1.15) {
      regressions.push({
        segment,
        details: `Challenger Brier (${segData.challengerBrier}) degraded by >15% vs Champion (${segData.championBrier})`,
      });
    }
  }

  let decision = 'KEEP_SHADOW';
  let reason = 'Challenger does not satisfy promotion criteria.';

  if (regressions.length > 0) {
    decision = 'OVERALL_IMPROVEMENT_WITH_CRITICAL_REGRESSION';
    reason = `Critical regression detected in ${regressions.length} segments (${regressions.map((r) => r.segment).join(', ')}).`;
  } else if (brierDelta < -0.010 && eceDelta <= 0) {
    decision = 'ELIGIBLE_FOR_REVIEW';
    reason = `Statistically meaningful improvement: Brier delta ${brierDelta} (${brierImprovementPct}%), ECE delta ${eceDelta}.`;
  } else if (brierDelta >= 0) {
    decision = 'REJECT_CANDIDATE';
    reason = `Challenger showed worse or neutral Brier score (${brierDelta}).`;
  }

  return {
    decision,
    reason,
    sampleSize: n,
    metrics: {
      championBrier: champBrier,
      challengerBrier: challBrier,
      brierDelta,
      brierImprovementPct,
      championEce: champEce,
      challengerEce: challEce,
      eceDelta,
    },
    regressionsCount: regressions.length,
    regressions,
    recommendation: decision === 'ELIGIBLE_FOR_REVIEW' ? 'READY_FOR_OPERATOR_REVIEW' : 'KEEP_SHADOW',
    evaluatedAt: new Date().toISOString(),
  };
}
