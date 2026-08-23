import { query } from '../db/pg.js';
import { recordDeviceFingerprint } from './deviceFingerprintEngine.mjs';
import { pointsFromSpendAtTier } from './vipBenefits.mjs';
import { earnLoyaltyPoints } from './loyaltyPointsStore.mjs';

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
  const current = await query(`SELECT tier FROM user_loyalty WHERE user_id = $1`, [userId]);
  const currentTier = current.rows[0]?.tier || 'BRONZE';
  const earnedPoints = pointsFromSpendAtTier(stakeAmount, currentTier);
  const result = await earnLoyaltyPoints(query, userId, earnedPoints);

  return {
    success: true,
    userId,
    earnedPoints: result.earned,
    totalPoints: result.points,
    vipPoints: result.vipPoints,
    tier: result.tier,
  };
}
