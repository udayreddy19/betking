/**
 * Enterprise Market Simulation Engine — BetKing Enterprise Platform (lib/simulationEngine.mjs)
 * Simulates expected liability, expected profit, expected exposure, odds movements,
 * market behavior, and risk prior to opening a market.
 */

export function simulateMarketBehavior(proposedMarket = {}, simulatedBets = []) {
  let totalStaked = 0;
  let maxPotentialPayout = 0;

  for (const bet of simulatedBets) {
    const stake = Number(bet.stake) || 0;
    const odds = Number(bet.odds) || 1.0;
    totalStaked += stake;
    if (stake * odds > maxPotentialPayout) {
      maxPotentialPayout = stake * odds;
    }
  }

  const expectedWorstCaseLoss = Math.max(0, maxPotentialPayout - totalStaked);
  const expectedProfitMargin = totalStaked > 0 ? (totalStaked * 0.05) : 0;

  return {
    marketId: proposedMarket.id || 'sim_market',
    totalSimulatedBets: simulatedBets.length,
    expectedStakedVolume: Number(totalStaked.toFixed(2)),
    expectedWorstCaseLoss: Number(expectedWorstCaseLoss.toFixed(2)),
    expectedBookmakerProfit: Number(expectedProfitMargin.toFixed(2)),
    simulatedAt: new Date().toISOString(),
  };
}
