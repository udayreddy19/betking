/**
 * OddsEngineV3 — Coherent Score Distribution & Multi-Market Derivation Engine
 * 
 * Derives related market probabilities (Over/Under lines, Double Chance, Team vs Match totals)
 * from a unified underlying probability mass function (PMF) rather than independent ad-hoc generators.
 * 
 * SHADOW / CANDIDATE ONLY.
 */

/**
 * Calculates Poisson Probability Mass Function: P(X = k) = (lambda^k * e^-lambda) / k!
 */
export function poissonPmf(k, lambda) {
  if (k < 0 || lambda <= 0) return 0;
  let logFactorial = 0;
  for (let i = 2; i <= k; i++) logFactorial += Math.log(i);
  return Math.exp(k * Math.log(lambda) - lambda - logFactorial);
}

/**
 * Derives multi-line Over/Under total probabilities from a continuous/Poisson score distribution.
 */
export function deriveOverUnderLinesFromDistribution({
  expectedTotal = 160.0,
  lines = [150.5, 155.5, 160.5, 165.5, 170.5],
  varianceMultiplier = 1.2,
} = {}) {
  // Discretize around expectedTotal using a normal/Gaussian approximation to Poisson with variance tuning
  const sigma = Math.sqrt(expectedTotal * varianceMultiplier);
  const derivedLines = [];

  for (const line of lines) {
    // P(Total > line) = 1 - Phi((line - mu) / sigma)
    const z = (line - expectedTotal) / (sigma || 1);
    // Standard normal CDF approximation (Abramowitz and Stegun)
    const phi = 0.5 * (1 + Math.sign(z) * Math.sqrt(1 - Math.exp(-2 * z * z / Math.PI)));
    const pUnder = Math.max(0.01, Math.min(0.99, phi));
    const pOver = Number((1 - pUnder).toFixed(4));

    derivedLines.push({
      line,
      pOver,
      pUnder: Number(pUnder.toFixed(4)),
      fairOddsOver: Number((1 / pOver).toFixed(4)),
      fairOddsUnder: Number((1 / pUnder).toFixed(4)),
    });
  }

  // Verify strict line monotonicity: higher line must yield lower pOver
  let strictlyMonotonic = true;
  for (let i = 0; i < derivedLines.length - 1; i++) {
    if (derivedLines[i].pOver < derivedLines[i + 1].pOver) {
      strictlyMonotonic = false;
      break;
    }
  }

  return {
    expectedTotal,
    derivedLines,
    strictlyMonotonic,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Derives Double Chance selections directly from 1X2 Match Winner probabilities.
 */
export function deriveDoubleChanceFromMatchWinner({ p1, pDraw = 0, p2 }) {
  const sum = p1 + pDraw + p2;
  const normP1 = p1 / sum;
  const normPDraw = pDraw / sum;
  const normP2 = p2 / sum;

  const p1X = Number((normP1 + normPDraw).toFixed(4));
  const p12 = Number((normP1 + normP2).toFixed(4));
  const pX2 = Number((normPDraw + normP2).toFixed(4));

  return {
    p1X,
    p12,
    pX2,
    fairOdds1X: Number((1 / p1X).toFixed(4)),
    fairOdds12: Number((1 / p12).toFixed(4)),
    fairOddsX2: Number((1 / pX2).toFixed(4)),
    isCoherent: true,
  };
}
