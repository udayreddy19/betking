/**
 * Soccer Dixon-Coles bivariate Poisson (OtherSportsEngineV4 copy).
 */

const RHO = -0.05;

function factorial(n) {
  let res = 1;
  for (let i = 2; i <= n; i += 1) res *= i;
  return res;
}

function poissonP(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

function tau(x, y, lambda, mu, rho) {
  if (x === 0 && y === 0) return 1 - (lambda * mu * rho);
  if (x === 0 && y === 1) return 1 + (lambda * rho);
  if (x === 1 && y === 0) return 1 + (mu * rho);
  if (x === 1 && y === 1) return 1 - rho;
  return 1.0;
}

export function calculateScoreMatrix({
  homeExpectedGoals = 1.45,
  awayExpectedGoals = 1.15,
  maxGoals = 7,
  minute = 0,
  currentHomeScore = 0,
  currentAwayScore = 0,
  homeRedCards = 0,
  awayRedCards = 0,
} = {}) {
  const timeRemainingFraction = Math.max(0, (90 - Math.min(90, minute)) / 90);
  const homeRedCardFactor = Math.pow(0.75, homeRedCards);
  const awayRedCardFactor = Math.pow(0.75, awayRedCards);

  const lambdaRemaining = homeExpectedGoals * timeRemainingFraction * homeRedCardFactor;
  const muRemaining = awayExpectedGoals * timeRemainingFraction * awayRedCardFactor;

  const matrix = [];
  let sumP = 0;

  for (let h = 0; h <= maxGoals; h += 1) {
    matrix[h] = [];
    for (let a = 0; a <= maxGoals; a += 1) {
      const pBase = poissonP(h, lambdaRemaining) * poissonP(a, muRemaining);
      const adj = tau(h, a, Math.max(0.1, lambdaRemaining), Math.max(0.1, muRemaining), RHO);
      const prob = Math.max(0, pBase * adj);
      matrix[h][a] = prob;
      sumP += prob;
    }
  }

  if (sumP > 0) {
    for (let h = 0; h <= maxGoals; h += 1) {
      for (let a = 0; a <= maxGoals; a += 1) {
        matrix[h][a] /= sumP;
      }
    }
  }

  let pHomeWin = 0;
  let pDraw = 0;
  let pAwayWin = 0;
  let pOver25 = 0;
  let pBttsYes = 0;
  let expectedTotal = currentHomeScore + currentAwayScore;

  for (let h = 0; h <= maxGoals; h += 1) {
    for (let a = 0; a <= maxGoals; a += 1) {
      const finalH = currentHomeScore + h;
      const finalA = currentAwayScore + a;
      const p = matrix[h][a];
      if (finalH > finalA) pHomeWin += p;
      else if (finalH === finalA) pDraw += p;
      else pAwayWin += p;
      if (finalH + finalA > 2.5) pOver25 += p;
      if (finalH > 0 && finalA > 0) pBttsYes += p;
      expectedTotal += p * (h + a);
    }
  }

  return {
    modelVersion: 'osv4_dixon_coles_v1',
    pHomeWin: Number(pHomeWin.toFixed(4)),
    pDraw: Number(pDraw.toFixed(4)),
    pAwayWin: Number(pAwayWin.toFixed(4)),
    pOver25: Number(pOver25.toFixed(4)),
    pUnder25: Number((1 - pOver25).toFixed(4)),
    pBttsYes: Number(pBttsYes.toFixed(4)),
    pBttsNo: Number((1 - pBttsYes).toFixed(4)),
    expectedTotal: Number(expectedTotal.toFixed(2)),
    confidence: Number((0.85 * (1 - (minute / 180))).toFixed(2)),
    pOverLine(line) {
      let pOver = 0;
      for (let h = 0; h <= maxGoals; h += 1) {
        for (let a = 0; a <= maxGoals; a += 1) {
          if (currentHomeScore + h + currentAwayScore + a > line) {
            pOver += matrix[h][a];
          }
        }
      }
      return Number(Math.max(0.02, Math.min(0.98, pOver)).toFixed(4));
    },
  };
}
