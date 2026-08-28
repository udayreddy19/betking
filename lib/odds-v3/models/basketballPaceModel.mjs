/**
 * OddsEngineV3 — Basketball Possession & Pace Model
 * 
 * Computes fair moneyline, spread, and game total probabilities:
 * - Expected Pace (possessions per 48 mins, default ~100)
 * - Offensive / Defensive Efficiency (points per 100 possessions)
 * - Live minute and quarter progression
 */

function normalCDF(z) {
  const p = 0.3275911;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;

  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const erf = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * erf);
}

export function calculateBasketballProbabilities({
  homeOffensiveRating = 112,
  homeDefensiveRating = 110,
  awayOffensiveRating = 110,
  awayDefensiveRating = 112,
  expectedPace = 98,
  currentHomeScore = 0,
  currentAwayScore = 0,
  minute = 0,
  totalGameMinutes = 48,
}) {
  const remainingFraction = Math.max(0, (totalGameMinutes - Math.min(totalGameMinutes, minute)) / totalGameMinutes);
  const remainingPossessions = expectedPace * remainingFraction;

  const homeExpPointsPerPoss = (homeOffensiveRating + awayDefensiveRating) / 200;
  const awayExpPointsPerPoss = (awayOffensiveRating + homeDefensiveRating) / 200;

  const expRemainingHome = remainingPossessions * homeExpPointsPerPoss;
  const expRemainingAway = remainingPossessions * awayExpPointsPerPoss;

  const finalExpHome = currentHomeScore + expRemainingHome;
  const finalExpAway = currentAwayScore + expRemainingAway;

  const spreadMean = finalExpHome - finalExpAway;
  // Standard deviation of basketball scoring spread scales with sqrt(remaining possessions)
  const spreadStdDev = Math.max(3.5, Math.sqrt(remainingPossessions) * 1.4);

  // P(Home Win) = P(FinalHome - FinalAway > 0)
  const zScore = spreadMean / spreadStdDev;
  const pHomeWin = Math.max(0.01, Math.min(0.99, normalCDF(zScore)));
  const pAwayWin = 1 - pHomeWin;

  const totalMean = finalExpHome + finalExpAway;
  const totalStdDev = Math.max(5.0, Math.sqrt(remainingPossessions) * 1.8);

  return {
    modelVersion: 'basketball_pace_v1',
    expectedHomeScore: Number(finalExpHome.toFixed(1)),
    expectedAwayScore: Number(finalExpAway.toFixed(1)),
    expectedTotal: Number(totalMean.toFixed(1)),
    pHomeWin: Number(pHomeWin.toFixed(4)),
    pAwayWin: Number(pAwayWin.toFixed(4)),
    calculateOverUnderProb: (line) => {
      const z = (line - totalMean) / totalStdDev;
      const pUnder = normalCDF(z);
      return {
        line,
        pOver: Number((1 - pUnder).toFixed(4)),
        pUnder: Number(pUnder.toFixed(4)),
      };
    },
    confidence: Number((0.88 * (1 - (minute / 96))).toFixed(2)),
  };
}
