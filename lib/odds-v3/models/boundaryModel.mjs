/**
 * OddsEngineV3 — BoundaryModel
 *
 * Computes boundary expectations (Fours & Sixes). Prefer live counts when available —
 * never invent a mid-match total that ignores what has already happened.
 */

import { boundaryRatesPerBall } from '../markets/liveAggregatePricing.mjs';

/**
 * @param {number} currentScore
 * @param {number} ballsRemaining
 * @param {string} format
 * @param {{ currentFours?: number|null, currentSixes?: number|null, futureInningsBalls?: number }} [opts]
 * @returns {{ expectedFours: number, expectedSixes: number, liveFours: number, liveSixes: number }}
 */
export function calculateExpectedBoundaries(currentScore, ballsRemaining, format = 'T20', opts = {}) {
  const { four: fourRate, six: sixRate } = boundaryRatesPerBall(format);
  const score = Math.max(0, Number(currentScore) || 0);
  const rem = Math.max(0, Number(ballsRemaining) || 0);
  const future = Math.max(0, Number(opts.futureInningsBalls) || 0);

  const liveFours = opts.currentFours != null && Number.isFinite(Number(opts.currentFours))
    ? Math.max(0, Number(opts.currentFours))
    : Math.floor(score * 0.12);
  const liveSixes = opts.currentSixes != null && Number.isFinite(Number(opts.currentSixes))
    ? Math.max(0, Number(opts.currentSixes))
    : Math.floor(score * 0.06);

  return {
    liveFours,
    liveSixes,
    expectedFours: liveFours + (rem + future) * fourRate,
    expectedSixes: liveSixes + (rem + future) * sixRate,
  };
}
