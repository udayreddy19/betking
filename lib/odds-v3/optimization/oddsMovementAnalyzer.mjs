/**
 * OddsEngineV3 — Odds Movement Analyzer
 * 
 * Quantifies odds velocity, acceleration, and micro-reversals,
 * classifying movements into informational signals vs spurious feed noise.
 */

export const MOVEMENT_CLASSIFICATIONS = Object.freeze({
  INFORMATIONAL: 'INFORMATIONAL',
  NOISE: 'NOISE',
  PROVIDER_SPIKE: 'PROVIDER_SPIKE',
  MODEL_RESPONSE: 'MODEL_RESPONSE',
  EVENT_RESPONSE: 'EVENT_RESPONSE',
  UNKNOWN: 'UNKNOWN',
});

/**
 * Analyzes transition between two successive odds observations.
 */
export function analyzeOddsMovement({
  previousOdds,
  newOdds,
  previousTimestamp,
  newTimestamp,
  matchStateEvent = null,
  providerDivergence = 0.02,
} = {}) {
  const t1 = new Date(previousTimestamp || Date.now() - 1000).getTime();
  const t2 = new Date(newTimestamp || Date.now()).getTime();
  const deltaSeconds = Math.max(0.1, (t2 - t1) / 1000);

  const absoluteDelta = Number(Math.abs(newOdds - previousOdds).toFixed(4));
  const percentageDelta = previousOdds > 0 ? Number(((absoluteDelta / previousOdds) * 100).toFixed(2)) : 0;
  const velocity = Number((absoluteDelta / deltaSeconds).toFixed(4)); // delta odds per second

  let classification = MOVEMENT_CLASSIFICATIONS.INFORMATIONAL;

  if (matchStateEvent) {
    classification = MOVEMENT_CLASSIFICATIONS.EVENT_RESPONSE;
  } else if (percentageDelta > 15 && providerDivergence > 0.15) {
    classification = MOVEMENT_CLASSIFICATIONS.PROVIDER_SPIKE;
  } else if (percentageDelta > 10 && !matchStateEvent) {
    classification = MOVEMENT_CLASSIFICATIONS.NOISE;
  } else if (percentageDelta < 1.0) {
    classification = MOVEMENT_CLASSIFICATIONS.INFORMATIONAL;
  }

  return {
    previousOdds,
    newOdds,
    absoluteDelta,
    percentageDelta,
    velocity,
    deltaSeconds,
    classification,
    isReversal: (newOdds > previousOdds && previousOdds < 2.0) || (newOdds < previousOdds && previousOdds > 2.0),
    analyzedAt: new Date().toISOString(),
  };
}
