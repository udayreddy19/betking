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
 * Logistic spread for O/U: shrinks as fewer balls remain so late-innings
 * totals stop pricing like a coin-flip (~2.2) when the finish is nearly decided.
 * @param {number} ballsRemaining
 * @param {number} [ballsPerInnings=120]
 * @returns {number}
 */
export function resolveTotalLineSpread(ballsRemaining, ballsPerInnings = 120) {
  const br = Math.max(0, Number(ballsRemaining) || 0);
  const innings = Math.max(1, Number(ballsPerInnings) || 120);
  const fracLeft = br / innings;
  if (br <= 3 || fracLeft <= 0.03) return 1.25;
  if (br <= 6 || fracLeft <= 0.06) return 2.0;
  if (br <= 12 || fracLeft <= 0.12) return 3.25;
  if (br <= 24 || fracLeft <= 0.22) return 4.75;
  if (fracLeft <= 0.4) return 6.25;
  return 8;
}

/**
 * Minimum .5 lead of the live total line above current score.
 * Stops selling Over on a line that sits only 0.5 above the live score
 * while many balls remain (the ladder exploit).
 * @param {number} ballsRemaining
 * @param {number} [historicalRunsPerBall=1.35]
 * @returns {number} Always ends in .5
 */
export function minLiveTotalLineLead(ballsRemaining, historicalRunsPerBall = 1.35) {
  const br = Math.max(0, Number(ballsRemaining) || 0);
  if (br <= 0) return 0.5;
  const rate = Number.isFinite(historicalRunsPerBall) && historicalRunsPerBall > 0
    ? historicalRunsPerBall
    : 1.35;
  // ~45% of remaining historical expectation must sit above current score on the line
  const lead = br * rate * 0.45;
  const clamped = Math.min(18.5, Math.max(0.5, lead));
  return Math.floor(clamped) + 0.5;
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
