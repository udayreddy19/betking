/**
 * Enterprise Loyalty Engine — BetKing Enterprise Platform (lib/loyaltyEngine.mjs)
 * 
 * PG-backed loyalty points, tier auto-calculation, and badge management.
 */

import { query } from '../db/pg.js';

const USER_LOYALTY_STORE = new Map();

/**
 * Add loyalty points and auto-calculate tier.
 */
export async function addLoyaltyPoints(userId, pointsToAdd = 0) {
  let record = USER_LOYALTY_STORE.get(userId) || {
    userId,
    points: 0,
    level: 1,
    badges: [],
  };

  record.points += Math.max(0, pointsToAdd);
  record.level = Math.floor(record.points / 1000) + 1;

  // Calculate tier
  let tier = 'BRONZE';
  if (record.points >= 10000) tier = 'PLATINUM';
  else if (record.points >= 2000) tier = 'GOLD';
  else if (record.points >= 500) tier = 'SILVER';

  record.tier = tier;

  USER_LOYALTY_STORE.set(userId, record);

  // Persist to PostgreSQL
  try {
    await query(`
      INSERT INTO user_loyalty (user_id, points, tier, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO UPDATE SET
        points = EXCLUDED.points,
        tier = EXCLUDED.tier,
        updated_at = CURRENT_TIMESTAMP;
    `, [userId, record.points, tier]);
  } catch (err) {
    // Tolerable — PG is a durability layer, in-memory is authoritative at runtime
  }

  return record;
}

/**
 * Get loyalty status for a user.
 */
export async function getLoyaltyStatus(userId) {
  // Check in-memory first
  if (USER_LOYALTY_STORE.has(userId)) {
    return { success: true, ...USER_LOYALTY_STORE.get(userId) };
  }

  // Fall back to PostgreSQL
  try {
    const res = await query(`SELECT points, tier, updated_at FROM user_loyalty WHERE user_id = $1;`, [userId]);
    if (res.rows.length > 0) {
      const row = res.rows[0];
      const record = {
        userId,
        points: parseFloat(row.points),
        tier: row.tier,
        level: Math.floor(parseFloat(row.points) / 1000) + 1,
        badges: [],
      };
      USER_LOYALTY_STORE.set(userId, record);
      return { success: true, ...record };
    }
  } catch (err) {
    // Tolerable
  }

  return { success: true, userId, points: 0, tier: 'BRONZE', level: 1, badges: [] };
}
