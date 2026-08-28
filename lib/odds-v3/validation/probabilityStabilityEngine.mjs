/**
 * OddsEngineV3 — Probability Stability & Oscillation Analysis Engine
 * 
 * Measures the temporal smoothness of modeled probability movements across ticks,
 * detecting provider flicker, rapid flip-flops, and unstable velocity spikes.
 * 
 * DIAGNOSTIC ONLY: Never modifies or dampens published odds directly.
 */

export const STABILITY_CLASSIFICATIONS = Object.freeze({
  STABLE: 'STABLE',
  WATCH: 'WATCH',
  UNSTABLE: 'UNSTABLE',
});

/**
 * Analyzes a sequence of chronological probability ticks for a specific market selection.
 */
export function analyzeProbabilityStability({
  probabilityTicks = [], // Array of { timestamp: string|number, probability: number }
  maxVelocityThreshold = 0.15, // Max 15% probability jump per second
  maxReversalsThreshold = 3,
} = {}) {
  if (probabilityTicks.length < 2) {
    return {
      status: STABILITY_CLASSIFICATIONS.STABLE,
      tickCount: probabilityTicks.length,
      averageVelocity: 0,
      maxVelocity: 0,
      reversalsCount: 0,
      reason: 'Insufficient tick history for volatility analysis.',
      evaluatedAt: new Date().toISOString(),
    };
  }

  let totalVelocity = 0;
  let maxVelocity = 0;
  let reversalsCount = 0;
  let previousDirection = 0; // +1 for up, -1 for down

  for (let i = 1; i < probabilityTicks.length; i++) {
    const prev = probabilityTicks[i - 1];
    const curr = probabilityTicks[i];

    const dt = Math.max(0.1, (new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000);
    const dp = curr.probability - prev.probability;
    const velocity = Math.abs(dp) / dt;

    totalVelocity += velocity;
    if (velocity > maxVelocity) maxVelocity = velocity;

    const direction = dp > 0.005 ? 1 : dp < -0.005 ? -1 : 0;
    if (direction !== 0 && previousDirection !== 0 && direction !== previousDirection) {
      reversalsCount++;
    }
    if (direction !== 0) previousDirection = direction;
  }

  const nSteps = probabilityTicks.length - 1;
  const averageVelocity = Number((totalVelocity / nSteps).toFixed(4));
  maxVelocity = Number(maxVelocity.toFixed(4));

  let status = STABILITY_CLASSIFICATIONS.STABLE;
  let reason = 'Probability velocity and directional smoothness are nominal.';

  if (maxVelocity > maxVelocityThreshold || reversalsCount >= maxReversalsThreshold) {
    status = STABILITY_CLASSIFICATIONS.UNSTABLE;
    reason = `Unstable probability dynamics: maxVelocity=${maxVelocity}/s, reversals=${reversalsCount}.`;
  } else if (maxVelocity > maxVelocityThreshold * 0.6 || reversalsCount >= 2) {
    status = STABILITY_CLASSIFICATIONS.WATCH;
    reason = 'Elevated probability movement velocity detected.';
  }

  return {
    status,
    tickCount: probabilityTicks.length,
    averageVelocity,
    maxVelocity,
    reversalsCount,
    reason,
    evaluatedAt: new Date().toISOString(),
  };
}
