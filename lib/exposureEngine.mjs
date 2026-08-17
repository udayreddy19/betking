/**
 * Enterprise Exposure Engine — OddsYra Sportsbook (lib/exposureEngine.mjs)
 * Tracks active liabilities, potential payouts, worst-case loss scenarios,
 * and automatically calculates recommended odds shifts for risk mitigation.
 */

// In-memory exposure tracking store keyed by matchId
const EXPOSURE_STORE = new Map();

/**
 * Record a new bet placed into the exposure calculator store
 */
export function recordBetExposure(bet = {}) {
  const matchId = bet.matchId || 'global';
  const marketId = bet.marketId || 'winner';
  const selectionId = bet.selectionId || 'home';
  const stake = Number(bet.stake) || 0;
  const odds = Number(bet.odds) || 1.0;
  const potentialPayout = stake * odds;
  const netLiability = potentialPayout - stake;

  let matchData = EXPOSURE_STORE.get(matchId);
  if (!matchData) {
    matchData = {
      matchId,
      totalBetsCount: 0,
      totalStaked: 0,
      totalPotentialPayout: 0,
      markets: new Map(),
    };
    EXPOSURE_STORE.set(matchId, matchData);
  }

  matchData.totalBetsCount += 1;
  matchData.totalStaked += stake;
  matchData.totalPotentialPayout += potentialPayout;

  let marketData = matchData.markets.get(marketId);
  if (!marketData) {
    marketData = {
      marketId,
      totalBetsCount: 0,
      totalStaked: 0,
      selections: new Map(),
    };
    matchData.markets.set(marketId, marketData);
  }

  marketData.totalBetsCount += 1;
  marketData.totalStaked += stake;

  let selectionData = marketData.selections.get(selectionId);
  if (!selectionData) {
    selectionData = {
      selectionId,
      betsCount: 0,
      staked: 0,
      potentialPayout: 0,
      netLiability: 0,
    };
    marketData.selections.set(selectionId, selectionData);
  }

  selectionData.betsCount += 1;
  selectionData.staked += stake;
  selectionData.potentialPayout += potentialPayout;
  selectionData.netLiability += netLiability;

  return calculateMatchExposureMetrics(matchId);
}

/**
 * Calculates complete exposure metrics & worst-case loss for a match
 */
export function calculateMatchExposureMetrics(matchId) {
  const matchData = EXPOSURE_STORE.get(matchId);
  if (!matchData) {
    return {
      matchId,
      totalBetsCount: 0,
      totalStaked: 0,
      totalPotentialPayout: 0,
      netBookmakerLiability: 0,
      worstCaseLoss: 0,
      highestRiskSelection: null,
      highestRiskMarket: null,
      recommendedOddsMovements: {},
    };
  }

  let highestRiskSelection = null;
  let maxSelectionLiability = -1;

  let highestRiskMarket = null;
  let maxMarketLiability = -1;

  let worstCaseLoss = 0;

  const marketSummaries = [];

  for (const [mId, mData] of matchData.markets.entries()) {
    let marketLiabilitySum = 0;
    const selectionSummaries = [];

    for (const [sId, sData] of mData.selections.entries()) {
      // Bookmaker payout if this selection wins: sData.potentialPayout minus stakes on OTHER selections in market
      const otherStakesInMarket = mData.totalStaked - sData.staked;
      const netOutcomeLoss = sData.potentialPayout - (sData.staked + otherStakesInMarket);

      if (netOutcomeLoss > maxSelectionLiability) {
        maxSelectionLiability = netOutcomeLoss;
        highestRiskSelection = { marketId: mId, selectionId: sId, netLiability: netOutcomeLoss };
      }

      if (netOutcomeLoss > worstCaseLoss) {
        worstCaseLoss = netOutcomeLoss;
      }

      marketLiabilitySum += Math.max(0, netOutcomeLoss);

      selectionSummaries.push({
        selectionId: sId,
        betsCount: sData.betsCount,
        staked: Number(sData.staked.toFixed(2)),
        potentialPayout: Number(sData.potentialPayout.toFixed(2)),
        netLiability: Number(netOutcomeLoss.toFixed(2)),
      });
    }

    if (marketLiabilitySum > maxMarketLiability) {
      maxMarketLiability = marketLiabilitySum;
      highestRiskMarket = mId;
    }

    marketSummaries.push({
      marketId: mId,
      totalStaked: Number(mData.totalStaked.toFixed(2)),
      selections: selectionSummaries,
    });
  }

  // Calculate Automatic Odds Movement Recommendations
  const recommendedOddsMovements = {};
  if (highestRiskSelection && highestRiskSelection.netLiability > 1000) {
    const shiftPct = Math.min(0.25, (highestRiskSelection.netLiability / 50000));
    recommendedOddsMovements[highestRiskSelection.selectionId] = {
      action: 'SHORTEN_ODDS',
      suggestedReductionPct: Number((shiftPct * 100).toFixed(2)),
      reason: `High liability detected ($${highestRiskSelection.netLiability.toFixed(2)})`,
    };
  }

  return {
    matchId,
    totalBetsCount: matchData.totalBetsCount,
    totalStaked: Number(matchData.totalStaked.toFixed(2)),
    totalPotentialPayout: Number(matchData.totalPotentialPayout.toFixed(2)),
    worstCaseLoss: Number(worstCaseLoss.toFixed(2)),
    highestRiskSelection,
    highestRiskMarket,
    markets: marketSummaries,
    recommendedOddsMovements,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Get system-wide aggregate exposure metrics across all matches
 */
export function getSystemWideExposureSummary() {
  let globalBets = 0;
  let globalStaked = 0;
  let globalPayout = 0;
  let globalWorstCaseLoss = 0;
  let highestMatch = null;
  let maxMatchLoss = -1;

  for (const [mId, mData] of EXPOSURE_STORE.entries()) {
    const metrics = calculateMatchExposureMetrics(mId);
    globalBets += metrics.totalBetsCount;
    globalStaked += metrics.totalStaked;
    globalPayout += metrics.totalPotentialPayout;

    if (metrics.worstCaseLoss > maxMatchLoss) {
      maxMatchLoss = metrics.worstCaseLoss;
      highestMatch = mId;
    }

    globalWorstCaseLoss += metrics.worstCaseLoss;
  }

  return {
    globalBetsCount: globalBets,
    globalStakedAmount: Number(globalStaked.toFixed(2)),
    globalPotentialPayout: Number(globalPayout.toFixed(2)),
    globalWorstCaseLoss: Number(globalWorstCaseLoss.toFixed(2)),
    highestRiskMatchId: highestMatch,
    timestamp: Date.now(),
  };
}

export function calculateExposureRisk({ matchId = 'global', marketId = 'winner', stake = 0, odds = 1.95, maxLiabilityLimit = 500000 }) {
  const metrics = calculateMatchExposureMetrics(matchId);
  const potentialPayout = stake * odds;
  const newWorstCase = metrics.worstCaseLoss + (potentialPayout - stake);
  const exceedsMaxLiability = newWorstCase > maxLiabilityLimit;
  const remainingCapacity = Math.max(0, maxLiabilityLimit - metrics.worstCaseLoss);

  return {
    exceedsMaxLiability,
    currentLiability: metrics.worstCaseLoss,
    newWorstCase,
    maxLiabilityLimit,
    remainingCapacity,
  };
}

