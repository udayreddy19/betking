/**
 * Enterprise Loyalty Engine — BetKing Enterprise Platform (lib/loyaltyEngine.mjs)
 * Manages user loyalty points, unlockable achievements, badges, leveling, and rewards.
 */

const USER_LOYALTY_STORE = new Map();

export function addLoyaltyPoints(userId, pointsToAdd = 0) {
  let record = USER_LOYALTY_STORE.get(userId) || {
    userId,
    points: 0,
    level: 1,
    badges: [],
  };

  record.points += Math.max(0, pointsToAdd);
  record.level = Math.floor(record.points / 1000) + 1;

  USER_LOYALTY_STORE.set(userId, record);
  return record;
}
