import { query, withTransaction } from '../db/pg.js';

/**
 * Enterprise Account Restrictions & Compliance Engine
 */
export async function restrictAccount({
  userId,
  type = 'PERMANENT_RESTRICTION', // PERMANENT_RESTRICTION | TEMPORARY_SUSPENSION | WITHDRAWAL_HOLD
  reason = 'Admin security action',
  actorId = 'ADMIN',
  expiresAt = null,
}) {
  return await withTransaction(async (client) => {
    // 1. Update user_profiles account_status
    await client.query(`
      UPDATE user_profiles
      SET account_status = 'RESTRICTED', updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1;
    `, [userId]);

    // 2. Insert account_restrictions audit record
    const restrictionId = `restr_${userId}_${Date.now()}`;
    await client.query(`
      INSERT INTO account_restrictions (restriction_id, user_id, type, reason, status, created_by, expires_at)
      VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6);
    `, [restrictionId, userId, type, reason, actorId, expiresAt]);

    // 3. Audit Log
    await client.query(`
      INSERT INTO audit_events (actor_id, target_id, action, details)
      VALUES ($1, $2, 'ACCOUNT_RESTRICTED', $3);
    `, [actorId, userId, JSON.stringify({ type, reason, restrictionId })]);

    return { success: true, userId, restrictionId, status: 'RESTRICTED' };
  });
}

export async function releaseAccount({
  userId,
  actorId = 'ADMIN',
  reason = 'Admin approval release',
}) {
  return await withTransaction(async (client) => {
    // 1. Update user_profiles account_status
    await client.query(`
      UPDATE user_profiles
      SET account_status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1;
    `, [userId]);

    // 2. Release active restrictions
    await client.query(`
      UPDATE account_restrictions
      SET status = 'RELEASED', released_at = CURRENT_TIMESTAMP, released_by = $2
      WHERE user_id = $1 AND status = 'ACTIVE';
    `, [userId, actorId]);

    // 3. Audit Log
    await client.query(`
      INSERT INTO audit_events (actor_id, target_id, action, details)
      VALUES ($1, $2, 'ACCOUNT_RELEASED', $3);
    `, [actorId, userId, JSON.stringify({ reason })]);

    return { success: true, userId, status: 'ACTIVE' };
  });
}

/**
 * Check if account is eligible to place bets or withdraw
 */
export async function checkAccountEligibility(userId) {
  const profileRes = await query(`
    SELECT account_status, kyc_status, risk_tier
    FROM user_profiles
    WHERE user_id = $1;
  `, [userId]);

  if (profileRes.rows.length === 0) {
    throw new Error('USER_NOT_FOUND: Profile record missing');
  }

  const profile = profileRes.rows[0];

  if (profile.account_status === 'RESTRICTED' || profile.account_status === 'SUSPENDED') {
    throw new Error(`ACCOUNT_RESTRICTED: Your account status is '${profile.account_status}'. Betting and withdrawals are currently blocked.`);
  }

  return { eligible: true, profile };
}
