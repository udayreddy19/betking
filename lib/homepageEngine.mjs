/**
 * Enterprise Personalized Homepage Engine — OddsYra Enterprise Platform (lib/homepageEngine.mjs)
 * Generates personalized homepage feed views: Personalized Sports, Favorite Teams,
 * Favorite Markets, Trending Bets, Recently Viewed, Recommended Bets, and Live Fixtures.
 */

import { generateBetRecommendations } from './recommendationEngine.mjs';
import { generateUserBetProfile } from './userProfileEngine.mjs';

export function buildPersonalizedHomepageFeed(userId, activeMatches = []) {
  const userProfile = generateUserBetProfile(userId);
  const recommendations = generateBetRecommendations([], activeMatches);

  const liveMatches = activeMatches.filter((m) => m.isLive || m.matchState === 'in');

  return {
    userId,
    userProfile,
    feedSections: {
      favoriteSports: [userProfile.favorites.sport],
      recommendedBets: recommendations.trendingBets,
      liveNow: liveMatches.slice(0, 5),
      highValueOpportunities: recommendations.highValueBets,
    },
    generatedAt: new Date().toISOString(),
  };
}
