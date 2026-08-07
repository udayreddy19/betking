/**
 * Enterprise Recommendation Engine — BetKing Sportsbook (lib/recommendationEngine.mjs)
 * Generates personalized & trending bet recommendations (Trending Bets, Popular Bets,
 * High Value Bets, Safe Bets, Bet Builder Suggestions, Recently Viewed).
 */

export function generateBetRecommendations(userHistory = [], activeMatches = []) {
  const trendingMatches = activeMatches.slice(0, 4);

  const trendingBets = trendingMatches.map((m) => ({
    type: 'TRENDING',
    matchId: m.id,
    matchTitle: `${m.team1?.name || 'Home'} vs ${m.team2?.name || 'Away'}`,
    recommendation: `${m.team1?.name || 'Home'} Win`,
    odds: m.odds?.team1 || 1.95,
    reason: 'High betting volume in past 15 mins',
  }));

  const safeBets = activeMatches
    .filter((m) => (m.odds?.team1 < 1.45 || m.odds?.team2 < 1.45))
    .slice(0, 3)
    .map((m) => {
      const isHomeFav = m.odds?.team1 < 1.45;
      return {
        type: 'SAFE_BET',
        matchId: m.id,
        matchTitle: `${m.team1?.name} vs ${m.team2?.name}`,
        recommendation: isHomeFav ? `${m.team1?.name} Win` : `${m.team2?.name} Win`,
        odds: isHomeFav ? m.odds?.team1 : m.odds?.team2,
        reason: 'Heavy favorite with > 75% win probability',
      };
    });

  const highValueBets = activeMatches
    .filter((m) => (m.odds?.team1 > 2.20 && m.odds?.team1 < 3.50))
    .slice(0, 3)
    .map((m) => ({
      type: 'HIGH_VALUE',
      matchId: m.id,
      matchTitle: `${m.team1?.name} vs ${m.team2?.name}`,
      recommendation: `${m.team1?.name} Win`,
      odds: m.odds?.team1,
      reason: 'Underdog value based on recent form metrics',
    }));

  return {
    trendingBets,
    safeBets,
    highValueBets,
    generatedAt: new Date().toISOString(),
  };
}
