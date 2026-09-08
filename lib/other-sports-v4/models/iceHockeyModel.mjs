/**
 * Ice hockey Poisson goal model (OtherSportsEngineV4).
 * Similar to soccer Dixon-Coles, with NHL-typical ~2.9 goals/game.
 */

function factorial(n) {
  let res = 1;
  for (let i = 2; i <= n; i += 1) res *= i;
  return res;
}

function poissonP(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

export function calculateIceHockeyProbabilities({
  homeExpectedGoals = 2.95,
  awayExpectedGoals = 2.75,
  maxGoals = 9,
  minute = 0,
  totalMinutes = 60,
  currentHomeScore = 0,
  currentAwayScore = 0,
} = {}) {
  const timeRemainingFraction = Math.max(0, (totalMinutes - Math.min(totalMinutes, minute)) / totalMinutes);

  const lambdaRemaining = homeExpectedGoals * timeRemainingFraction;
  const muRemaining = awayExpectedGoals * timeRemainingFraction;

  let pHomeWin = 0;
  let pDraw = 0;
  let pAwayWin = 0;
  let expectedTotal = currentHomeScore + currentAwayScore;

  for (let h = 0; h <= maxGoals; h += 1) {
    for (let a = 0; a <= maxGoals; a += 1) {
      const p = poissonP(h, lambdaRemaining) * poissonP(a, muRemaining);
      const finalH = currentHomeScore + h;
      const finalA = currentAwayScore + a;
      if (finalH > finalA) pHomeWin += p;
      else if (finalH === finalA) pDraw += p;
      else pAwayWin += p;
      expectedTotal += p * (h + a);
    }
  }

  // Regulation draw → OT/SO is ~50/50 adjusted for home ice
  const homeOtAdv = 0.53;
  const pHomeRegWin = pHomeWin;
  const pAwayRegWin = pAwayWin;
  const pHomeIncOT = pHomeRegWin + pDraw * homeOtAdv;
  const pAwayIncOT = pAwayRegWin + pDraw * (1 - homeOtAdv);

  return {
    modelVersion: 'osv4_ice_hockey_poisson_v1',
    pHomeWin: Number(pHomeIncOT.toFixed(4)),
    pDraw: Number(pDraw.toFixed(4)),
    pAwayWin: Number(pAwayIncOT.toFixed(4)),
    pHomeRegWin: Number(pHomeRegWin.toFixed(4)),
    pAwayRegWin: Number(pAwayRegWin.toFixed(4)),
    expectedTotal: Number(expectedTotal.toFixed(2)),
    confidence: Number((0.85 * (1 - (minute / (totalMinutes * 2)))).toFixed(2)),
    calculateOverUnderProb(line) {
      let pOver = 0;
      for (let h = 0; h <= maxGoals; h += 1) {
        for (let a = 0; a <= maxGoals; a += 1) {
          if (currentHomeScore + h + currentAwayScore + a > line) {
            pOver += poissonP(h, lambdaRemaining) * poissonP(a, muRemaining);
          }
        }
      }
      return {
        line: Number(line),
        pOver: Number(Math.max(0.02, Math.min(0.98, pOver)).toFixed(4)),
        pUnder: Number(Math.max(0.02, Math.min(0.98, 1 - pOver)).toFixed(4)),
      };
    },
  };
}
