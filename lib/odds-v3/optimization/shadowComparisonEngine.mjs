/**
 * OddsEngineV3 — Shadow Comparison Engine
 * 
 * Compares baseline vs candidate shadow outputs to quantify divergence,
 * identify pricing variations, and detect potential model regressions.
 */

export const DIVERGENCE_CLASSES = Object.freeze({
  NEAR_IDENTICAL: 'NEAR_IDENTICAL',
  MINOR_DIFFERENCE: 'MINOR_DIFFERENCE',
  MEANINGFUL_DIFFERENCE: 'MEANINGFUL_DIFFERENCE',
  HIGH_DIVERGENCE: 'HIGH_DIVERGENCE',
});

/**
 * Classifies divergence between baseline and candidate probability outputs.
 */
export function classifyShadowDivergence(baselineSnapshot, candidateOutput) {
  if (!candidateOutput || candidateOutput.error) {
    return {
      classification: DIVERGENCE_CLASSES.HIGH_DIVERGENCE,
      maxProbDelta: 1.0,
      reason: 'CANDIDATE_FAILED_OR_EMPTY',
    };
  }

  // Extract primary market win probability
  const baseWinner = baselineSnapshot?.markets?.find((m) => m.marketId === 'match_winner');
  const baseP1 = baseWinner?.selections?.[0]?.probability ?? 0.50;

  const candP1 = candidateOutput.probabilities?.p1
    ?? candidateOutput.pChase
    ?? candidateOutput.blendedProbability
    ?? candidateOutput.calibratedProbability
    ?? baseP1;

  const delta = Math.abs(candP1 - baseP1);

  let classification = DIVERGENCE_CLASSES.NEAR_IDENTICAL;
  if (delta >= 0.12) {
    classification = DIVERGENCE_CLASSES.HIGH_DIVERGENCE;
  } else if (delta >= 0.05) {
    classification = DIVERGENCE_CLASSES.MEANINGFUL_DIFFERENCE;
  } else if (delta >= 0.01) {
    classification = DIVERGENCE_CLASSES.MINOR_DIFFERENCE;
  }

  return {
    classification,
    maxProbDelta: Number(delta.toFixed(4)),
    baselineProb: Number(baseP1.toFixed(4)),
    candidateProb: Number(candP1.toFixed(4)),
    evaluatedAt: new Date().toISOString(),
  };
}
