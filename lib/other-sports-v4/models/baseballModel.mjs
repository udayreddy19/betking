/**
 * Baseball run-expectancy model (OtherSportsEngineV4).
 * Projects remaining runs from innings/outs remaining + score differential.
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

/**
 * @param {object} opts
 * @returns {object} same shape as basketballPace for market generators
 */
export function calculateBaseballProbabilities({
  homeRpg = 4.5,
  awayRpg = 4.2,
  totalInnings = 9,
  currentHomeScore = 0,
  currentAwayScore = 0,
  inning = 1,
  isTopInning = true,
} = {}) {
  // Remaining half-innings
  const totalHalfInnings = totalInnings * 2;
  const completedHalfInnings = Math.max(0, (inning - 1) * 2 + (isTopInning ? 0 : 1));
  const remainingFraction = Math.max(0, (totalHalfInnings - completedHalfInnings) / totalHalfInnings);

  const homeRemainingRuns = homeRpg * remainingFraction;
  const awayRemainingRuns = awayRpg * remainingFraction;

  const finalExpHome = currentHomeScore + homeRemainingRuns;
  const finalExpAway = currentAwayScore + awayRemainingRuns;
  const spreadMean = finalExpHome - finalExpAway;
  // Baseball scoring is lower-variance than basketball
  const spreadStdDev = Math.max(2.0, Math.sqrt(Math.max(0.5, remainingFraction * totalInnings)) * 1.8);
  const zScore = spreadMean / spreadStdDev;
  const pHomeWin = Math.max(0.02, Math.min(0.98, normalCDF(zScore)));
  const pAwayWin = 1 - pHomeWin;
  const totalMean = finalExpHome + finalExpAway;
  const totalStdDev = Math.max(2.5, Math.sqrt(Math.max(0.5, remainingFraction * totalInnings)) * 2.2);

  return {
    modelVersion: 'osv4_baseball_run_exp_v1',
    expectedHomeScore: Number(finalExpHome.toFixed(1)),
    expectedAwayScore: Number(finalExpAway.toFixed(1)),
    expectedTotal: Number(totalMean.toFixed(1)),
    expectedSpread: Number(spreadMean.toFixed(1)),
    pHomeWin: Number(pHomeWin.toFixed(4)),
    pAwayWin: Number(pAwayWin.toFixed(4)),
    calculateOverUnderProb(line) {
      const z = (Number(line) - totalMean) / totalStdDev;
      const pUnder = normalCDF(z);
      return {
        line: Number(line),
        pOver: Number((1 - pUnder).toFixed(4)),
        pUnder: Number(pUnder.toFixed(4)),
      };
    },
    calculateSpreadCoverProb(line, homeGives) {
      const adjMean = homeGives ? spreadMean - Number(line) : spreadMean + Number(line);
      const z = adjMean / spreadStdDev;
      const pHomeCover = Math.max(0.02, Math.min(0.98, normalCDF(z)));
      return {
        line: Number(line),
        pHomeCover: Number(pHomeCover.toFixed(4)),
        pAwayCover: Number((1 - pHomeCover).toFixed(4)),
      };
    },
    confidence: Number((0.85 * (1 - (completedHalfInnings / (totalHalfInnings * 2)))).toFixed(2)),
  };
}
