/**
 * soccerDixonColes.mjs
 *
 * Soccer Dixon-Coles bivariate Poisson & distribution engine.
 * Generates mathematically coherent distributions for:
 *   - Match Winner (1X2)
 *   - Correct Score (with explicit tail mass)
 *   - Totals (Over / Under)
 *   - Winning Margin (Home by 1, 2, 3+, Draw, Away by 1, 2, 3+)
 *   - First to Score (Home, Away, No Goal)
 *   - First-Half Model (1H Winner, 1H Totals)
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
  providerImpliedHome = null,
  providerImpliedAway = null,
  isFirstHalfOnly = false,
} = {}) {
  let homeXg = homeExpectedGoals;
  let awayXg = awayExpectedGoals;

  if (providerImpliedHome != null && providerImpliedAway != null) {
    const pHome = Math.max(0.05, Math.min(0.85, Number(providerImpliedHome)));
    const pAway = Math.max(0.05, Math.min(0.85, Number(providerImpliedAway)));
    const baseTotal = homeExpectedGoals + awayExpectedGoals;
    const ratio = pHome / (pHome + pAway);
    homeXg = Math.max(0.6, baseTotal * (0.40 + ratio * 0.30));
    awayXg = Math.max(0.5, baseTotal * (0.40 + (1 - ratio) * 0.30));
  }

  // Fraction of period remaining
  const maxPeriodMinutes = isFirstHalfOnly ? 45 : 90;
  const currentMin = Math.min(maxPeriodMinutes, Math.max(0, minute));
  const timeRemainingFraction = Math.max(0, (maxPeriodMinutes - currentMin) / maxPeriodMinutes);

  // Red card hazard penalty
  const homeRedCardFactor = Math.pow(0.75, homeRedCards);
  const awayRedCardFactor = Math.pow(0.75, awayRedCards);

  // If first-half only, expected goals are roughly 45% of 90-min expected goals
  const periodFactor = isFirstHalfOnly ? 0.45 : 1.0;
  const lambdaRemaining = homeXg * periodFactor * timeRemainingFraction * homeRedCardFactor;
  const muRemaining = awayXg * periodFactor * timeRemainingFraction * awayRedCardFactor;

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

  // Normalize grid
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

  // Winning margin accumulators:
  // Home by 1, Home by 2, Home by 3+
  // Draw (0)
  // Away by 1, Away by 2, Away by 3+
  let wmHome1 = 0;
  let wmHome2 = 0;
  let wmHome3Plus = 0;
  let wmDraw = 0;
  let wmAway1 = 0;
  let wmAway2 = 0;
  let wmAway3Plus = 0;

  for (let h = 0; h <= maxGoals; h += 1) {
    for (let a = 0; a <= maxGoals; a += 1) {
      const finalH = currentHomeScore + h;
      const finalA = currentAwayScore + a;
      const p = matrix[h][a];
      const diff = finalH - finalA;

      if (finalH > finalA) pHomeWin += p;
      else if (finalH === finalA) pDraw += p;
      else pAwayWin += p;

      if (finalH + finalA > 2.5) pOver25 += p;
      if (finalH > 0 && finalA > 0) pBttsYes += p;
      expectedTotal += p * (h + a);

      // Coherent winning margin
      if (diff === 1) wmHome1 += p;
      else if (diff === 2) wmHome2 += p;
      else if (diff >= 3) wmHome3Plus += p;
      else if (diff === 0) wmDraw += p;
      else if (diff === -1) wmAway1 += p;
      else if (diff === -2) wmAway2 += p;
      else if (diff <= -3) wmAway3Plus += p;
    }
  }

  // First to Score Hazard
  // P(Home scores first) = (lambda / (lambda + mu)) * (1 - P(no goals))
  // P(Away scores first) = (mu / (lambda + mu)) * (1 - P(no goals))
  // P(No goals) = exp(-(lambda + mu))
  const totalRemainingRate = lambdaRemaining + muRemaining;
  const pNoGoal = Math.exp(-totalRemainingRate);
  const pAnyGoal = 1 - pNoGoal;
  const pHomeFirst = totalRemainingRate > 0 ? (lambdaRemaining / totalRemainingRate) * pAnyGoal : 0;
  const pAwayFirst = totalRemainingRate > 0 ? (muRemaining / totalRemainingRate) * pAnyGoal : 0;

  return {
    modelVersion: 'osv4_dixon_coles_v2',
    lambdaRemaining,
    muRemaining,
    scoreMatrix: matrix,
    pHomeWin: Number(pHomeWin.toFixed(4)),
    pDraw: Number(pDraw.toFixed(4)),
    pAwayWin: Number(pAwayWin.toFixed(4)),
    pOver25: Number(pOver25.toFixed(4)),
    pUnder25: Number((1 - pOver25).toFixed(4)),
    pBttsYes: Number(pBttsYes.toFixed(4)),
    pBttsNo: Number((1 - pBttsYes).toFixed(4)),
    expectedTotal: Number(expectedTotal.toFixed(2)),
    confidence: Number((0.85 * (1 - (minute / 180))).toFixed(2)),

    // Correct score query: P(finalHome = targetH, finalAway = targetA)
    pFinalScore(targetH, targetA) {
      const hDiff = targetH - currentHomeScore;
      const aDiff = targetA - currentAwayScore;
      if (hDiff < 0 || aDiff < 0 || hDiff > maxGoals || aDiff > maxGoals) return 0;
      return matrix[hDiff][aDiff];
    },

    // Over line query
    pOverLine(line) {
      let pOver = 0;
      for (let h = 0; h <= maxGoals; h += 1) {
        for (let a = 0; a <= maxGoals; a += 1) {
          if (currentHomeScore + h + currentAwayScore + a > line) {
            pOver += matrix[h][a];
          }
        }
      }
      return Number(Math.max(0.01, Math.min(0.99, pOver)).toFixed(4));
    },

    // Coherent Winning Margin distribution
    winningMargin: {
      homeBy1: Number(wmHome1.toFixed(4)),
      homeBy2: Number(wmHome2.toFixed(4)),
      homeBy3Plus: Number(wmHome3Plus.toFixed(4)),
      draw: Number(wmDraw.toFixed(4)),
      awayBy1: Number(wmAway1.toFixed(4)),
      awayBy2: Number(wmAway2.toFixed(4)),
      awayBy3Plus: Number(wmAway3Plus.toFixed(4)),
    },

    // Coherent First to Score distribution
    firstToScore: {
      home: Number(pHomeFirst.toFixed(4)),
      away: Number(pAwayFirst.toFixed(4)),
      noGoal: Number(pNoGoal.toFixed(4)),
    },
  };
}
