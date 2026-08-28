/**
 * Real-time Match Liability & Book Exposure Tracker
 * 
 * Aggregates live sportsbook exposure per match, market, and selection.
 * Calculates worst-case book payout liability and recommends market suspension
 * if cumulative exposure exceeds the house risk tolerance.
 */

export class MatchLiabilityTracker {
  constructor(options = {}) {
    this.maxMatchLiability = options.maxMatchLiability || 500000.0;
    this.maxSelectionLiability = options.maxSelectionLiability || 200000.0;
    // Map: matchId -> { totalStakes, markets: Map(marketId -> Map(selectionId -> { totalStake, totalPotentialPayout, count })) }
    this.matchBooks = new Map();
  }

  recordBet(bet = {}) {
    const matchId = String(bet.matchId || 'global');
    const marketId = String(bet.marketId || 'winner');
    const selectionId = String(bet.selectionId || 'default');
    const stake = Number(bet.stake) || 0;
    const odds = Number(bet.odds) || 1.0;
    const potentialPayout = stake * odds;

    let book = this.matchBooks.get(matchId);
    if (!book) {
      book = { totalStakes: 0, markets: new Map() };
      this.matchBooks.set(matchId, book);
    }
    book.totalStakes += stake;

    let marketMap = book.markets.get(marketId);
    if (!marketMap) {
      marketMap = new Map();
      book.markets.set(marketId, marketMap);
    }

    let sel = marketMap.get(selectionId);
    if (!sel) {
      sel = { selectionId, totalStake: 0, totalPotentialPayout: 0, count: 0 };
      marketMap.set(selectionId, sel);
    }

    sel.totalStake += stake;
    sel.totalPotentialPayout += potentialPayout;
    sel.count += 1;

    return this.getLiabilityReport(matchId, marketId);
  }

  getLiabilityReport(matchId, marketId = null) {
    const book = this.matchBooks.get(matchId);
    if (!book) {
      return {
        matchId,
        totalStakes: 0,
        maxLiability: 0,
        worstCaseOutcome: null,
        isOverLimit: false,
        markets: [],
      };
    }

    const marketReports = [];
    let matchMaxLiability = 0;
    let worstOutcome = null;

    for (const [mId, selMap] of book.markets.entries()) {
      if (marketId && mId !== marketId) continue;

      let marketTotalStakes = 0;
      const selections = [];

      for (const [sId, data] of selMap.entries()) {
        marketTotalStakes += data.totalStake;
        // Net liability on this outcome winning = Total Potential Payout on outcome - Total stakes on all other outcomes in this market
        const netLiability = data.totalPotentialPayout - book.totalStakes;
        selections.push({
          selectionId: sId,
          betsCount: data.count,
          totalStake: Number(data.totalStake.toFixed(2)),
          totalPotentialPayout: Number(data.totalPotentialPayout.toFixed(2)),
          netLiability: Number(netLiability.toFixed(2)),
        });

        if (netLiability > matchMaxLiability) {
          matchMaxLiability = netLiability;
          worstOutcome = { marketId: mId, selectionId: sId, netLiability };
        }
      }

      marketReports.push({
        marketId: mId,
        totalStakes: Number(marketTotalStakes.toFixed(2)),
        selections,
      });
    }

    return {
      matchId,
      totalStakes: Number(book.totalStakes.toFixed(2)),
      maxLiability: Number(matchMaxLiability.toFixed(2)),
      worstCaseOutcome: worstOutcome,
      isOverLimit: matchMaxLiability > this.maxMatchLiability,
      markets: marketReports,
    };
  }

  reset(matchId = null) {
    if (matchId) {
      this.matchBooks.delete(matchId);
    } else {
      this.matchBooks.clear();
    }
  }
}

export const globalLiabilityTracker = new MatchLiabilityTracker();
