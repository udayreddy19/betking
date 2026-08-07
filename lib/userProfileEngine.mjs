/**
 * Enterprise User Profile & Betting Intelligence Engine — BetKing Sportsbook (lib/userProfileEngine.mjs)
 * Generates betting intelligence, tracks favorite sports, teams, players, markets,
 * average stakes, average odds, ROI, win/loss percentages, bet frequency,
 * risk scores, lifetime value (LTV), betting style, and sharp/public indicators.
 */

import { getUserRiskSummary } from './riskEngine.mjs';

const USER_INTELLIGENCE_STORE = new Map();

/**
 * Generate or update comprehensive betting intelligence profile for a user
 */
export function generateUserBetProfile(userId, betHistory = []) {
  if (!userId) throw new Error('generateUserBetProfile requires userId');

  let profile = USER_INTELLIGENCE_STORE.get(userId) || {
    userId,
    favoriteSports: new Map(),
    favoriteTeams: new Map(),
    favoriteMarkets: new Map(),
    totalStaked: 0,
    totalPayout: 0,
    totalBets: 0,
    winningBets: 0,
    losingBets: 0,
    sumOdds: 0,
    lastBetTimestamp: null,
    riskScore: 10, // 0 (Low Risk) - 100 (Extreme Risk)
    lifetimeValue: 0.0,
    bettingStyle: 'CASUAL', // 'CASUAL', 'REGULAR', 'HIGH_ROLLER', 'SHARP', 'ARBITRAGE'
    sharpsIndicator: 'PUBLIC', // 'PUBLIC', 'LEAN_SHARP', 'SHARP'
    calculatedAt: new Date().toISOString(),
  };

  if (Array.isArray(betHistory) && betHistory.length > 0) {
    let staked = 0;
    let payout = 0;
    let wins = 0;
    let losses = 0;
    let sumOdds = 0;

    for (const b of betHistory) {
      const stake = Number(b.stake) || 0;
      const odds = Number(b.odds) || 1.0;
      const winPayout = Number(b.payout) || 0;

      staked += stake;
      payout += winPayout;
      sumOdds += odds;

      if (b.status === 'won') wins++;
      else if (b.status === 'lost') losses++;

      // Track favorite sports
      const sport = b.sport || 'cricket';
      profile.favoriteSports.set(sport, (profile.favoriteSports.get(sport) || 0) + 1);

      // Track favorite markets
      const market = b.marketId || 'winner';
      profile.favoriteMarkets.set(market, (profile.favoriteMarkets.get(market) || 0) + 1);

      // Track favorite teams
      if (b.teamName) {
        profile.favoriteTeams.set(b.teamName, (profile.favoriteTeams.get(b.teamName) || 0) + 1);
      }
    }

    profile.totalBets = betHistory.length;
    profile.totalStaked = Number(staked.toFixed(2));
    profile.totalPayout = Number(payout.toFixed(2));
    profile.winningBets = wins;
    profile.losingBets = losses;
    profile.sumOdds = sumOdds;
    profile.lastBetTimestamp = Date.now();
  }

  // Derive Intelligence Metrics
  const avgStake = profile.totalBets > 0 ? profile.totalStaked / profile.totalBets : 0;
  const avgOdds = profile.totalBets > 0 ? profile.sumOdds / profile.totalBets : 1.0;
  const winPct = profile.totalBets > 0 ? (profile.winningBets / profile.totalBets) * 100 : 0;
  const lossPct = profile.totalBets > 0 ? (profile.losingBets / profile.totalBets) * 100 : 0;
  const netProfit = profile.totalPayout - profile.totalStaked;
  const roiPct = profile.totalStaked > 0 ? (netProfit / profile.totalStaked) * 100 : 0;

  // Derive Betting Style & Sharps Indicator
  if (avgStake > 25000 || profile.totalStaked > 100000) {
    profile.bettingStyle = 'HIGH_ROLLER';
  } else if (winPct >= 65 && profile.totalBets >= 15) {
    profile.bettingStyle = 'SHARP';
    profile.sharpsIndicator = 'SHARP';
  } else if (winPct >= 58 && profile.totalBets >= 10) {
    profile.sharpsIndicator = 'LEAN_SHARP';
  } else {
    profile.sharpsIndicator = 'PUBLIC';
  }

  // Calculate Risk Score (0 - 100)
  const riskSummary = getUserRiskSummary(userId);
  let baseRiskScore = 10;
  if (profile.sharpsIndicator === 'SHARP') baseRiskScore += 45;
  if (avgStake > 20000) baseRiskScore += 25;
  if (winPct > 70) baseRiskScore += 20;
  profile.riskScore = Math.min(100, baseRiskScore);
  profile.lifetimeValue = Number(netProfit.toFixed(2));

  // Format Top Favorites
  const topSport = Array.from(profile.favoriteSports.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'cricket';
  const topMarket = Array.from(profile.favoriteMarkets.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'winner';
  const topTeam = Array.from(profile.favoriteTeams.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'India';

  const outputProfile = {
    userId,
    averageStake: Number(avgStake.toFixed(2)),
    averageOdds: Number(avgOdds.toFixed(2)),
    totalBets: profile.totalBets,
    winningBets: profile.winningBets,
    losingBets: profile.losingBets,
    winPercentage: Number(winPct.toFixed(1)),
    lossPercentage: Number(lossPct.toFixed(1)),
    roiPercentage: Number(roiPct.toFixed(1)),
    lifetimeValue: profile.lifetimeValue,
    riskScore: profile.riskScore,
    bettingStyle: profile.bettingStyle,
    sharpsIndicator: profile.sharpsIndicator,
    favorites: {
      sport: topSport,
      market: topMarket,
      team: topTeam,
    },
    calculatedAt: new Date().toISOString(),
  };

  USER_INTELLIGENCE_STORE.set(userId, outputProfile);
  return outputProfile;
}

export function getUserRiskScore(userId) {
  const profile = USER_INTELLIGENCE_STORE.get(userId) || generateUserBetProfile(userId);
  return {
    userId,
    riskScore: profile.riskScore,
    bettingStyle: profile.bettingStyle,
    sharpsIndicator: profile.sharpsIndicator,
  };
}

export function getFavoriteMarkets(userId) {
  const profile = USER_INTELLIGENCE_STORE.get(userId) || generateUserBetProfile(userId);
  return {
    userId,
    favoriteMarkets: profile.favorites,
  };
}
