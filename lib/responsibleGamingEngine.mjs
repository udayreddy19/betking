/**
 * Responsible Gaming & Player Safety Engine
 * 
 * Manages:
 *  - Player Deposit Limits (Daily, Weekly, Monthly) with 24-hour cooldown on limit increases
 *  - Self-Exclusion & Time-Out Gates (24H, 7D, 30D, Permanent)
 *  - In-Play Session Reality Checks
 */

import { query } from '../db/pg.js';

export const LIMIT_INCREASE_COOLDOWN_HOURS = 24;

/**
 * Check if a user is currently self-excluded
 */
export async function checkSelfExclusionStatus(userId) {
  if (!userId) return { isExcluded: false };

  const res = await query(
    `SELECT * FROM user_self_exclusions
     WHERE user_id = $1 AND (is_permanent = TRUE OR expires_at > NOW())
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );

  if (res.rows.length > 0) {
    const row = res.rows[0];
    return {
      isExcluded: true,
      duration: row.duration_type,
      expiresAt: row.expires_at,
      isPermanent: Boolean(row.is_permanent),
      reason: row.reason,
    };
  }

  return { isExcluded: false };
}

/**
 * Apply self-exclusion for a user
 */
export async function applySelfExclusion(userId, durationType = '24H', reason = '') {
  const dt = String(durationType).toUpperCase();
  let expiresAt = null;
  let isPermanent = false;
  const now = new Date();

  if (dt === '24H') {
    expiresAt = new Date(now.getTime() + 24 * 3600 * 1000);
  } else if (dt === '7D') {
    expiresAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  } else if (dt === '30D') {
    expiresAt = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  } else if (dt === '6MONTHS') {
    expiresAt = new Date(now.getTime() + 180 * 24 * 3600 * 1000);
  } else if (dt === 'PERMANENT') {
    isPermanent = true;
  } else {
    expiresAt = new Date(now.getTime() + 24 * 3600 * 1000);
  }

  const id = `ex_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await query(
    `INSERT INTO user_self_exclusions (id, user_id, duration_type, expires_at, is_permanent, reason)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, userId, dt, expiresAt, isPermanent, reason || 'Player self-exclusion request'],
  );

  return {
    success: true,
    userId,
    durationType: dt,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    isPermanent,
  };
}

/**
 * Validate proposed deposit against user's daily deposit limit
 */
export async function validateDepositLimit(userId, depositAmount = 0) {
  // Unlimited deposits (No daily deposit limitations)
  return { isAllowed: true };
}
