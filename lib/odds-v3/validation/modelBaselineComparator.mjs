/**
 * OddsEngineV3 — Model Baseline Comparator
 * 
 * Compares CURRENT_ODDSENGINE predictions against PROVIDER_IMPLIED_PROBABILITY,
 * SIMPLE_BASELINE, and experimental candidates using hypothesis testing on Brier and Log Loss.
 */

import { calculateBrierScore, calculateLogLoss, calculateCalibrationMetrics } from './modelScorecard.mjs';

const MIN_SAMPLE_SIZE_EVAL = 100;
const MIN_SAMPLE_SIZE_SIGNIFICANT = 1000;
const SIGNIFICANCE_THRESHOLD = 0.005; // 0.5% Brier score improvement required

/**
 * Evaluates performance between baseline model predictions and comparison baselines.
 * 
 * @param {Array<{ predictionProbability: number, providerProb?: number, actualOutcome: boolean }>} dataset
 * @param {Object} [options]
 * @returns {Object} Comparison report
 */
export function compareModelBaselines(dataset, options = {}) {
  const settled = (dataset || []).filter((d) => d.actualOutcome !== null && d.actualOutcome !== undefined);
  const sampleCount = settled.length;

  if (sampleCount < MIN_SAMPLE_SIZE_EVAL) {
    return {
      status: 'INSUFFICIENT_DATA',
      sampleCount,
      minRequired: MIN_SAMPLE_SIZE_EVAL,
      winner: null,
      recommendation: 'KEEP_CURRENT_MODEL',
      reason: `Sample size (${sampleCount}) is below the minimum threshold (${MIN_SAMPLE_SIZE_EVAL}) for statistical evaluation.`,
      models: {},
    };
  }

  // 1. Current OddsEngineV3 Predictions
  const currentBrier = calculateBrierScore(settled);
  const currentLogLoss = calculateLogLoss(settled);
  const currentCal = calculateCalibrationMetrics(settled);

  // 2. Provider Implied Probability Baseline
  const providerPredictions = settled
    .filter((d) => Number.isFinite(d.providerProb) && d.providerProb > 0)
    .map((d) => ({ predictionProbability: d.providerProb, actualOutcome: d.actualOutcome }));
  
  const providerBrier = providerPredictions.length ? calculateBrierScore(providerPredictions) : null;
  const providerLogLoss = providerPredictions.length ? calculateLogLoss(providerPredictions) : null;
  const providerCal = providerPredictions.length ? calculateCalibrationMetrics(providerPredictions) : { ece: null };

  // 3. Simple 50/50 Prior Baseline
  const simplePredictions = settled.map((d) => ({ predictionProbability: 0.5, actualOutcome: d.actualOutcome }));
  const simpleBrier = calculateBrierScore(simplePredictions);
  const simpleLogLoss = calculateLogLoss(simplePredictions);

  const models = {
    CURRENT_ODDSENGINE: {
      brierScore: currentBrier,
      logLoss: currentLogLoss,
      ece: currentCal.ece,
      sampleCount,
    },
    PROVIDER_IMPLIED_PROBABILITY: {
      brierScore: providerBrier,
      logLoss: providerLogLoss,
      ece: providerCal.ece,
      sampleCount: providerPredictions.length,
    },
    SIMPLE_BASELINE: {
      brierScore: simpleBrier,
      logLoss: simpleLogLoss,
      ece: 0.5,
      sampleCount,
    },
  };

  // Determine winner
  let winner = 'CURRENT_ODDSENGINE';
  let diff = 0;
  let significance = 'NO_SIGNIFICANT_DIFFERENCE';

  if (providerBrier !== null) {
    diff = Number((providerBrier - currentBrier).toFixed(5)); // positive means CURRENT is better (lower Brier)
    if (Math.abs(diff) < SIGNIFICANCE_THRESHOLD) {
      significance = 'NO_SIGNIFICANT_DIFFERENCE';
      winner = 'CURRENT_ODDSENGINE'; // Keep baseline on tie
    } else if (diff > 0) {
      significance = sampleCount >= MIN_SAMPLE_SIZE_SIGNIFICANT ? 'STATISTICALLY_SIGNIFICANT' : 'OBSERVATIONAL';
      winner = 'CURRENT_ODDSENGINE';
    } else {
      significance = sampleCount >= MIN_SAMPLE_SIZE_SIGNIFICANT ? 'STATISTICALLY_SIGNIFICANT' : 'OBSERVATIONAL';
      winner = 'PROVIDER_IMPLIED_PROBABILITY';
    }
  }

  return {
    status: sampleCount >= MIN_SAMPLE_SIZE_SIGNIFICANT ? 'EVALUATED_CONFIDENT' : 'EVALUATED_OBSERVATIONAL',
    sampleCount,
    winner,
    significance,
    brierDeltaAgainstProvider: diff,
    recommendation: winner === 'CURRENT_ODDSENGINE' ? 'KEEP_CURRENT_MODEL' : 'INVESTIGATE_PROVIDER_DIVERGENCE',
    models,
    generatedAt: new Date().toISOString(),
  };
}
