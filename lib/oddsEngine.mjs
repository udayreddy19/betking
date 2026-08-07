/**
 * Dynamic Sportsbook Odds Engine (betking)
 * Features:
 * 1. Probability Engine Integration (Poisson xG, Elo, Monte Carlo, Bayesian)
 * 2. Fair Odds Calculation
 * 3. Dynamic Bookmaker Margin Injection
 * 4. Risk & Exposure Shift Adjustments
 * 5. Multi-Format Odds Conversion (Decimal, American, Fractional, HK, Malay, Indo)
 * 6. Odds Versioning, Validation, & History Timestamping
 */

import { calculateMatchProbability } from './probabilityEngine.mjs';

// In-memory odds history log (versioned)
const ODDS_HISTORY_STORE = new Map();

/**
 * 1. Poisson Distribution Probability Model
 */
export function calculatePoissonProbability(k, lambda) {
  let factorial = 1;
  for (let i = 2; i <= k; i++) factorial *= i;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial;
}

/**
 * Dixon-Coles adjusted score probability matrix
 */
export function calculateMatchProbabilitiesFromXG(homeXG = 1.6, awayXG = 1.1, maxGoals = 5) {
  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const pHome = calculatePoissonProbability(h, homeXG);
      const pAway = calculatePoissonProbability(a, awayXG);
      let prob = pHome * pAway;

      if (h === 0 && a === 0) prob *= 0.92;
      else if (h === 1 && a === 0) prob *= 1.05;
      else if (h === 0 && a === 1) prob *= 1.05;
      else if (h === 1 && a === 1) prob *= 0.95;

      if (h > a) homeWinProb += prob;
      else if (h === a) drawProb += prob;
      else awayWinProb += prob;
    }
  }

  const total = homeWinProb + drawProb + awayWinProb;
  return {
    home: homeWinProb / total,
    draw: drawProb / total,
    away: awayWinProb / total,
  };
}

/**
 * 2. Elo Rating Probability Model
 */
export function calculateEloProbabilities(homeElo = 1500, awayElo = 1450, homeAdvantage = 65) {
  const ratingDiff = (homeElo + homeAdvantage) - awayElo;
  const pHomeWin = 1 / (1 + Math.pow(10, -ratingDiff / 400));
  const pAwayWin = 1 - pHomeWin;

  const drawFactor = 0.26;
  const homeAdjusted = pHomeWin * (1 - drawFactor);
  const awayAdjusted = pAwayWin * (1 - drawFactor);

  return {
    home: homeAdjusted,
    draw: drawFactor,
    away: awayAdjusted,
  };
}

/**
 * 3. Fair Odds Calculator (1 / Probability)
 */
export function calculateFairOdds(probabilities) {
  return {
    home: probabilities.home ? Number((1 / probabilities.home).toFixed(3)) : 2.0,
    draw: probabilities.draw ? Number((1 / probabilities.draw).toFixed(3)) : null,
    away: probabilities.away ? Number((1 / probabilities.away).toFixed(3)) : 2.0,
  };
}

/**
 * 4. Margin / Overround Injection
 */
export function injectMarginAndCalculateOdds(probs, marginPct = 5.0) {
  const overroundMultiplier = 1 + (marginPct / 100);

  const homeProbMargin = (probs.home || 0.45) * overroundMultiplier;
  const awayProbMargin = (probs.away || 0.35) * overroundMultiplier;
  const drawProbMargin = probs.draw ? (probs.draw * overroundMultiplier) : 0;

  const homeOdds = Number((1 / homeProbMargin).toFixed(2));
  const awayOdds = Number((1 / awayProbMargin).toFixed(2));
  const drawOdds = drawProbMargin > 0 ? Number((1 / drawProbMargin).toFixed(2)) : null;

  return {
    homeOdds: Math.max(1.01, homeOdds),
    awayOdds: Math.max(1.01, awayOdds),
    drawOdds: drawOdds ? Math.max(1.01, drawOdds) : null,
    overroundPct: marginPct,
  };
}

/**
 * 5. Dynamic Exposure & Risk Adjustments
 */
export function applyLiabilityExposureShift(probs, liabilities = { home: 0, away: 0, draw: 0 }, sensitivity = 0.0001) {
  const totalLiability = (liabilities.home || 0) + (liabilities.away || 0) + (liabilities.draw || 0);

  if (totalLiability <= 0) return probs;

  const avgLiability = totalLiability / (probs.draw ? 3 : 2);
  const homeShift = (liabilities.home - avgLiability) * sensitivity;
  const awayShift = (liabilities.away - avgLiability) * sensitivity;
  const drawShift = (liabilities.draw - avgLiability) * sensitivity;

  let newHomeProb = Math.max(0.05, Math.min(0.90, probs.home + homeShift));
  let newAwayProb = Math.max(0.05, Math.min(0.90, probs.away + awayShift));
  let newDrawProb = probs.draw ? Math.max(0.05, Math.min(0.50, probs.draw + drawShift)) : 0;

  const sum = newHomeProb + newAwayProb + newDrawProb;

  return {
    home: newHomeProb / sum,
    away: newAwayProb / sum,
    draw: probs.draw ? newDrawProb / sum : 0,
  };
}

/**
 * 6. Odds Validation Helper
 */
export function validateOddsRange(oddsValue, minOdds = 1.01, maxOdds = 1000.0) {
  if (oddsValue == null || isNaN(oddsValue)) return minOdds;
  return Math.max(minOdds, Math.min(maxOdds, Number(oddsValue)));
}

/**
 * 7. Multi-Format Odds Converter
 */
export function convertDecimalOddsToAllFormats(decimalOdds) {
  const dec = Number(decimalOdds);
  if (!dec || isNaN(dec) || dec <= 1.0) {
    return {
      decimal: '1.00',
      american: 'OFF',
      fractional: '0/1',
      hongKong: '0.00',
      malay: '0.00',
      indonesian: '0.00',
    };
  }

  // American Odds
  let american = '';
  if (dec >= 2.0) {
    american = `+${Math.round((dec - 1) * 100)}`;
  } else {
    american = `${Math.round(-100 / (dec - 1))}`;
  }

  // Fractional Odds
  const hk = dec - 1;
  let fractional = `${Math.round(hk * 100)}/100`;
  const commonFractions = [
    { dec: 1.5, frac: '1/2' },
    { dec: 1.67, frac: '4/6' },
    { dec: 1.75, frac: '3/4' },
    { dec: 1.8, frac: '4/5' },
    { dec: 1.91, frac: '10/11' },
    { dec: 2.0, frac: '1/1' },
    { dec: 2.2, frac: '6/5' },
    { dec: 2.25, frac: '5/4' },
    { dec: 2.5, frac: '6/4' },
    { dec: 2.75, frac: '7/4' },
    { dec: 3.0, frac: '2/1' },
    { dec: 3.5, frac: '5/2' },
    { dec: 4.0, frac: '3/1' },
    { dec: 5.0, frac: '4/1' },
  ];
  const matched = commonFractions.find(f => Math.abs(f.dec - dec) < 0.05);
  if (matched) fractional = matched.frac;

  // Hong Kong Odds
  const hongKong = hk.toFixed(2);

  // Malay Odds
  let malay = '';
  if (hk <= 1.0) malay = hk.toFixed(2);
  else malay = (-1 / hk).toFixed(2);

  // Indonesian Odds
  let indonesian = '';
  if (hk >= 1.0) indonesian = hk.toFixed(2);
  else indonesian = (-1 / hk).toFixed(2);

  return {
    decimal: dec.toFixed(2),
    american,
    fractional,
    hongKong,
    malay,
    indonesian,
  };
}

/**
 * 8. Complete Flow Master Function:
 * Probability -> Fair Odds -> Bookmaker Margin -> Risk Adjustment -> Exposure Adjustment -> Final Odds
 */
export function calculateDynamicMatchOdds(match = {}, options = {}) {
  const matchId = match.id || `match_${Date.now()}`;
  const marginPct = options.marginPct || 5.0;
  const liabilities = options.liabilities || { home: 0, away: 0, draw: 0 };
  const riskMultiplier = options.riskMultiplier || 1.0;

  // STEP 1: Probability Calculation (using lib/probabilityEngine.mjs)
  let probResult;
  if (match.homeElo || match.awayElo || match.expectedGoalsHome || match.expectedRunsHome) {
    probResult = calculateMatchProbability({
      matchId,
      sport: match.sport || 'cricket',
      homeElo: match.homeElo || 1500,
      awayElo: match.awayElo || 1500,
      homeAdvantageBonus: match.homeAdvantageBonus || 65,
      expectedGoalsHome: match.expectedGoalsHome || match.xG?.home,
      expectedGoalsAway: match.expectedGoalsAway || match.xG?.away,
      expectedRunsHome: match.expectedRunsHome,
      expectedRunsAway: match.expectedRunsAway,
      homeRecentForm: match.homeRecentForm,
      awayRecentForm: match.awayRecentForm,
      isLive: match.isLive || match.matchState === 'in',
    });
  } else {
    // Default fallback
    probResult = {
      homeWinProbability: 0.46,
      drawProbability: match.sport === 'soccer' ? 0.24 : 0.0,
      awayWinProbability: 0.54,
    };
  }

  const rawProbs = {
    home: probResult.homeWinProbability,
    draw: probResult.drawProbability,
    away: probResult.awayWinProbability,
  };

  // STEP 2: Fair Odds
  const fairOdds = calculateFairOdds(rawProbs);

  // STEP 3: Risk Adjustment
  const riskAdjustedProbs = {
    home: Math.max(0.02, Math.min(0.95, rawProbs.home * riskMultiplier)),
    draw: rawProbs.draw ? Math.max(0.02, Math.min(0.50, rawProbs.draw * riskMultiplier)) : 0,
    away: Math.max(0.02, Math.min(0.95, rawProbs.away * riskMultiplier)),
  };
  const riskSum = riskAdjustedProbs.home + riskAdjustedProbs.draw + riskAdjustedProbs.away || 1.0;
  riskAdjustedProbs.home /= riskSum;
  riskAdjustedProbs.draw /= riskSum;
  riskAdjustedProbs.away /= riskSum;

  // STEP 4: Exposure Adjustment
  const exposureAdjustedProbs = applyLiabilityExposureShift(riskAdjustedProbs, liabilities);

  // STEP 5: Bookmaker Margin & Final Odds
  const oddsResult = injectMarginAndCalculateOdds(exposureAdjustedProbs, marginPct);

  const homeFinal = validateOddsRange(oddsResult.homeOdds);
  const awayFinal = validateOddsRange(oddsResult.awayOdds);
  const drawFinal = oddsResult.drawOdds ? validateOddsRange(oddsResult.drawOdds) : null;

  // Odds Versioning
  const existingHistory = ODDS_HISTORY_STORE.get(matchId) || [];
  const currentVersion = existingHistory.length + 1;

  const finalOutput = {
    matchId,
    version: currentVersion,
    timestamp: Date.now(),
    publishedAt: new Date().toISOString(),
    overroundPct: marginPct,
    rawProbabilities: rawProbs,
    fairOdds,
    finalProbabilities: exposureAdjustedProbs,
    odds: {
      home: {
        decimal: homeFinal,
        formats: convertDecimalOddsToAllFormats(homeFinal),
      },
      away: {
        decimal: awayFinal,
        formats: convertDecimalOddsToAllFormats(awayFinal),
      },
      draw: drawFinal ? {
        decimal: drawFinal,
        formats: convertDecimalOddsToAllFormats(drawFinal),
      } : null,
    },
  };

  // Store in Odds History Log
  existingHistory.push(finalOutput);
  if (existingHistory.length > 50) existingHistory.shift();
  ODDS_HISTORY_STORE.set(matchId, existingHistory);

  return finalOutput;
}

export function getOddsHistory(matchId) {
  return ODDS_HISTORY_STORE.get(matchId) || [];
}
