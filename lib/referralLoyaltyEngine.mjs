import { query } from '../db/pg.js';
import { recordDeviceFingerprint } from './deviceFingerprintEngine.mjs';

/**
 * Enterprise Referral, Loyalty & CRM Campaign Engine
 */

/**
 * Register Referral Link & Check Device/IP Cluster Fraud
 */
export async function processReferralRegistration({
  referrerUserId,
  referredUserId,
  referralCode = 'REF100',
  deviceHash = null,
  ipAddress = null,
}) {
  if (referrerUserId === referredUserId) {
    throw new Error('SELF_REFERRAL_NOT_ALLOWED: User cannot refer themselves');
  }

  // Check for Device / IP sharing between referrer and referred user
  let initialStatus = 'REGISTERED';
  if (deviceHash || ipAddress) {
    const fpCheck = await recordDeviceFingerprint({ userId: referredUserId, deviceHash, ipAddress });
    if (fpCheck.signalsGenerated.length > 0) {
      initialStatus = 'FRAUD_REVIEW';
    }
  }

  const referralId = `ref_${Date.now()}`;
  await query(`
    INSERT INTO referrals (id, referrer_user_id, referred_user_id, referral_code, status, reward_amount)
    VALUES ($1, $2, $3, $4, $5, 500.00)
    ON CONFLICT (referred_user_id) DO NOTHING;
  `, [referralId, referrerUserId, referredUserId, referralCode, initialStatus]);

  return { success: true, referralId, referrerUserId, referredUserId, status: initialStatus };
}

/**
 * Qualify Referral Reward upon First Deposit
 */
export async function qualifyReferralReward({ referredUserId }) {
  const refRes = await query(`
    SELECT id, referrer_user_id, reward_amount, status
    FROM referrals
    WHERE referred_user_id = $1 AND status IN ('REGISTERED', 'FRAUD_REVIEW');
  `, [referredUserId]);

  if (refRes.rows.length === 0) return { qualified: false, reason: 'No pending referral found' };

  const ref = refRes.rows[0];
  if (ref.status === 'FRAUD_REVIEW') {
    return { qualified: false, reason: 'Referral held under Fraud Review' };
  }

  await query(`
    UPDATE referrals
    SET status = 'QUALIFIED'
    WHERE id = $1;
  `, [ref.id]);

  return { success: true, referralId: ref.id, referrerUserId: ref.referrer_user_id, rewardAmount: parseFloat(ref.reward_amount) };
}

/**
 * Calculate & Award Loyalty Points + Tier Progression
 */
export async function addLoyaltyPoints({ userId, stakeAmount }) {
  const earnedPoints = parseFloat((parseFloat(stakeAmount) / 100).toFixed(2)); // 1 pt per ₹100

  const userLoyaltyRes = await query(`
    INSERT INTO user_loyalty (user_id, points, tier)
    VALUES ($1, $2, 'BRONZE')
    ON CONFLICT (user_id) DO UPDATE
    SET points = user_loyalty.points + EXCLUDED.points, updated_at = CURRENT_TIMESTAMP
    RETURNING points;
  `, [userId, earnedPoints]);

  const totalPoints = parseFloat(userLoyaltyRes.rows[0].points);

  let newTier = 'BRONZE';
  if (totalPoints >= 10000) newTier = 'PLATINUM';
  else if (totalPoints >= 2000) newTier = 'GOLD';
  else if (totalPoints >= 500) newTier = 'SILVER';

  await query(`
    UPDATE user_loyalty
    SET tier = $1
    WHERE user_id = $2;
  `, [newTier, userId]);

  return { success: true, userId, earnedPoints, totalPoints, tier: newTier };
}
