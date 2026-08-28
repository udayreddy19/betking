/**
 * OddsEngineV3 — Change-Point & Structural Shift Detector
 * 
 * Identifies sudden statistical shifts, abrupt probability jumps, and momentum reversals,
 * categorizing them into legitimate match event adjustments vs feed noise.
 * 
 * SHADOW / CANDIDATE ONLY.
 */

export const CHANGE_POINT_TYPES = Object.freeze({
  LEGITIMATE_EVENT_MOVE: 'LEGITIMATE_EVENT_MOVE',
  RAPID_VOLATILITY_INCREASE: 'RAPID_VOLATILITY_INCREASE',
  MOMENTUM_REVERSAL: 'MOMENTUM_REVERSAL',
  PROVIDER_NOISE_SPIKE: 'PROVIDER_NOISE_SPIKE',
  STABLE_TRANSITION: 'STABLE_TRANSITION',
});

/**
 * Evaluates probability trajectory to detect change-points.
 */
export function detectChangePoint({
  probabilityHistory = [],
  currentProbability = 0.50,
  matchStateEvent = null,
  providerSpread = 0.02,
  timeWindowSeconds = 10,
} = {}) {
  if (probabilityHistory.length < 2) {
    return {
      type: CHANGE_POINT_TYPES.STABLE_TRANSITION,
      hasChangePoint: false,
      delta: 0,
      confidence: 1.0,
      detectedAt: new Date().toISOString(),
    };
  }

  const prevP = probabilityHistory[probabilityHistory.length - 1];
  const delta = Math.abs(currentProbability - prevP);

  // Check 1: Verified Game Event Change-point
  if (matchStateEvent && delta > 0.04) {
    return {
      type: CHANGE_POINT_TYPES.LEGITIMATE_EVENT_MOVE,
      hasChangePoint: true,
      delta: Number(delta.toFixed(4)),
      event: matchStateEvent,
      confidence: 0.95,
      detectedAt: new Date().toISOString(),
    };
  }

  // Check 2: Provider Noise Spike (Sudden jump without event + high spread)
  if (delta > 0.10 && providerSpread > 0.12 && !matchStateEvent) {
    return {
      type: CHANGE_POINT_TYPES.PROVIDER_NOISE_SPIKE,
      hasChangePoint: true,
      delta: Number(delta.toFixed(4)),
      confidence: 0.85,
      detectedAt: new Date().toISOString(),
    };
  }

  // Check 3: Momentum Reversal (Trajectory sign flip)
  if (probabilityHistory.length >= 2) {
    const p0 = probabilityHistory[probabilityHistory.length - 2];
    const trend1 = prevP - p0;
    const trend2 = currentProbability - prevP;

    if (Math.sign(trend1) !== Math.sign(trend2) && Math.abs(trend2) > 0.04) {
      return {
        type: CHANGE_POINT_TYPES.MOMENTUM_REVERSAL,
        hasChangePoint: true,
        delta: Number(delta.toFixed(4)),
        confidence: 0.80,
        detectedAt: new Date().toISOString(),
      };
    }
  }

  return {
    type: CHANGE_POINT_TYPES.STABLE_TRANSITION,
    hasChangePoint: false,
    delta: Number(delta.toFixed(4)),
    confidence: 1.0,
    detectedAt: new Date().toISOString(),
  };
}
