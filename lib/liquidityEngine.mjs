/**
 * Enterprise Liquidity Engine — BetKing Enterprise Platform (lib/liquidityEngine.mjs)
 * Tracks market liquidity, bet volume throughput, market confidence, market stability,
 * and large money flow detection.
 */

const MARKET_LIQUIDITY_STORE = new Map();

export function updateMarketLiquidity(marketId, stakeAmount = 0) {
  let record = MARKET_LIQUIDITY_STORE.get(marketId) || {
    marketId,
    totalStaked: 0,
    totalBets: 0,
    largeBetsCount: 0,
    marketStabilityScore: 100, // 0 - 100
  };

  const stake = Number(stakeAmount) || 0;
  record.totalStaked += stake;
  record.totalBets += 1;

  if (stake > 50000) {
    record.largeBetsCount += 1;
    record.marketStabilityScore = Math.max(20, record.marketStabilityScore - 5);
  }

  MARKET_LIQUIDITY_STORE.set(marketId, record);
  return record;
}

export function getMarketLiquiditySummary(marketId) {
  return MARKET_LIQUIDITY_STORE.get(marketId) || { marketId, totalStaked: 0, totalBets: 0, marketStabilityScore: 100 };
}
