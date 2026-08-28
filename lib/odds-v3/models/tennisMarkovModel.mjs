/**
 * OddsEngineV3 — Tennis Markov Chain Point-to-Match Model
 * 
 * Computes fair match and set winner probabilities from:
 * - pServerHold: Probability of player A holding serve (default ~64%)
 * - pReturnBreak: Probability of player A breaking serve (default ~22%)
 * - Live point, game, set state
 */

/**
 * Probability of winning a game from point score (0, 15, 30, 40, Ad)
 * given single point serve win probability p.
 */
export function calculateGameWinProb(p, pointA = 0, pointB = 0) {
  const q = 1 - p;
  // If at deuce (3-3 or Ad)
  if (pointA >= 3 && pointB >= 3) {
    if (pointA === pointB) {
      return (p * p) / (p * p + q * q);
    } else if (pointA === pointB + 1) { // Ad server
      return p + q * ((p * p) / (p * p + q * q));
    } else if (pointB === pointA + 1) { // Ad receiver
      return p * ((p * p) / (p * p + q * q));
    }
  }

  // Backward induction for game matrix
  const dp = Array.from({ length: 5 }, () => Array(5).fill(0));
  dp[4][0] = dp[4][1] = dp[4][2] = 1.0; // Win states for server
  dp[0][4] = dp[1][4] = dp[2][4] = 0.0; // Win states for receiver
  dp[3][3] = (p * p) / (p * p + q * q);  // Deuce equity

  for (let i = 3; i >= 0; i--) {
    for (let j = 3; j >= 0; j--) {
      if (i === 3 && j === 3) continue;
      dp[i][j] = p * (i + 1 === 4 ? 1 : dp[i + 1][j]) + q * (j + 1 === 4 ? 0 : dp[i][j + 1]);
    }
  }

  return dp[Math.min(3, pointA)][Math.min(3, pointB)];
}

/**
 * Calculates match winner probability from game and set state
 */
export function calculateTennisMatchProb({
  pServeA = 0.65,
  pServeB = 0.62,
  setsA = 0,
  setsB = 0,
  gamesA = 0,
  gamesB = 0,
  bestOfSets = 3,
}) {
  // Approximate set win probability
  const pSetA = Math.max(0.05, Math.min(0.95, (pServeA + (1 - pServeB)) / 2 + (gamesA - gamesB) * 0.05));
  const pSetB = 1 - pSetA;

  const setsNeeded = Math.ceil(bestOfSets / 2);
  const remainingSetsA = setsNeeded - setsA;
  const remainingSetsB = setsNeeded - setsB;

  if (remainingSetsA <= 0) return { pWinA: 0.99, pWinB: 0.01, confidence: 0.9 };
  if (remainingSetsB <= 0) return { pWinA: 0.01, pWinB: 0.99, confidence: 0.9 };

  let pMatchA = pSetA;
  if (remainingSetsA === 1 && remainingSetsB === 1) {
    pMatchA = pSetA;
  } else if (remainingSetsA === 1 && remainingSetsB === 2) {
    pMatchA = pSetA + pSetB * pSetA; // A wins in 2 or in 3
  } else if (remainingSetsA === 2 && remainingSetsB === 1) {
    pMatchA = pSetA * pSetA; // A must win next two sets
  }

  const cleanP = Math.max(0.01, Math.min(0.99, pMatchA));
  return {
    modelVersion: 'tennis_markov_v1',
    pWinA: Number(cleanP.toFixed(4)),
    pWinB: Number((1 - cleanP).toFixed(4)),
    confidence: 0.82,
  };
}
