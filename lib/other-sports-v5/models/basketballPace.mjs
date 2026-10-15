/**
 * Basketball / American football pace model (points per 100 possessions).
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
} = {}) {
  const remainingFraction = Math.max(0, (totalGameMinutes - Math.min(totalGameMinutes, minute)) / totalGameMinutes);
  const remainingPossessions = expectedPace * remainingFraction;

  const homeExpPointsPerPoss = (homeOffensiveRating + awayDefensiveRating) / 200;
  const awayExpPointsPerPoss = (awayOffensiveRating + homeDefensiveRating) / 200;

  const expRemainingHome = remainingPossessions * homeExpPointsPerPoss;
  const expRemainingAway = remainingPossessions * awayExpPointsPerPoss;

  const finalExpHome = currentHomeScore + expRemainingHome;
  const finalExpAway = currentAwayScore + expRemainingAway;

  const spreadMean = finalExpHome - finalExpAway;
  const spreadStdDev = Math.max(3.5, Math.sqrt(Math.max(1, remainingPossessions)) * 1.4);
  const zScore = spreadMean / spreadStdDev;
  const pHomeWin = Math.max(0.01, Math.min(0.99, normalCDF(zScore)));
  const pAwayWin = 1 - pHomeWin;

  const totalMean = finalExpHome + finalExpAway;
  const totalStdDev = Math.max(5.0, Math.sqrt(Math.max(1, remainingPossessions)) * 1.8);

  // Disjoint margin intervals partitioning (-inf, inf)
  function probRange(lo, hi) {
    return normalCDF((hi - spreadMean) / spreadStdDev) - normalCDF((lo - spreadMean) / spreadStdDev);
  }
  const pDrawOt = Math.max(0.01, probRange(-0.5, 0.5));
  const p1to5 = Math.max(0.02, probRange(0.5, 5.5) + probRange(-5.5, -0.5));
  const p6to10 = Math.max(0.02, probRange(5.5, 10.5) + probRange(-10.5, -5.5));
  const p11to15 = Math.max(0.01, probRange(10.5, 15.5) + probRange(-15.5, -10.5));
  const p16Plus = Math.max(0.01, (1 - normalCDF((15.5 - spreadMean) / spreadStdDev)) + normalCDF((-15.5 - spreadMean) / spreadStdDev));

  // Normalize sum to 1.0
  const totalWmMargins = pDrawOt + p1to5 + p6to10 + p11to15 + p16Plus;
  const wmProbabilities = {
    'WM:1-5': Number((p1to5 / totalWmMargins).toFixed(4)),
    'WM:6-10': Number((p6to10 / totalWmMargins).toFixed(4)),
    'WM:11-15': Number((p11to15 / totalWmMargins).toFixed(4)),
    'WM:16+': Number((p16Plus / totalWmMargins).toFixed(4)),
    'WM:draw': Number((pDrawOt / totalWmMargins).toFixed(4)),
  };

  const teamStdDev = Math.max(3.5, totalStdDev / Math.SQRT2);

  return {
    modelVersion: 'osv4_basketball_pace_v2',
    expectedHomeScore: Number(finalExpHome.toFixed(1)),
    expectedAwayScore: Number(finalExpAway.toFixed(1)),
    expectedTotal: Number(totalMean.toFixed(1)),
    expectedSpread: Number(spreadMean.toFixed(1)),
    pHomeWin: Number(pHomeWin.toFixed(4)),
    pAwayWin: Number(pAwayWin.toFixed(4)),
    winningMargins: wmProbabilities,
    calculateOverUnderProb(line) {
      const z = (Number(line) - totalMean) / totalStdDev;
      const pUnder = normalCDF(z);
      return {
        line: Number(line),
        pOver: Number((1 - pUnder).toFixed(4)),
        pUnder: Number(pUnder.toFixed(4)),
      };
    },
    calculateTeamTotalProb(isHome, line) {
      const mean = isHome ? finalExpHome : finalExpAway;
      const z = (Number(line) - mean) / teamStdDev;
      const pUnder = normalCDF(z);
      return {
        line: Number(line),
        pOver: Number((1 - pUnder).toFixed(4)),
        pUnder: Number(pUnder.toFixed(4)),
      };
    },
    calculateSpreadCoverProb(line, homeGives) {
      // P(home - away > line) when home is favorite laying points
      const adjMean = homeGives ? spreadMean - Number(line) : spreadMean + Number(line);
      const z = adjMean / spreadStdDev;
      const pHomeCover = Math.max(0.02, Math.min(0.98, normalCDF(z)));
      return {
        line: Number(line),
        pHomeCover: Number(pHomeCover.toFixed(4)),
        pAwayCover: Number((1 - pHomeCover).toFixed(4)),
      };
    },
    confidence: Number((0.88 * (1 - (minute / (totalGameMinutes * 2)))).toFixed(2)),
  };
}
