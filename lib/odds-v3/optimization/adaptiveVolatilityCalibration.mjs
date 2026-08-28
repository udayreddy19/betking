/**
 * OddsEngineV3 — Candidate 003: Adaptive Volatility Calibration
 * 
 * Separates genuine match state event signals (wickets, goals, boundaries) from
 * micro-reversal noise and feed flicker to prevent unnecessary odds churn while preserving real information.
 * 
 * SHADOW ONLY.
 */

export const VOLATILITY_REGIMES = Object.freeze({
  NORMAL: 'NORMAL',
  FAST: 'FAST',
  EXTREME: 'EXTREME',
  UNSTABLE: 'UNSTABLE',
});

/**
 * Evaluates raw odds movement and applies adaptive noise suppression.
 */
export function applyAdaptiveVolatilityCalibration({
  previousProb,
  newProb,
  matchStateEvent = null,
  providerDivergence = 0.02,
  timeDeltaMs = 1000,
} = {}) {
  const probDelta = Math.abs(newProb - previousProb);
  const isStateDriven = !!matchStateEvent;

  let regime = VOLATILITY_REGIMES.NORMAL;
  if (probDelta > 0.25 && !isStateDriven) {
    regime = VOLATILITY_REGIMES.UNSTABLE;
  } else if (probDelta > 0.15) {
    regime = VOLATILITY_REGIMES.EXTREME;
  } else if (probDelta > 0.05) {
    regime = VOLATILITY_REGIMES.FAST;
  }

  let calibratedProb = newProb;
  let noiseSuppressed = false;

  // If high movement occurred with NO match state change and high provider disagreement, it is likely noise/flicker
  if (!isStateDriven && probDelta > 0.08 && providerDivergence > 0.10) {
    // Apply dampening shrinkage towards previous probability
    const shrinkage = Math.max(0.3, 1 - providerDivergence);
    calibratedProb = previousProb + (newProb - previousProb) * shrinkage;
    noiseSuppressed = true;
  }

  const finalProb = Math.max(0.001, Math.min(0.999, Number(calibratedProb.toFixed(4))));

  return {
    candidateVersion: 'v3.2-candidate-003',
    regime,
    originalDelta: Number(probDelta.toFixed(4)),
    calibratedProbability: finalProb,
    fairOdds: Number((1 / finalProb).toFixed(4)),
    noiseSuppressed,
    isStateDriven,
  };
}
