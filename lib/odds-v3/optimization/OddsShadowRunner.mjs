/**
 * OddsEngineV3 — Phase 22 Live Shadow Runner
 * 
 * Executes candidate models (v3.2-candidate-001 through 005) in parallel with v3.1-prod.
 * 
 * NON-BLOCKING ISOLATION:
 * Candidate outputs are recorded strictly as internal shadow telemetry
 * and NEVER exposed to bettors, bet placement, wallets, or settlement.
 */

import { generate as generateBaseline } from '../OddsEngineV3.mjs';
import { calculateCovarianceAwareWeights, blendProviderOddsCovariance } from './covarianceAwareProviderBlend.mjs';
import { blendByRegime } from './regimeBlendEngine.mjs';
import { applyAdaptiveVolatilityCalibration } from './adaptiveVolatilityCalibration.mjs';
import { calculateAdvancedCricketProbabilities } from './cricketCandidateModel.mjs';
import { evaluateSegmentedCalibration } from './marketCalibrationEngine.mjs';
import { classifyShadowDivergence } from './shadowComparisonEngine.mjs';

const shadowTelemetryStore = [];
const MAX_SHADOW_LOGS = 1000;

export function runShadowOptimizationEvaluation({
  matchState = {},
  candidateId = 'v3.2-candidate-001',
  config = {},
} = {}) {
  const start = Date.now();

  // 1. Authoritative Baseline Output
  const baselineSnapshot = generateBaseline(matchState, config);

  // 2. Candidate Evaluation in Isolated Shadow Path
  let candidateOutput = null;
  try {
    if (candidateId === 'v3.2-candidate-001') {
      candidateOutput = blendProviderOddsCovariance({
        providerOdds: matchState.providerOdds || {},
        feedMetadata: matchState.feedMetadata || {},
      });
    } else if (candidateId === 'v3.2-candidate-002') {
      candidateOutput = blendByRegime({
        modelProb: matchState.modelProb ?? 0.55,
        providerProb: matchState.providerProb ?? 0.53,
        context: { matchState, sport: matchState.sport },
      });
    } else if (candidateId === 'v3.2-candidate-003') {
      candidateOutput = applyAdaptiveVolatilityCalibration({
        previousProb: matchState.previousProb ?? 0.50,
        newProb: matchState.newProb ?? 0.58,
        matchStateEvent: matchState.lastBallEvent,
      });
    } else if (candidateId === 'v3.2-candidate-004') {
      candidateOutput = calculateAdvancedCricketProbabilities(matchState);
    } else if (candidateId === 'v3.2-candidate-005') {
      candidateOutput = evaluateSegmentedCalibration({
        sport: matchState.sport || 'cricket',
        rawProbability: matchState.rawProb ?? 0.60,
      });
    }
  } catch (err) {
    candidateOutput = { error: err.message, status: 'FAILED' };
  }

  const latencyMs = Date.now() - start;

  // 3. Compare Baseline vs Candidate
  const comparison = classifyShadowDivergence(baselineSnapshot, candidateOutput);

  const shadowRecord = {
    evalId: `shd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    matchId: matchState.matchId || 'm_shadow',
    candidateId,
    baselineVersion: 'v3.1-prod',
    divergenceClass: comparison.classification,
    probabilityDelta: comparison.maxProbDelta,
    latencyMs,
  };

  shadowTelemetryStore.push(shadowRecord);
  if (shadowTelemetryStore.length > MAX_SHADOW_LOGS) {
    shadowTelemetryStore.shift();
  }

  return {
    baselineSnapshot,
    candidateOutput,
    comparison,
    latencyMs,
  };
}

export function getRecentShadowRecords(limit = 100) {
  return [...shadowTelemetryStore].reverse().slice(0, Math.min(limit, MAX_SHADOW_LOGS));
}
