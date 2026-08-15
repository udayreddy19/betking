/**
 * OddsEngineV3 — DistributionModel
 * 
 * Mathematical cumulative distribution functions (Poisson / Normal approximations)
 * for calculating Over/Under probabilities, Run Range distributions, and Player props.
 */

/**
 * Standard Normal Cumulative Distribution Function (CDF)
 * @param {number} x
 * @returns {number} P(Z <= x)
 */
export function normalCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

/**
 * Calculates P(Total > line) and P(Total <= line) for expected mean and variance.
 * 
 * @param {number} expectedMean
 * @param {number} line
 * @param {number} [varianceRatio=1.5] - Variance to mean ratio for cricket run distribution
 * @returns {{ pOver: number, pUnder: number }}
 */
export function calculateOverUnderProbability(expectedMean, line, varianceRatio = 1.5, currentScore = 0) {
  if (currentScore > 0 && currentScore >= line) {
    // Current score already crossed line — Over is 99% guaranteed
    return { pOver: 0.99, pUnder: 0.01 };
  }

  if (expectedMean <= 0) {
    return { pOver: 0.01, pUnder: 0.99 };
  }

  const expectedRemaining = Math.max(0.5, expectedMean - currentScore);
  const stdDev = Math.sqrt(expectedRemaining * varianceRatio);

  if (stdDev <= 0) {
    return { pOver: expectedMean > line ? 0.99 : 0.01, pUnder: expectedMean > line ? 0.01 : 0.99 };
  }

  // Continuity correction
  const z = (line - expectedMean) / stdDev;
  const pUnderRaw = normalCDF(z);

  // If score is within 1-2 runs of line and expectedMean > line, Over is nearly guaranteed (>95%)
  let pUnder = Math.max(0.01, Math.min(0.99, pUnderRaw));
  if (currentScore > 0 && (line - currentScore) <= 2.0 && expectedMean > line + 5) {
    pUnder = Math.min(pUnder, 0.02);
  }

  const pOver = 1.0 - pUnder;
  return { pOver, pUnder };
}

/**
 * Calculates probability of total falling in range [minRuns, maxRuns]
 * 
 * @param {number} expectedMean
 * @param {number} minRuns
 * @param {number} maxRuns
 * @returns {number} Probability
 */
export function calculateRangeProbability(expectedMean, minRuns, maxRuns) {
  const stdDev = Math.sqrt(expectedMean * 1.5);
  const z1 = (minRuns - 0.5 - expectedMean) / stdDev;
  const z2 = (maxRuns + 0.5 - expectedMean) / stdDev;

  const cdf1 = normalCDF(z1);
  const cdf2 = normalCDF(z2);

  const prob = Math.max(0.01, cdf2 - cdf1);
  return prob;
}
