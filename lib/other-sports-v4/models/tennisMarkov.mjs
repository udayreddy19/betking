/**
 * Tennis match-win Markov approximation (OtherSportsEngineV4).
 * Supports best-of-3 and best-of-5 (Grand Slam).
 * Calibrates serve probabilities from provider MW odds when available.
 */

/**
 * Infer per-set win probability from serve probs + in-set game lead.
 */
function pSetFromServe(pServeA, pServeB, gamesA, gamesB) {
  return Math.max(0.05, Math.min(0.95, (pServeA + (1 - pServeB)) / 2 + (gamesA - gamesB) * 0.05));
}

/**
 * P(A wins match) for generic (remainingSetsA, remainingSetsB) via recursion.
 */
function pMatchWin(pSet, needA, needB, memo = {}) {
  if (needA <= 0) return 1;
  if (needB <= 0) return 0;
  const key = `${needA},${needB}`;
  if (memo[key] != null) return memo[key];
  const result = pSet * pMatchWin(pSet, needA - 1, needB, memo)
    + (1 - pSet) * pMatchWin(pSet, needA, needB - 1, memo);
  memo[key] = result;
  return result;
}

/**
 * Expected total games in a set (rough: ~10 for competitive, ~8 for dominant).
 */
function expectedGamesPerSet(pSet) {
  const dominance = Math.abs(pSet - 0.5);
  // Competitive sets → more games; dominant → fewer
  return Math.max(7.5, Math.min(12.5, 10 - dominance * 6));
}

export function calculateTennisMatchProb({
  pServeA = 0.65,
  pServeB = 0.62,
  setsA = 0,
  setsB = 0,
  gamesA = 0,
  gamesB = 0,
  bestOfSets = 3,
  providerImpliedA = null,
} = {}) {
  let effectiveServeA = pServeA;
  let effectiveServeB = pServeB;

  // Calibrate serve probs from provider when available
  if (providerImpliedA != null) {
    const pA = Math.max(0.10, Math.min(0.90, Number(providerImpliedA)));
    // Invert pSet formula: pA ≈ (pServeA + (1-pServeB))/2
    // Adjust both symmetrically
    const delta = (pA - 0.5) * 0.15;
    effectiveServeA = Math.max(0.50, Math.min(0.78, pServeA + delta));
    effectiveServeB = Math.max(0.50, Math.min(0.78, pServeB - delta));
  }

  const pSetA = pSetFromServe(effectiveServeA, effectiveServeB, gamesA, gamesB);
  const pSetB = 1 - pSetA;

  const setsNeeded = Math.ceil(bestOfSets / 2);
  const remainingSetsA = setsNeeded - setsA;
  const remainingSetsB = setsNeeded - setsB;

  if (remainingSetsA <= 0) return { pWinA: 0.99, pWinB: 0.01, pSetA, expectedGames: 0, confidence: 0.9, modelVersion: 'osv4_tennis_v2' };
  if (remainingSetsB <= 0) return { pWinA: 0.01, pWinB: 0.99, pSetA, expectedGames: 0, confidence: 0.9, modelVersion: 'osv4_tennis_v2' };

  const pMatchA = pMatchWin(pSetA, remainingSetsA, remainingSetsB);
  const cleanP = Math.max(0.01, Math.min(0.99, pMatchA));

  // Expected remaining sets: use recursion-based weighted average
  const maxRemainingSets = remainingSetsA + remainingSetsB - 1;
  const gamesPerSet = expectedGamesPerSet(pSetA);
  const expectedRemainingSets = ((remainingSetsA + remainingSetsB) / 2) * (1 + Math.abs(pSetA - 0.5) * -0.3);
  const expectedRemainingGames = expectedRemainingSets * gamesPerSet;

  // Total match games: completed sets' games + current set games + expected remaining
  const completedSetGames = (setsA + setsB) * gamesPerSet * 0.85; // approximate
  const totalExpectedGames = completedSetGames + gamesA + gamesB + expectedRemainingGames;

  return {
    modelVersion: 'osv4_tennis_v2',
    pWinA: Number(cleanP.toFixed(4)),
    pWinB: Number((1 - cleanP).toFixed(4)),
    pSetA: Number(pSetA.toFixed(4)),
    expectedGames: Number(Math.max(12, totalExpectedGames).toFixed(1)),
    gamesPerSet: Number(gamesPerSet.toFixed(1)),
    bestOfSets,
    confidence: 0.82,
  };
}
