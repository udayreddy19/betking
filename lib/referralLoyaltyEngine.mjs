/**
 * User referral program — attribution, qualification, freebet rewards.
 * Reuses wallets.freebet_balance + ledger/transactions (same path as signup promos).
 */

import crypto from 'crypto';
import { query, withTransaction } from '../db/pg.js';
import { recordDeviceFingerprint } from './deviceFingerprintEngine.mjs';
import { pointsFromSpendAtTier } from './vipBenefits.mjs';
import { earnLoyaltyPoints } from './loyaltyPointsStore.mjs';
import { logger } from './logger.mjs';

function cfg() {
  return {
    enabled: String(process.env.REFERRAL_PROGRAM_ENABLED || 'true').toLowerCase() !== 'false',
    referredReward: Math.max(0, Number(process.env.REFERRAL_REFERRED_FREEBET || '500') || 500),
    referrerReward: Math.max(0, Number(process.env.REFERRAL_REFERRER_FREEBET || '500') || 500),
    minDeposit: Math.max(0, Number(process.env.REFERRAL_MIN_DEPOSIT || '1') || 1),
    requireKyc: String(process.env.REFERRAL_REQUIRE_KYC || 'false').toLowerCase() === 'true',
    requireRiskClearance: String(process.env.REFERRAL_REQUIRE_RISK_CLEARANCE || 'true').toLowerCase() !== 'false',
    maxReferralsPerUser: Math.max(0, parseInt(process.env.REFERRAL_MAX_PER_USER || '0', 10) || 0),
  };
}

export function getReferralProgramConfig() {
  return cfg();
}

export function normalizeReferralCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24);
}

function referralId() {
  return `ref_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function eventId() {
  return `rre_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function generateCodeCandidate(firstName = '') {
  const prefix = String(firstName || 'USR')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 4) || 'USR';
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}${suffix}`.slice(0, 12);
}

function referralBaseUrl() {
  return String(process.env.FRONTEND_URL || process.env.APP_URL || 'https://oddsyra.com').replace(/\/$/, '');
}

export function referralLinkFromCode(code) {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;
  return `${referralBaseUrl()}/register?ref=${encodeURIComponent(normalized)}`;
}

/** Ensure the user has an ACTIVE referral code; create if missing. */
export async function ensureReferralCode(userId, { firstName } = {}) {
  if (!userId) return null;

  const userRes = await query(
    `SELECT first_name, UPPER(COALESCE(status, 'ACTIVE')) AS status FROM users WHERE user_id = $1`,
    [userId],
  );
  if (!userRes.rows[0]) return null;
  if (!['ACTIVE'].includes(userRes.rows[0].status)) {
    return null;
  }

  const existing = await query(
    `SELECT code, status FROM referral_codes WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  if (existing.rows[0]) {
    return {
      code: existing.rows[0].code,
      status: existing.rows[0].status,
      link: referralLinkFromCode(existing.rows[0].code),
    };
  }

  let name = firstName || userRes.rows[0].first_name || '';

  for (let i = 0; i < 8; i += 1) {
    const code = generateCodeCandidate(name);
    try {
      await query(
        `INSERT INTO referral_codes (code, user_id, status, updated_at)
         VALUES ($1, $2, 'ACTIVE', NOW())`,
        [code, userId],
      );
      return { code, status: 'ACTIVE', link: referralLinkFromCode(code) };
    } catch (err) {
      if (err.code === '23505') continue;
      throw err;
    }
  }
  throw new Error('Could not allocate referral code');
}

/**
 * Allocate referral codes for existing ACTIVE users who do not have one yet.
 * Safe to run repeatedly (idempotent).
 */
export async function backfillReferralCodesForExistingUsers({ batchSize = 500 } = {}) {
  const conf = cfg();
  if (!conf.enabled) {
    return { success: false, skipped: true, reason: 'Referral program disabled' };
  }

  const limit = Math.min(Math.max(Number(batchSize) || 500, 1), 5000);
  const pending = await query(
    `SELECT u.user_id, u.first_name
     FROM users u
     WHERE UPPER(COALESCE(u.status, 'ACTIVE')) = 'ACTIVE'
       AND NOT EXISTS (SELECT 1 FROM referral_codes rc WHERE rc.user_id = u.user_id)
     ORDER BY u.created_at ASC NULLS LAST
     LIMIT $1`,
    [limit],
  );

  let created = 0;
  let failed = 0;
  for (const row of pending.rows) {
    try {
      const result = await ensureReferralCode(row.user_id, { firstName: row.first_name });
      if (result?.code) created += 1;
    } catch {
      failed += 1;
    }
  }

  const remaining = await query(
    `SELECT COUNT(*)::int AS n
     FROM users u
     WHERE UPPER(COALESCE(u.status, 'ACTIVE')) = 'ACTIVE'
       AND NOT EXISTS (SELECT 1 FROM referral_codes rc WHERE rc.user_id = u.user_id)`,
  );

  return {
    success: true,
    processed: pending.rows.length,
    created,
    failed,
    remaining: Number(remaining.rows[0]?.n || 0),
  };
}

export async function resolveReferrerByCode(rawCode) {
  const code = normalizeReferralCode(rawCode);
  if (!code || code.length < 4) return null;
  const res = await query(
    `SELECT rc.code, rc.user_id, rc.status, u.status AS user_status, u.email, u.first_name
     FROM referral_codes rc
     JOIN users u ON u.user_id = rc.user_id
     WHERE rc.code = $1
     LIMIT 1`,
    [code],
  );
  return res.rows[0] || null;
}

export async function userHasReferralAttribution(userId, exec = query, { forUpdate = false } = {}) {
  if (!userId) return false;
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const res = await exec(
    `SELECT id, status, attribution_status, referral_code
     FROM referrals
     WHERE referred_user_id = $1
       AND COALESCE(attribution_status, 'ATTRIBUTED') = 'ATTRIBUTED'
       AND status NOT IN ('REJECTED')
     LIMIT 1${lock}`,
    [userId],
  );
  return res.rows[0] || null;
}

/**
 * Block signup / welcome promos when the account joined via referral.
 * When forUpdate=true, locks the referral row so qualify/claim cannot race.
 */
export async function assertNoReferralPromoConflict(userId, exec = query, opts = {}) {
  const forUpdate = Boolean(opts.forUpdate);
  const row = await userHasReferralAttribution(userId, exec, { forUpdate });
  if (!row) return;
  const err = new Error(
    'This account joined through a referral and is not eligible for the initial signup promotion.',
  );
  err.code = 'REFERRAL_PROMO_CONFLICT';
  err.status = 400;
  err.referralCode = row.referral_code;
  throw err;
}

/** True if user has an active (non-revoked) signup promo redemption. */
export async function userHasActiveSignupPromo(userId, exec = query, { forUpdate = false } = {}) {
  if (!userId) return null;
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const res = await exec(
    `SELECT redemption_id, code_id
     FROM signup_promo_redemptions
     WHERE user_id = $1 AND revoked_at IS NULL
     LIMIT 1${lock}`,
    [userId],
  );
  return res.rows[0] || null;
}

/**
 * Register Referral Link & Check Device/IP Cluster Fraud
 * (legacy signature kept for existing tests)
 */
export async function processReferralRegistration({
  referrerUserId,
  referredUserId,
  referralCode = 'REF100',
  deviceHash = null,
  ipAddress = null,
  referredRewardAmount = null,
  referrerRewardAmount = null,
} = {}) {
  const conf = cfg();
  if (!conf.enabled) {
    return { success: false, skipped: true, reason: 'Referral program disabled' };
  }
  if (!referrerUserId || !referredUserId) {
    throw Object.assign(new Error('Referrer and referred user are required.'), {
      code: 'REFERRAL_REQUIRED',
      status: 400,
    });
  }
  if (referrerUserId === referredUserId) {
    throw new Error('SELF_REFERRAL_NOT_ALLOWED: User cannot refer themselves');
  }

  const existingPromo = await userHasActiveSignupPromo(referredUserId);
  if (existingPromo) {
    throw Object.assign(
      new Error('This account already claimed a signup promotion and cannot also use a referral.'),
      { code: 'REFERRAL_PROMO_CONFLICT', status: 400, promoCode: existingPromo.code_id },
    );
  }

  const code = normalizeReferralCode(referralCode) || 'REF100';
  const referredAmt = referredRewardAmount != null ? Number(referredRewardAmount) : conf.referredReward;
  const referrerAmt = referrerRewardAmount != null ? Number(referrerRewardAmount) : conf.referrerReward;

  if (conf.maxReferralsPerUser > 0) {
    const countRes = await query(
      `SELECT COUNT(*)::int AS c FROM referrals
       WHERE referrer_user_id = $1 AND status NOT IN ('REJECTED')`,
      [referrerUserId],
    );
    if (Number(countRes.rows[0]?.c || 0) >= conf.maxReferralsPerUser) {
      throw Object.assign(new Error('This referrer has reached the maximum referral limit.'), {
        code: 'REFERRAL_LIMIT',
        status: 400,
      });
    }
  }

  let initialStatus = 'REGISTERED';
  let qualificationStatus = 'PENDING';
  if (deviceHash || ipAddress) {
    try {
      const fpCheck = await recordDeviceFingerprint({ userId: referredUserId, deviceHash, ipAddress });
      if (conf.requireRiskClearance && fpCheck?.signalsGenerated?.length > 0) {
        initialStatus = 'FRAUD_REVIEW';
        qualificationStatus = 'PENDING';
      }
    } catch (err) {
      logger.warn('referral_fingerprint_check_failed', { error: err.message });
    }
  }

  // Additive promo-abuse signals (does not invent rewards; may elevate to FRAUD_REVIEW)
  try {
    const {
      evaluatePromotionEligibility,
      recordPromoAbuseAlert,
    } = await import('./promotionAbuseEngine.mjs');
    const evaluation = await evaluatePromotionEligibility(referredUserId, {
      promoCode: code,
      deviceHash,
      ipAddress,
      context: 'referral',
    });
    if (evaluation.action === 'FLAG_REVIEW' || evaluation.action === 'BLOCK_PROMOTION') {
      await recordPromoAbuseAlert({
        userId: referredUserId,
        promoCode: code,
        evaluation,
        context: 'referral',
        notes: `referral_abuse action=${evaluation.action}`,
      });
      if (evaluation.action === 'BLOCK_PROMOTION' || evaluation.action === 'FLAG_REVIEW') {
        initialStatus = 'FRAUD_REVIEW';
        qualificationStatus = 'PENDING';
      }
    }
  } catch (err) {
    logger.warn('referral_promo_abuse_eval_failed', { error: err.message });
  }

  const id = referralId();
  const insert = await query(
    `INSERT INTO referrals (
       id, referrer_user_id, referred_user_id, referral_code, status, reward_amount,
       referred_reward_amount, referrer_reward_amount,
       attribution_status, qualification_status, reward_status, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8,
       'ATTRIBUTED', $9, 'PENDING', NOW()
     )
     ON CONFLICT (referred_user_id) DO NOTHING
     RETURNING id, status`,
    [
      id,
      referrerUserId,
      referredUserId,
      code,
      initialStatus,
      referredAmt,
      referredAmt,
      referrerAmt,
      qualificationStatus,
    ],
  );

  if (!insert.rows[0]) {
    const existing = await query(
      `SELECT id, status, referral_code FROM referrals WHERE referred_user_id = $1`,
      [referredUserId],
    );
    return {
      success: true,
      duplicate: true,
      referralId: existing.rows[0]?.id,
      referrerUserId,
      referredUserId,
      status: existing.rows[0]?.status || 'ATTRIBUTED',
    };
  }

  let reward = null;
  if (initialStatus === 'REGISTERED') {
    try {
      reward = await qualifyReferralReward({ referredUserId });
    } catch (err) {
      logger.warn('referral_signup_reward_failed', { referredUserId, error: err.message });
    }
  }

  return {
    success: true,
    referralId: insert.rows[0].id,
    referrerUserId,
    referredUserId,
    status: reward?.success ? 'REWARDED' : insert.rows[0].status,
    reward,
  };
}

/**
 * Attribute referral during signup using a referral code.
 */
export async function attributeReferralOnSignup({
  referredUserId,
  referralCode,
  deviceHash = null,
  ipAddress = null,
} = {}) {
  const conf = cfg();
  if (!conf.enabled) return { attributed: false, reason: 'disabled' };

  const code = normalizeReferralCode(referralCode);
  if (!code) return { attributed: false, reason: 'empty' };

  const referrer = await resolveReferrerByCode(code);
  if (!referrer) {
    throw Object.assign(new Error('Referral code is not valid.'), {
      code: 'REFERRAL_INVALID',
      status: 400,
    });
  }
  if (referrer.status !== 'ACTIVE') {
    throw Object.assign(new Error('This referral code is disabled.'), {
      code: 'REFERRAL_DISABLED',
      status: 400,
    });
  }
  if (String(referrer.user_status || '').toUpperCase() !== 'ACTIVE') {
    throw Object.assign(new Error('This referral code is not available.'), {
      code: 'REFERRAL_UNAVAILABLE',
      status: 400,
    });
  }
  if (referrer.user_id === referredUserId) {
    throw new Error('SELF_REFERRAL_NOT_ALLOWED: User cannot refer themselves');
  }

  // Authoritative: cannot attribute referral if signup promo already claimed
  const promo = await userHasActiveSignupPromo(referredUserId);
  if (promo) {
    throw Object.assign(
      new Error('This account already claimed a signup promotion and cannot also use a referral.'),
      { code: 'REFERRAL_PROMO_CONFLICT', status: 400, promoCode: promo.code_id },
    );
  }

  return processReferralRegistration({
    referrerUserId: referrer.user_id,
    referredUserId,
    referralCode: referrer.code,
    deviceHash,
    ipAddress,
  });
}

async function creditFreebet(client, {
  userId,
  amount,
  referralId,
  rewardType,
  idempotencyKey,
}) {
  const existing = await client.query(
    `SELECT id, status, transaction_id FROM referral_reward_events WHERE idempotency_key = $1 LIMIT 1`,
    [idempotencyKey],
  );
  if (existing.rows[0]) {
    return { duplicate: true, eventId: existing.rows[0].id, transactionId: existing.rows[0].transaction_id };
  }

  const walletRes = await client.query(
    `SELECT wallet_id, balance, bonus_balance, COALESCE(freebet_balance, 0) AS freebet_balance
     FROM wallets WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  if (!walletRes.rows[0]) {
    throw Object.assign(new Error('Wallet not found for referral reward.'), {
      code: 'WALLET_NOT_FOUND',
      status: 400,
    });
  }
  const wallet = walletRes.rows[0];
  const nextFreebet = Number(wallet.freebet_balance || 0) + Number(amount);
  const txId = `tx_ref_${crypto.randomBytes(12).toString('hex')}`;
  const eid = eventId();

  await client.query(
    `INSERT INTO transactions (transaction_id, user_id, type, method, amount, status)
     VALUES ($1, $2, 'BONUS_CLAIM', 'REFERRAL', $3, 'COMPLETED')`,
    [txId, userId, amount],
  );
  await client.query(
    `UPDATE wallets SET freebet_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
    [nextFreebet, wallet.wallet_id],
  );
  await client.query(
    `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
     VALUES ($1, $2, 'CREDIT', $3, $4, $5)`,
    [wallet.wallet_id, txId, amount, nextFreebet, `Referral ${rewardType} · ${referralId}`],
  );
  await client.query(
    `INSERT INTO referral_reward_events (
       id, referral_id, beneficiary_user_id, reward_type, amount, idempotency_key, transaction_id, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'GRANTED')`,
    [eid, referralId, userId, rewardType, amount, idempotencyKey, txId],
  );

  return { duplicate: false, eventId: eid, transactionId: txId, freebetBalance: nextFreebet };
}

/**
 * Qualify + grant referral rewards (idempotent).
 * Not deposit-locked — may run at signup attribution or later (e.g. admin retry / deposit hook).
 */
export async function qualifyReferralReward({ referredUserId } = {}) {
  const conf = cfg();
  if (!conf.enabled) return { qualified: false, reason: 'disabled' };

  const refRes = await query(
    `SELECT id, referrer_user_id, referred_user_id, reward_amount, status,
            COALESCE(referred_reward_amount, reward_amount) AS referred_reward_amount,
            COALESCE(referrer_reward_amount, reward_amount) AS referrer_reward_amount,
            qualification_status, reward_status
     FROM referrals
     WHERE referred_user_id = $1
     LIMIT 1`,
    [referredUserId],
  );
  if (!refRes.rows[0]) return { qualified: false, reason: 'No pending referral found' };

  const ref = refRes.rows[0];
  if (ref.status === 'REWARDED' || ref.reward_status === 'GRANTED') {
    return { qualified: false, reason: 'Already rewarded', referralId: ref.id };
  }
  if (ref.status === 'REJECTED') {
    return { qualified: false, reason: 'Referral rejected' };
  }
  if (ref.status === 'FRAUD_REVIEW') {
    return { qualified: false, reason: 'Referral held under Fraud Review' };
  }
  if (ref.status === 'QUALIFIED' && ref.reward_status === 'PENDING') {
    // fall through to grant
  } else if (!['REGISTERED', 'QUALIFIED'].includes(ref.status)) {
    return { qualified: false, reason: `Unexpected status ${ref.status}` };
  }

  if (conf.requireKyc) {
    const kyc = await query(
      `SELECT UPPER(COALESCE(kyc_status, 'NOT_STARTED')) AS kyc
       FROM user_profiles WHERE user_id = $1`,
      [referredUserId],
    );
    if (!['VERIFIED', 'APPROVED'].includes(String(kyc.rows[0]?.kyc || ''))) {
      return { qualified: false, reason: 'KYC required' };
    }
  }

  // Block if user already claimed a signup promo (double benefit) — lock rows inside grant tx
  const result = await withTransaction(async (client) => {
    const promo = await client.query(
      `SELECT redemption_id FROM signup_promo_redemptions
       WHERE user_id = $1 AND revoked_at IS NULL LIMIT 1 FOR UPDATE`,
      [referredUserId],
    );
    if (promo.rows[0]) {
      await client.query(
        `UPDATE referrals
         SET status = 'REJECTED', qualification_status = 'FAILED', reward_status = 'FAILED',
             metadata = COALESCE(metadata, '{}'::jsonb) || '{"reason":"signup_promo_conflict"}'::jsonb,
             updated_at = NOW()
         WHERE id = $1 AND status <> 'REWARDED'`,
        [ref.id],
      );
      return { qualified: false, reason: 'Signup promo already claimed — referral reward blocked' };
    }

    const locked = await client.query(
      `SELECT id, status, reward_status, referred_user_id, referrer_user_id,
              COALESCE(referred_reward_amount, reward_amount) AS referred_reward_amount,
              COALESCE(referrer_reward_amount, reward_amount) AS referrer_reward_amount
       FROM referrals WHERE id = $1 FOR UPDATE`,
      [ref.id],
    );
    const row = locked.rows[0];
    if (!row) return { qualified: false };
    if (row.status === 'REWARDED' || row.reward_status === 'GRANTED') {
      return { qualified: false, duplicate: true };
    }
    if (row.status === 'FRAUD_REVIEW' || row.status === 'REJECTED') {
      return { qualified: false, reason: row.status };
    }

    const referredAmt = Number(row.referred_reward_amount ?? conf.referredReward);
    const referrerAmt = Number(row.referrer_reward_amount ?? conf.referrerReward);

    await client.query(
      `UPDATE referrals
       SET status = 'QUALIFIED', qualification_status = 'QUALIFIED',
           qualified_at = COALESCE(qualified_at, NOW()), updated_at = NOW()
       WHERE id = $1`,
      [ref.id],
    );

    const referredGrant = referredAmt > 0
      ? await creditFreebet(client, {
        userId: row.referred_user_id,
        amount: referredAmt,
        referralId: ref.id,
        rewardType: 'REFERRED_FREEBET',
        idempotencyKey: `REFERRAL_REWARD:${ref.id}:REFERRED_USER`,
      })
      : null;

    const referrerGrant = referrerAmt > 0
      ? await creditFreebet(client, {
        userId: row.referrer_user_id,
        amount: referrerAmt,
        referralId: ref.id,
        rewardType: 'REFERRER_FREEBET',
        idempotencyKey: `REFERRAL_REWARD:${ref.id}:REFERRER`,
      })
      : null;

    await client.query(
      `UPDATE referrals
       SET status = 'REWARDED', reward_status = 'GRANTED', rewarded_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [ref.id],
    );

    try {
      const { publishOutboxEvent } = await import('./outboxEngine.mjs');
      await publishOutboxEvent(client, {
        eventType: 'referral.rewarded',
        aggregateType: 'referral',
        aggregateId: ref.id,
        payload: {
          referralId: ref.id,
          referrerUserId: ref.referrer_user_id,
          referredUserId: ref.referred_user_id,
          referredAmount: referredAmt,
          referrerAmount: referrerAmt,
          rewardType: 'FREEBET',
        },
      });
    } catch {
      // outbox optional if table shape differs
    }

    return {
      success: true,
      qualified: true,
      referralId: ref.id,
      referrerUserId: ref.referrer_user_id,
      rewardAmount: referredAmt,
      referredGrant,
      referrerGrant,
    };
  });

  if (result?.success) {
    void notifyReferralRewarded(result).catch(() => null);
  }

  return result;
}

async function notifyReferralRewarded(result) {
  try {
    const { sendReferralRewardEmail } = await import('../server/auth/emailService.js');
    const users = await query(
      `SELECT user_id, email, first_name FROM users WHERE user_id = ANY($1::text[])`,
      [[result.referrerUserId, result.referredUserId || null].filter(Boolean)],
    );
    const byId = Object.fromEntries(users.rows.map((u) => [u.user_id, u]));
    const referred = byId[result.referredUserId];
    const referrer = byId[result.referrerUserId];
    if (referred?.email) {
      await sendReferralRewardEmail({
        email: referred.email,
        name: referred.first_name,
        amount: result.rewardAmount,
        role: 'referred',
      });
    }
    if (referrer?.email && result.referrerGrant) {
      await sendReferralRewardEmail({
        email: referrer.email,
        name: referrer.first_name,
        amount: Number(result.referrerGrant?.freebetBalance != null
          ? (await query(
            `SELECT referrer_reward_amount FROM referrals WHERE id = $1`,
            [result.referralId],
          )).rows[0]?.referrer_reward_amount
          : cfg().referrerReward),
        role: 'referrer',
      });
    }
  } catch (err) {
    logger.warn('referral_reward_email_failed', { error: err.message });
  }
}

/** Admin / deposit hook: attempt qualify after capture. */
export async function tryQualifyReferralAfterDeposit({ userId, amount } = {}) {
  try {
    return await qualifyReferralReward({
      referredUserId: userId,
      depositAmount: amount,
    });
  } catch (err) {
    logger.warn('referral_qualify_after_deposit_failed', { userId, error: err.message });
    return { qualified: false, error: err.message };
  }
}

export async function getMyReferralDashboard(userId) {
  const codeInfo = await ensureReferralCode(userId);
  const conf = cfg();
  const stats = await query(
    `SELECT
       COUNT(*)::int AS invited,
       COUNT(*) FILTER (WHERE qualification_status = 'QUALIFIED' OR status IN ('QUALIFIED','REWARDED'))::int AS qualified,
       COUNT(*) FILTER (WHERE status IN ('REGISTERED','FRAUD_REVIEW') OR qualification_status = 'PENDING')::int AS pending,
       COALESCE(SUM(referrer_reward_amount) FILTER (WHERE reward_status = 'GRANTED' OR status = 'REWARDED'), 0)::float AS rewards_earned
     FROM referrals WHERE referrer_user_id = $1`,
    [userId],
  );
  const history = await query(
    `SELECT r.id, r.status, r.qualification_status, r.reward_status,
            r.referrer_reward_amount, r.created_at, r.qualified_at, r.rewarded_at,
            LEFT(SPLIT_PART(COALESCE(u.email, ''), '@', 1), 3) || '***' AS referred_mask
     FROM referrals r
     LEFT JOIN users u ON u.user_id = r.referred_user_id
     WHERE r.referrer_user_id = $1
     ORDER BY r.created_at DESC
     LIMIT 50`,
    [userId],
  );
  const inbound = await userHasReferralAttribution(userId);
  return {
    enabled: conf.enabled,
    code: codeInfo?.code || null,
    status: codeInfo?.status || null,
    link: codeInfo?.link || referralLinkFromCode(codeInfo?.code),
    referredReward: conf.referredReward,
    referrerReward: conf.referrerReward,
    joinedViaReferral: Boolean(inbound),
    inboundReferralCode: inbound?.referral_code || null,
    stats: {
      invited: Number(stats.rows[0]?.invited || 0),
      qualified: Number(stats.rows[0]?.qualified || 0),
      pending: Number(stats.rows[0]?.pending || 0),
      rewardsEarned: Number(stats.rows[0]?.rewards_earned || 0),
    },
    history: history.rows || [],
  };
}

export async function validateReferralCode(rawCode) {
  const code = normalizeReferralCode(rawCode);
  if (!code) return { valid: false, code: 'REFERRAL_REQUIRED' };
  const row = await resolveReferrerByCode(code);
  if (!row) return { valid: false, code: 'REFERRAL_INVALID' };
  if (row.status !== 'ACTIVE') return { valid: false, code: 'REFERRAL_DISABLED' };
  return {
    valid: true,
    code: row.code,
    referrerName: row.first_name || 'OddsYra player',
  };
}

export async function listReferralsAdmin({
  limit = 100,
  status = null,
  q: search = null,
} = {}) {
  const clauses = [];
  const params = [];
  let idx = 1;
  if (status) {
    clauses.push(`r.status = $${idx}`);
    params.push(String(status).toUpperCase());
    idx += 1;
  }
  if (search) {
    clauses.push(`(
      r.id ILIKE $${idx} OR r.referral_code ILIKE $${idx}
      OR r.referrer_user_id ILIKE $${idx} OR r.referred_user_id ILIKE $${idx}
      OR COALESCE(ru.email,'') ILIKE $${idx} OR COALESCE(du.email,'') ILIKE $${idx}
    )`);
    params.push(`%${String(search).trim()}%`);
    idx += 1;
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(Math.min(Math.max(Number(limit) || 100, 1), 500));
  const res = await query(
    `SELECT r.*,
            ru.email AS referrer_email, ru.first_name AS referrer_name,
            du.email AS referred_email, du.first_name AS referred_name,
            COALESCE(p.kyc_status, 'NOT_STARTED') AS referred_kyc
     FROM referrals r
     LEFT JOIN users ru ON ru.user_id = r.referrer_user_id
     LEFT JOIN users du ON du.user_id = r.referred_user_id
     LEFT JOIN user_profiles p ON p.user_id = r.referred_user_id
     ${where}
     ORDER BY r.created_at DESC
     LIMIT $${idx}`,
    params,
  );
  const metrics = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status IN ('REGISTERED','FRAUD_REVIEW'))::int AS pending,
       COUNT(*) FILTER (WHERE status IN ('QUALIFIED','REWARDED') OR qualification_status = 'QUALIFIED')::int AS qualified,
       COUNT(*) FILTER (WHERE status = 'REWARDED' OR reward_status = 'GRANTED')::int AS rewarded,
       COALESCE(SUM(referrer_reward_amount + referred_reward_amount)
         FILTER (WHERE status = 'REWARDED' OR reward_status = 'GRANTED'), 0)::float AS reward_value
     FROM referrals`,
  );
  return {
    referrals: res.rows || [],
    metrics: metrics.rows[0] || {},
    config: cfg(),
  };
}

/**
 * Read-only referral analytics: funnel, top referrers, deposits/turnover of referred users.
 */
export async function getReferralAnalytics({
  from = null,
  to = null,
  limit = 25,
} = {}) {
  const params = [];
  const clauses = [];
  let idx = 1;
  if (from) {
    clauses.push(`r.created_at >= $${idx}::timestamptz`);
    params.push(new Date(from).toISOString());
    idx += 1;
  }
  if (to) {
    clauses.push(`r.created_at <= $${idx}::timestamptz`);
    params.push(new Date(to).toISOString());
    idx += 1;
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const funnel = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'REGISTERED')::int AS registered,
       COUNT(*) FILTER (WHERE status = 'FRAUD_REVIEW')::int AS fraud_review,
       COUNT(*) FILTER (WHERE status IN ('QUALIFIED','REWARDED')
         OR qualification_status = 'QUALIFIED')::int AS qualified,
       COUNT(*) FILTER (WHERE status = 'REWARDED' OR reward_status = 'GRANTED')::int AS rewarded,
       COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected,
       COALESCE(SUM(referrer_reward_amount + referred_reward_amount)
         FILTER (WHERE status = 'REWARDED' OR reward_status = 'GRANTED'), 0)::float AS reward_value
     FROM referrals r
     ${where}`,
    params,
  );

  const topParams = [...params];
  topParams.push(Math.min(100, Math.max(1, Number(limit) || 25)));
  const topReferrers = await query(
    `SELECT
       r.referrer_user_id,
       MAX(COALESCE(ru.first_name, SPLIT_PART(COALESCE(ru.email,''), '@', 1), r.referrer_user_id)) AS referrer_name,
       MAX(ru.email) AS referrer_email,
       MAX(rc.code) AS referral_code,
       COUNT(*)::int AS invites,
       COUNT(*) FILTER (WHERE r.status IN ('QUALIFIED','REWARDED')
         OR r.qualification_status = 'QUALIFIED')::int AS qualified,
       COUNT(*) FILTER (WHERE r.status = 'REWARDED' OR r.reward_status = 'GRANTED')::int AS rewarded,
       COALESCE(SUM(r.referrer_reward_amount)
         FILTER (WHERE r.status = 'REWARDED' OR r.reward_status = 'GRANTED'), 0)::float AS reward_earned,
       COALESCE(SUM(dep.deposit_total), 0)::float AS referred_deposits,
       COALESCE(SUM(bet.turnover), 0)::float AS referred_turnover
     FROM referrals r
     LEFT JOIN users ru ON ru.user_id = r.referrer_user_id
     LEFT JOIN referral_codes rc ON rc.user_id = r.referrer_user_id
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(d.amount),0) AS deposit_total
       FROM deposits d
       WHERE d.user_id = r.referred_user_id
         AND UPPER(COALESCE(d.status,'')) = 'CAPTURED'
     ) dep ON TRUE
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(b.stake),0) AS turnover
       FROM bets b
       WHERE b.user_id = r.referred_user_id
     ) bet ON TRUE
     ${where}
     GROUP BY r.referrer_user_id
     ORDER BY invites DESC, qualified DESC, reward_earned DESC
     LIMIT $${idx}`,
    topParams,
  );

  const abuse = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'FRAUD_REVIEW')::int AS fraud_review,
       COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected,
       COUNT(*) FILTER (
         WHERE COALESCE(metadata->>'abuse_flag','') <> ''
            OR COALESCE(metadata->>'fraud_reason','') <> ''
       )::int AS flagged_metadata
     FROM referrals r
     ${where}`,
    params,
  );

  return {
    success: true,
    from: from || null,
    to: to || null,
    funnel: funnel.rows[0] || {},
    topReferrers: (topReferrers.rows || []).map((row) => ({
      referrerUserId: row.referrer_user_id,
      referrerName: row.referrer_name,
      referrerEmail: row.referrer_email,
      referralCode: row.referral_code,
      invites: Number(row.invites || 0),
      qualified: Number(row.qualified || 0),
      rewarded: Number(row.rewarded || 0),
      rewardEarned: Number(row.reward_earned || 0),
      referredDeposits: Number(row.referred_deposits || 0),
      referredTurnover: Number(row.referred_turnover || 0),
    })),
    abuse: abuse.rows[0] || {},
    config: cfg(),
  };
}

export async function disableReferralCode({ code, adminId, reason } = {}) {
  const normalized = normalizeReferralCode(code);
  const res = await query(
    `UPDATE referral_codes SET status = 'DISABLED', updated_at = NOW()
     WHERE code = $1 RETURNING *`,
    [normalized],
  );
  if (!res.rows[0]) {
    throw Object.assign(new Error('Referral code not found'), { status: 404, code: 'NOT_FOUND' });
  }
  try {
    const { logAdminAction } = await import('../server/middleware/auditLogger.js');
    await logAdminAction({
      actorId: adminId || 'admin',
      targetId: res.rows[0].user_id,
      action: 'REFERRAL_CODE_DISABLED',
      details: { code: normalized, reason: reason || null },
    });
  } catch { /* ignore */ }
  return res.rows[0];
}

export async function adminRetryReferralReward({ referralId, adminId, reason } = {}) {
  const ref = await query(`SELECT * FROM referrals WHERE id = $1`, [referralId]);
  if (!ref.rows[0]) {
    throw Object.assign(new Error('Referral not found'), { status: 404 });
  }
  // Clear fraud hold if approving
  if (ref.rows[0].status === 'FRAUD_REVIEW') {
    await query(
      `UPDATE referrals SET status = 'REGISTERED', updated_at = NOW() WHERE id = $1`,
      [referralId],
    );
  }
  const result = await qualifyReferralReward({ referredUserId: ref.rows[0].referred_user_id });
  try {
    const { logAdminAction } = await import('../server/middleware/auditLogger.js');
    await logAdminAction({
      actorId: adminId || 'admin',
      targetId: ref.rows[0].referred_user_id,
      action: 'REFERRAL_REWARD_RETRIED',
      details: { referralId, reason: reason || null, result },
    });
  } catch { /* ignore */ }
  return result;
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
