/**
 * Enterprise Central Feature Store — BetKing Sportsbook (lib/featureStore.mjs)
 * Central repository for all match and team features (ELO, xG, xR, Player Ratings,
 * Recent Form, Weather, Venue, Injuries, Referee, Momentum, Travel, Fatigue).
 * Eliminates duplicate feature calculations across Probability, Pricing, Risk, and Recommendation engines.
 */

const FEATURE_CACHE = new Map();

/**
 * Register or update feature vector for a match
 */
export function upsertMatchFeatures(matchId, features = {}) {
  if (!matchId) throw new Error('upsertMatchFeatures requires matchId');

  const existing = FEATURE_CACHE.get(matchId) || {
    matchId,
    homeElo: 1500,
    awayElo: 1500,
    expectedGoalsHome: 1.45,
    expectedGoalsAway: 1.15,
    expectedRunsHome: 165.0,
    expectedRunsAway: 155.0,
    homeLineupRating: 80.0,
    awayLineupRating: 80.0,
    homeRecentForm: [0.8, 0.6, 1.0, 0.4, 0.8],
    awayRecentForm: [1.0, 0.8, 0.8, 1.0, 0.6],
    weatherImpactFactor: 0.0,
    venuePitchRating: 0.5,
    homeInjuriesCount: 0,
    awayInjuriesCount: 0,
    refereeRating: 0.5,
    inPlayMomentumIndex: 0.0,
    homeTravelKm: 0,
    awayTravelKm: 0,
    homeFatigueIndex: 0.0,
    awayFatigueIndex: 0.0,
    updatedAt: new Date().toISOString(),
  };

  const updated = { ...existing, ...features, updatedAt: new Date().toISOString() };
  FEATURE_CACHE.set(matchId, updated);
  return updated;
}

/**
 * Retrieve cached feature vector for a match
 */
export function getMatchFeatures(matchId) {
  return FEATURE_CACHE.get(matchId) || upsertMatchFeatures(matchId);
}

/**
 * Clear cached features for a match
 */
export function clearMatchFeatures(matchId) {
  return FEATURE_CACHE.delete(matchId);
}
