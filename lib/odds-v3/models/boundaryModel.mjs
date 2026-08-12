/**
 * OddsEngineV3 — BoundaryModel
 * 
 * Computes boundary probabilities (Fours & Sixes) for matches, teams, overs, and players.
 */

/**
 * Calculates expected total fours & sixes for a team or match given balls remaining & format.
 * 
 * @param {number} currentScore
 * @param {number} ballsRemaining
 * @param {string} format
 * @returns {{ expectedFours: number, expectedSixes: number }}
 */
export function calculateExpectedBoundaries(currentScore, ballsRemaining, format = 'T20') {
  // Historical boundary rates per ball:
  // T20: 1 four per 8.5 balls, 1 six per 16 balls
  const fourRate = format === 'THE_HUNDRED' ? 0.13 : (format === 'T10' ? 0.16 : 0.11);
  const sixRate = format === 'THE_HUNDRED' ? 0.07 : (format === 'T10' ? 0.12 : 0.06);

  const currentFours = Math.floor(currentScore * 0.12);
  const currentSixes = Math.floor(currentScore * 0.06);

  const remainingFours = ballsRemaining * fourRate;
  const remainingSixes = ballsRemaining * sixRate;

  return {
    expectedFours: currentFours + remainingFours,
    expectedSixes: currentSixes + remainingSixes,
  };
}
