/**
 * OddsEngineV3 — Shadow Candidate Model Evaluation & Statistical Significance Engine
 * 
 * Benchmarks shadow candidate model predictions against authoritative Champion v3.1-prod
 * under strictly isolated conditions with mandatory sample-size certification gates.
 */

export const CANDIDATE_PERFORMANCE_STATUS = Object.freeze({
  WORSE: 'WORSE',
  NEUTRAL: 'NEUTRAL',
  PROMISING: 'PROMISING',
  BETTER: 'BETTER',
});

export const STATISTICAL_SIGNIFICANCE = Object.freeze({
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  EXPERIMENTAL: 'EXPERIMENTAL',
  STATISTICALLY_INTERESTING: 'STATISTICALLY_INTERESTING',
  CERTIFICATION_CANDIDATE: 'CERTIFICATION_CANDIDATE',
});

const CERTIFICATION_SAMPLE_GATE = 1000;
const RIGOROUS_SAMPLE_GATE = 5000;

/**
 * Compares authoritative Champion vs shadow Challenger model predictions.
 */
export function evaluateCandidateModel({
  championModelVersion = 'v3.1-prod',
  candidateModelVersion = 'v3.2-candidate-004',
  championMetrics = { brierScore: 0.185, logLoss: 0.542, ece: 0.038, accuracy: 78.4 },
  candidateMetrics = { brierScore: 0.167, logLoss: 0.518, ece: 0.030, accuracy: 80.2 },
  settledSampleCount = 0,
} = {}) {
  // Statistical significance classification
  let significance = STATISTICAL_SIGNIFICANCE.INSUFFICIENT_DATA;
  if (settledSampleCount >= RIGOROUS_SAMPLE_GATE) {
    significance = STATISTICAL_SIGNIFICANCE.CERTIFICATION_CANDIDATE;
  } else if (settledSampleCount >= CERTIFICATION_SAMPLE_GATE) {
    significance = STATISTICAL_SIGNIFICANCE.STATISTICALLY_INTERESTING;
  } else if (settledSampleCount > 100) {
    significance = STATISTICAL_SIGNIFICANCE.EXPERIMENTAL;
  }

  const brierDelta = Number((candidateMetrics.brierScore - championMetrics.brierScore).toFixed(4));
  const logLossDelta = Number((candidateMetrics.logLoss - championMetrics.logLoss).toFixed(4));
  const eceDelta = Number((candidateMetrics.ece - championMetrics.ece).toFixed(4));
  const brierImprovementPct = Number((((championMetrics.brierScore - candidateMetrics.brierScore) / championMetrics.brierScore) * 100).toFixed(2));

  let performanceStatus = CANDIDATE_PERFORMANCE_STATUS.NEUTRAL;
  if (brierDelta <= -0.015 && eceDelta <= 0) {
    performanceStatus = CANDIDATE_PERFORMANCE_STATUS.BETTER;
  } else if (brierDelta < -0.005) {
    performanceStatus = CANDIDATE_PERFORMANCE_STATUS.PROMISING;
  } else if (brierDelta > 0.005) {
    performanceStatus = CANDIDATE_PERFORMANCE_STATUS.WORSE;
  }

  let recommendation = 'KEEP_SHADOW';
  if (significance === STATISTICAL_SIGNIFICANCE.INSUFFICIENT_DATA) {
    recommendation = 'KEEP_SHADOW';
  } else if (performanceStatus === CANDIDATE_PERFORMANCE_STATUS.BETTER && significance === STATISTICAL_SIGNIFICANCE.CERTIFICATION_CANDIDATE) {
    recommendation = 'ELIGIBLE_FOR_MANUAL_OPERATOR_REVIEW';
  } else if (performanceStatus === CANDIDATE_PERFORMANCE_STATUS.WORSE) {
    recommendation = 'REJECT_CANDIDATE';
  }

  return {
    championModelVersion,
    candidateModelVersion,
    settledSampleCount,
    minRequiredSample: CERTIFICATION_SAMPLE_GATE,
    significance,
    performanceStatus,
    deltas: {
      brierDelta,
      brierImprovementPct,
      logLossDelta,
      eceDelta,
    },
    metricsComparison: {
      champion: championMetrics,
      candidate: candidateMetrics,
    },
    recommendation,
    autoPromotionAllowed: false,
    evaluatedAt: new Date().toISOString(),
  };
}
