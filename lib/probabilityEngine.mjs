/**
 * Probability Engine — Pure ES Module Implementation for BetKing Sportsbook.
 * Calculates match probabilities using ELO, Poisson Distribution, Monte Carlo Simulation,
 * Bayesian Inference, and Weighted Historical Averages. Zero hardcoded odds.
 */

// ---------------------------------------------------------------------------
// 1. ELO Rating Calculation
// ---------------------------------------------------------------------------
export function calculateEloProbability(homeElo = 1500, awayElo = 1500, homeAdvantageBonus = 65) {
  const adjustedHomeElo = homeElo + (homeAdvantageBonus || 65);
  const exponent = (awayElo - adjustedHomeElo) / 400.0;
  const homeWinProb = 1.0 / (1.0 + Math.pow(10.0, exponent));
  return {
    homeWin: homeWinProb,
    awayWin: 1.0 - homeWinProb,
  };
}

// ---------------------------------------------------------------------------
// 2. Poisson Distribution Helper
// ---------------------------------------------------------------------------
function factorial(n) {
  if (n <= 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

function poissonPmdf(k, lambda) {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

export function calculatePoissonOutcomes(xGHome = 1.45, xGAway = 1.15, maxGoals = 8) {
  const lHome = Math.max(0.05, xGHome);
  const lAway = Math.max(0.05, xGAway);

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;

  for (let intH = 0; intH <= maxGoals; intH++) {
    for (let intA = 0; intA <= maxGoals; intA++) {
      const pHome = poissonPmdf(intH, lHome);
      const pAway = poissonPmdf(intA, lAway);
      const jointProb = pHome * pAway;

      if (intH > intA) homeWin += jointProb;
      else if (intH === intA) draw += jointProb;
      else awayWin += jointProb;
    }
  }

  const sum = homeWin + draw + awayWin || 1.0;
  return {
    homeWin: homeWin / sum,
    draw: draw / sum,
    awayWin: awayWin / sum,
  };
}

// ---------------------------------------------------------------------------
// 3. Monte Carlo Simulation Engine (10,000 iterations)
// ---------------------------------------------------------------------------
function gaussianRandom(mean = 0, stdev = 1) {
  const u1 = 1.0 - Math.random();
  const u2 = 1.0 - Math.random();
  const randStdNormal = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
  return mean + stdev * randStdNormal;
}

export function runMonteCarloSimulation(features, iterations = 10000) {
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;

  const baseHome = ((features.homeElo || 1500) / 1500.0) * ((features.homeLineupRating || 80) / 80.0) * (1.0 + ((features.homeAdvantageBonus || 65) / 500.0));
  const baseAway = ((features.awayElo || 1500) / 1500.0) * ((features.awayLineupRating || 80) / 80.0);

  const homeInjuriesPenalty = Math.max(0.7, 1.0 - ((features.homeInjuriesCount || 0) * 0.05));
  const awayInjuriesPenalty = Math.max(0.7, 1.0 - ((features.awayInjuriesCount || 0) * 0.05));

  let hStrength = baseHome * homeInjuriesPenalty;
  let aStrength = baseAway * awayInjuriesPenalty;

  if (features.isLive) {
    const momentum = features.inPlayMomentumIndex || 0;
    hStrength *= Math.max(0.5, 1.0 + (momentum * 0.3));
    aStrength *= Math.max(0.5, 1.0 - (momentum * 0.3));
  }

  const isSoccer = (features.sport || 'cricket').toLowerCase() === 'soccer';

  for (let i = 0; i < iterations; i++) {
    const hPerf = gaussianRandom(hStrength, 0.15);
    const aPerf = gaussianRandom(aStrength, 0.15);
    const diff = hPerf - aPerf;

    if (isSoccer) {
      if (Math.abs(diff) < 0.08) draws++;
      else if (diff > 0) homeWins++;
      else awayWins++;
    } else {
      if (diff >= 0) homeWins++;
      else awayWins++;
    }
  }

  return {
    homeWin: homeWins / iterations,
    draw: draws / iterations,
    awayWin: awayWins / iterations,
  };
}

// ---------------------------------------------------------------------------
// 4. Bayesian Inference Engine
// ---------------------------------------------------------------------------
export function calculateBayesianPosterior(priors, features) {
  if (!features.isLive) return priors;

  let homeEvidence = 1.0;
  let awayEvidence = 1.0;

  const hPoss = features.homePossessionPct || 0;
  const aPoss = features.awayPossessionPct || 0;
  if (hPoss > 0 || aPoss > 0) {
    const total = hPoss + aPoss;
    homeEvidence += (hPoss / total) * 0.4;
    awayEvidence += (aPoss / total) * 0.4;
  }

  const hShots = features.homeShotsOnTarget || 0;
  const aShots = features.awayShotsOnTarget || 0;
  homeEvidence += hShots * 0.15;
  awayEvidence += aShots * 0.15;

  const mom = features.inPlayMomentumIndex || 0;
  homeEvidence += Math.max(0, mom) * 0.5;
  awayEvidence += Math.max(0, -mom) * 0.5;

  const uHome = priors.homeWin * homeEvidence;
  const uDraw = priors.draw * 0.9;
  const uAway = priors.awayWin * awayEvidence;
  const sum = uHome + uDraw + uAway || 1.0;

  return {
    homeWin: uHome / sum,
    draw: uDraw / sum,
    awayWin: uAway / sum,
  };
}

// ---------------------------------------------------------------------------
// 5. Weighted Historical Average Engine
// ---------------------------------------------------------------------------
export function calculateWeightedHistoricalAverage(recentForm = [], decayFactor = 0.95) {
  if (!recentForm || recentForm.length === 0) return 0.5;
  let totalWeight = 0.0;
  let weightedSum = 0.0;
  for (let i = 0; i < recentForm.length; i++) {
    const w = Math.pow(decayFactor, i);
    weightedSum += recentForm[i] * w;
    totalWeight += w;
  }
  return weightedSum / totalWeight;
}

// ---------------------------------------------------------------------------
// 6. Master Ensemble Calculator
// ---------------------------------------------------------------------------
export function calculateMatchProbability(features = {}) {
  const isSoccer = (features.sport || 'cricket').toLowerCase() === 'soccer';

  // 1. ELO
  const eloRes = calculateEloProbability(features.homeElo, features.awayElo, features.homeAdvantageBonus);
  let eloHome = eloRes.homeWin;
  let eloAway = eloRes.awayWin;
  let eloDraw = isSoccer ? 0.25 : 0.0;
  if (eloDraw > 0) {
    eloHome *= 0.75;
    eloAway *= 0.75;
  }

  // 2. Poisson
  let poissonRes;
  if (isSoccer) {
    poissonRes = calculatePoissonOutcomes(features.expectedGoalsHome || 1.45, features.expectedGoalsAway || 1.15);
  } else {
    const xRHome = features.expectedRunsHome || 165.0;
    const xRAway = features.expectedRunsAway || 155.0;
    const hWin = xRHome / (xRHome + xRAway);
    poissonRes = { homeWin: hWin, draw: 0.0, awayWin: 1.0 - hWin };
  }

  // 3. Monte Carlo
  const monteCarloRes = runMonteCarloSimulation(features, 10000);

  // 4. Historical
  const homeForm = calculateWeightedHistoricalAverage(features.homeRecentForm);
  const awayForm = calculateWeightedHistoricalAverage(features.awayRecentForm);
  const h2hHome = calculateWeightedHistoricalAverage(features.headToHeadResults);
  const histHome = (homeForm * 0.4) + ((1.0 - awayForm) * 0.4) + (h2hHome * 0.2);
  const histDraw = isSoccer ? 0.22 : 0.0;
  const histAway = 1.0 - histHome - histDraw;

  // 5. Ensemble Weights
  const wElo = 0.30;
  const wPoisson = 0.30;
  const wMonteCarlo = 0.25;
  const wHist = 0.15;

  let priorHome = (eloHome * wElo) + (poissonRes.homeWin * wPoisson) + (monteCarloRes.homeWin * wMonteCarlo) + (histHome * wHist);
  let priorDraw = (eloDraw * wElo) + (poissonRes.draw * wPoisson) + (monteCarloRes.draw * wMonteCarlo) + (histDraw * wHist);
  let priorAway = (eloAway * wElo) + (poissonRes.awayWin * wPoisson) + (monteCarloRes.awayWin * wMonteCarlo) + (histAway * wHist);

  const pSum = priorHome + priorDraw + priorAway || 1.0;
  priorHome /= pSum;
  priorDraw /= pSum;
  priorAway /= pSum;

  // 6. Bayesian In-Play Update
  const finalProbs = calculateBayesianPosterior({ homeWin: priorHome, draw: priorDraw, awayWin: priorAway }, features);

  // 7. Confidence %
  const variance = Math.pow(eloHome - poissonRes.homeWin, 2) + Math.pow(poissonRes.homeWin - monteCarloRes.homeWin, 2);
  const confidence = Math.max(60.0, Math.min(98.5, 95.0 - (variance * 100.0)));

  return {
    matchId: features.matchId || `prob_${Date.now()}`,
    homeWinProbability: Number(finalProbs.homeWin.toFixed(4)),
    drawProbability: Number(finalProbs.draw.toFixed(4)),
    awayWinProbability: Number(finalProbs.awayWin.toFixed(4)),
    confidencePercentage: Number(confidence.toFixed(1)),
    breakdown: {
      elo: { homeWin: Number(eloHome.toFixed(4)), awayWin: Number(eloAway.toFixed(4)) },
      poisson: { homeWin: Number(poissonRes.homeWin.toFixed(4)), draw: Number(poissonRes.draw.toFixed(4)), awayWin: Number(poissonRes.awayWin.toFixed(4)) },
      monteCarlo: { homeWin: Number(monteCarloRes.homeWin.toFixed(4)), draw: Number(monteCarloRes.draw.toFixed(4)), awayWin: Number(monteCarloRes.awayWin.toFixed(4)) },
      bayesian: { homeWin: Number(finalProbs.homeWin.toFixed(4)), draw: Number(finalProbs.draw.toFixed(4)), awayWin: Number(finalProbs.awayWin.toFixed(4)) },
    },
    timestamp: Date.now(),
  };
}
