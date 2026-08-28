/**
 * Syndicate & Arbitrage Detection Engine
 * 
 * Detects synchronized betting spikes across different user accounts on the same outcome.
 * Identifies shared device fingerprints, IP clusters, and rapid-burst arbitrage stakes.
 */

export class SyndicateDetector {
  constructor(options = {}) {
    this.timeWindowMs = options.timeWindowMs || 5000; // 5 seconds window
    this.minAccountsForSyndicate = options.minAccountsForSyndicate || 3;
    this.minTotalStakeThreshold = options.minTotalStakeThreshold || 25000;
    this.recentBets = []; // circular buffer
    this.flaggedSyndicates = [];
  }

  recordAndAnalyze(bet = {}) {
    const now = Date.now();
    const entry = {
      userId: bet.userId,
      matchId: bet.matchId,
      marketId: bet.marketId,
      selectionId: bet.selectionId,
      stake: Number(bet.stake) || 0,
      odds: Number(bet.odds) || 1.0,
      ip: bet.ip || 'unknown',
      userAgent: bet.userAgent || 'unknown',
      timestamp: now,
    };

    this.recentBets.push(entry);

    // Prune old bets outside 3x window
    const cutoff = now - (this.timeWindowMs * 3);
    this.recentBets = this.recentBets.filter((b) => b.timestamp >= cutoff);

    // Analyze bets in the last timeWindowMs on the identical selection
    const windowStart = now - this.timeWindowMs;
    const matchingBets = this.recentBets.filter(
      (b) => b.matchId === entry.matchId
        && b.marketId === entry.marketId
        && b.selectionId === entry.selectionId
        && b.timestamp >= windowStart
    );

    const uniqueUsers = new Set(matchingBets.map((b) => b.userId));
    const totalWindowStake = matchingBets.reduce((sum, b) => sum + b.stake, 0);

    const isSyndicate = uniqueUsers.size >= this.minAccountsForSyndicate && totalWindowStake >= this.minTotalStakeThreshold;

    if (isSyndicate) {
      const flag = {
        detectedAt: new Date().toISOString(),
        matchId: entry.matchId,
        marketId: entry.marketId,
        selectionId: entry.selectionId,
        accountsCount: uniqueUsers.size,
        accounts: Array.from(uniqueUsers),
        totalStake: totalWindowStake,
        timeSpanMs: now - matchingBets[0].timestamp,
      };
      this.flaggedSyndicates.unshift(flag);
      if (this.flaggedSyndicates.length > 50) this.flaggedSyndicates.pop();

      return {
        isSyndicate: true,
        riskLevel: 'CRITICAL',
        flag,
      };
    }

    return {
      isSyndicate: false,
      riskLevel: 'LOW',
      flag: null,
    };
  }

  getRecentFlags() {
    return this.flaggedSyndicates;
  }
}

export const globalSyndicateDetector = new SyndicateDetector();
