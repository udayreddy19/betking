/**
 * Tennis match-win Markov approximation (OtherSportsEngineV4).
 */

export function calculateTennisMatchProb({
  pServeA = 0.65,
  pServeB = 0.62,
  setsA = 0,
  setsB = 0,
  gamesA = 0,
  gamesB = 0,
  bestOfSets = 3,
} = {}) {
  const pSetA = Math.max(0.05, Math.min(0.95, (pServeA + (1 - pServeB)) / 2 + (gamesA - gamesB) * 0.05));
  const pSetB = 1 - pSetA;

  const setsNeeded = Math.ceil(bestOfSets / 2);
  const remainingSetsA = setsNeeded - setsA;
  const remainingSetsB = setsNeeded - setsB;

  if (remainingSetsA <= 0) return { pWinA: 0.99, pWinB: 0.01, pSetA, confidence: 0.9, modelVersion: 'osv4_tennis_v1' };
  if (remainingSetsB <= 0) return { pWinA: 0.01, pWinB: 0.99, pSetA, confidence: 0.9, modelVersion: 'osv4_tennis_v1' };

  let pMatchA = pSetA;
  if (remainingSetsA === 2 && remainingSetsB === 2) {
    // Best-of-3 from 0–0: P(win) = p²(3 − 2p)
    pMatchA = pSetA * pSetA * (3 - 2 * pSetA);
  } else if (remainingSetsA === 1 && remainingSetsB === 2) {
    pMatchA = pSetA + pSetB * pSetA;
  } else if (remainingSetsA === 2 && remainingSetsB === 1) {
    pMatchA = pSetA * pSetA;
  } else if (remainingSetsA === 1 && remainingSetsB === 1) {
    pMatchA = pSetA;
  }

  const cleanP = Math.max(0.01, Math.min(0.99, pMatchA));
  return {
    modelVersion: 'osv4_tennis_v1',
    pWinA: Number(cleanP.toFixed(4)),
    pWinB: Number((1 - cleanP).toFixed(4)),
    pSetA: Number(pSetA.toFixed(4)),
    confidence: 0.82,
  };
}
