/**
 * OddsEngineV3 — TotalLineGenerator
 * 
 * Generates over/under lines centered on expected totals.
 * Lines are always .5 increments to prevent pushes.
 */

/**
 * Generates the nearest .5 line above the expected total.
 * @param {number} expectedTotal
 * @returns {number} Line ending in .5
 */
export function generateLine(expectedTotal) {
  if (!Number.isFinite(expectedTotal) || expectedTotal < 0) {
    throw new Error(`TotalLineGenerator: invalid expectedTotal ${expectedTotal}`);
  }
  // Round down to nearest integer, then add 0.5
  return Math.floor(expectedTotal) + 0.5;
}

/**
 * Calculates the probability of the actual total exceeding the line.
 * Uses a simple logistic approximation centered on expected total.
 * 
 * P(Over) = 1 / (1 + e^(-k * (expected - line)))
 * 
 * When expected > line, P(Over) > 0.5
 * When expected < line, P(Over) < 0.5
 * When expected = line, P(Over) = 0.5
 * 
 * @param {number} expectedTotal
 * @param {number} line
 * @param {number} [spread=8] - Controls how quickly probability changes around the line
 * @returns {{ pOver: number, pUnder: number }}
 */
export function calculateLineProbability(expectedTotal, line, spread = 8) {
  const diff = expectedTotal - line;
  const k = 1 / Math.max(spread, 1);
  const pOver = 1 / (1 + Math.exp(-k * diff));
  const pOverClamped = Math.max(0.01, Math.min(0.99, pOver));
  const pUnder = 1 - pOverClamped;
  return { pOver: pOverClamped, pUnder };
}
