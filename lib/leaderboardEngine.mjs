/**
 * Enterprise Leaderboard Engine — BetKing Sportsbook (lib/leaderboardEngine.mjs)
 * Tracks Top Winners, Top Bettors, Winning Streaks, Highest Cashouts, Highest ROI, and Tournament Rankings.
 */

const USER_LEADERBOARD_STATS = new Map();

export function recordBetOutcomeForLeaderboard(userId, betData = {}) {
  let stats = USER_LEADERBOARD_STATS.get(userId) || {
    userId,
    userName: betData.userName || `User_${userId.slice(-4)}`,
    totalBets: 0,
    winningBets: 0,
    totalProfit: 0,
    totalStaked: 0,
    currentStreak: 0,
    maxStreak: 0,
    highestCashout: 0,
  };

  stats.totalBets += 1;
  const stake = Number(betData.stake) || 0;
  const payout = Number(betData.payout) || 0;
  stats.totalStaked += stake;

  if (payout > stake) {
    const profit = payout - stake;
    stats.totalProfit += profit;
    stats.winningBets += 1;
    stats.currentStreak += 1;
    if (stats.currentStreak > stats.maxStreak) stats.maxStreak = stats.currentStreak;
  } else {
    stats.totalProfit -= stake;
    stats.currentStreak = 0;
  }

  if (betData.isCashout && payout > stats.highestCashout) {
    stats.highestCashout = payout;
  }

  USER_LEADERBOARD_STATS.set(userId, stats);
  return stats;
}

export function getLeaderboards() {
  const allUsers = Array.from(USER_LEADERBOARD_STATS.values());

  const topWinners = allUsers
    .slice()
    .sort((a, b) => b.totalProfit - a.totalProfit)
    .slice(0, 10);

  const topBettors = allUsers
    .slice()
    .sort((a, b) => b.totalBets - a.totalBets)
    .slice(0, 10);

  const longestStreaks = allUsers
    .slice()
    .sort((a, b) => b.maxStreak - a.maxStreak)
    .slice(0, 10);

  const highestROI = allUsers
    .filter((u) => u.totalStaked > 1000)
    .map((u) => ({ ...u, roiPct: Number(((u.totalProfit / u.totalStaked) * 100).toFixed(1)) }))
    .sort((a, b) => b.roiPct - a.roiPct)
    .slice(0, 10);

  return {
    topWinners,
    topBettors,
    longestStreaks,
    highestROI,
    generatedAt: new Date().toISOString(),
  };
}
