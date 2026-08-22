/**
 * Shared accumulator (multi) odds and payout math for client + server.
 * Round only the final payout to 2dp — do not round the combined odds before multiplying.
 */

export function computeAccumulatorPayout(stake, legOdds = []) {
  const decStake = Number(stake) || 0;
  const combinedOdds = legOdds.reduce((acc, raw) => acc * (Number(raw) || 1), 1);
  const potentialPayout = Math.round(decStake * combinedOdds * 100) / 100;
  const displayOdds = Math.round(combinedOdds * 100) / 100;
  const potentialProfit = Math.round((potentialPayout - decStake) * 100) / 100;

  return {
    combinedOdds: displayOdds,
    fullCombinedOdds: combinedOdds,
    potentialPayout,
    potentialProfit,
    liability: potentialProfit,
  };
}
