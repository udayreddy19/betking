/**
 * User referral program — attribution, qualification, freebet/bonus rewards.
 * Reuses wallets.freebet_balance / bonus_balance + ledger/transactions.
 */

import crypto from 'crypto';
import { query, withTransaction } from '../db/pg.js';
import { recordDeviceFingerprint } from './deviceFingerprintEngine.mjs';
import { pointsFromSpendAtTier } from './vipBenefits.mjs';
import { earnLoyaltyPoints } from './loyaltyPointsStore.mjs';
import { logger } from './logger.mjs';

const REFERRAL_CONFIG_KEY = 'referral_program';

/** Runtime override from platform_config (null = not loaded yet / use env only). */
let _configOverride = null;
let _lockConfigForTests = false;

function envDefaults() {
  const kindRaw = String(process.env.REFERRAL_REWARD_KIND || 'freebet').toLowerCase();
  const playRateRaw = Number(process.env.REFERRAL_PLAY_COMMISSION_RATE || '0.05');
  let milestones = [
    { count: 5, amount: 250 },
    { count: 10, amount: 750 },
    { count: 25, amount: 2500 },
  ];
  try {
    if (process.env.REFERRAL_MILESTONES_JSON) {
      milestones = JSON.parse(process.env.REFERRAL_MILESTONES_JSON);
    }
  } catch { /* keep defaults */ }
  return {
    enabled: String(process.env.REFERRAL_PROGRAM_ENABLED || 'true').toLowerCase() !== 'false',
    rewardKind: kindRaw === 'bonus' ? 'bonus' : 'freebet',
    referredReward: Math.max(0, Number(process.env.REFERRAL_REFERRED_FREEBET || '500') || 500),
    referrerReward: Math.max(0, Number(process.env.REFERRAL_REFERRER_FREEBET || '500') || 500),
    minDeposit: Math.max(0, Number(process.env.REFERRAL_MIN_DEPOSIT || '1') || 1),
    requireKyc: String(process.env.REFERRAL_REQUIRE_KYC || 'true').toLowerCase() !== 'false',
    requireFirstBet: String(process.env.REFERRAL_REQUIRE_FIRST_BET || 'false').toLowerCase() === 'true',
    requireRiskClearance: String(process.env.REFERRAL_REQUIRE_RISK_CLEARANCE || 'true').toLowerCase() !== 'false',
    maxReferralsPerUser: Math.max(0, parseInt(process.env.REFERRAL_MAX_PER_USER || '0', 10) || 0),
    attributionExpireDays: Math.max(0, parseInt(process.env.REFERRAL_ATTRIBUTION_EXPIRE_DAYS || '30', 10) || 30),
    playCommissionEnabled: String(process.env.REFERRAL_PLAY_COMMISSION_ENABLED || 'true').toLowerCase() !== 'false',
    playCommissionRate: Math.min(1, Math.max(0, Number.isFinite(playRateRaw) ? playRateRaw : 0.05)),
    playCommissionDailyCap: Math.max(0, Number(process.env.REFERRAL_PLAY_COMMISSION_DAILY_CAP || '2000') || 2000),
    referrerDailyCap: Math.max(0, Number(process.env.REFERRAL_REFERRER_DAILY_CAP || '5000') || 5000),
    referrerWeeklyCap: Math.max(0, Number(process.env.REFERRAL_REFERRER_WEEKLY_CAP || '20000') || 20000),
    campaignMultiplier: Math.max(1, Number(process.env.REFERRAL_CAMPAIGN_MULTIPLIER || '1') || 1),
    campaignLabel: String(process.env.REFERRAL_CAMPAIGN_LABEL || '').trim() || null,
    campaignEndsAt: process.env.REFERRAL_CAMPAIGN_ENDS_AT || null,
    milestones: Array.isArray(milestones) ? milestones : [],
    /** Bonus wallet wagering multiplier when rewardKind=bonus (0 = none). */
    bonusWageringMultiplier: Math.max(0, Number(process.env.REFERRAL_BONUS_WAGERING_MULTIPLIER || '1') || 1),
  };
}

function normalizeRewardKind(raw) {
  const k = String(raw || '').toLowerCase();
  return k === 'bonus' ? 'bonus' : 'freebet';
}

function normalizeSettings(partial = {}) {
  const base = envDefaults();
  const next = { ...base, ...(partial && typeof partial === 'object' ? partial : {}) };
  next.rewardKind = normalizeRewardKind(next.rewardKind);
  next.referredReward = Math.max(0, Number(next.referredReward) || 0);
  next.referrerReward = Math.max(0, Number(next.referrerReward) || 0);
  next.minDeposit = Math.max(0, Number(next.minDeposit) || 0);
  next.enabled = next.enabled !== false && String(next.enabled).toLowerCase() !== 'false';
  next.requireKyc = next.requireKyc === true || String(next.requireKyc).toLowerCase() === 'true';
  next.requireFirstBet = next.requireFirstBet === true || String(next.requireFirstBet).toLowerCase() === 'true';
  next.requireRiskClearance = next.requireRiskClearance !== false
    && String(next.requireRiskClearance).toLowerCase() !== 'false';
  next.maxReferralsPerUser = Math.max(0, parseInt(next.maxReferralsPerUser, 10) || 0);
  next.attributionExpireDays = Math.max(0, parseInt(next.attributionExpireDays, 10) || 0);
  next.playCommissionEnabled = next.playCommissionEnabled !== false
    && String(next.playCommissionEnabled).toLowerCase() !== 'false';
  const rate = Number(next.playCommissionRate);
  next.playCommissionRate = Math.min(1, Math.max(0, Number.isFinite(rate) ? rate : 0.05));
  next.playCommissionDailyCap = Math.max(0, Number(next.playCommissionDailyCap) || 0);
  next.referrerDailyCap = Math.max(0, Number(next.referrerDailyCap) || 0);
  next.referrerWeeklyCap = Math.max(0, Number(next.referrerWeeklyCap) || 0);
  next.campaignMultiplier = Math.max(1, Number(next.campaignMultiplier) || 1);
  next.campaignLabel = next.campaignLabel ? String(next.campaignLabel).trim() : null;
  next.campaignEndsAt = next.campaignEndsAt || null;
  next.bonusWageringMultiplier = Math.max(0, Number(next.bonusWageringMultiplier) || 0);
  if (!Array.isArray(next.milestones)) next.milestones = base.milestones;
  next.milestones = next.milestones
    .map((m) => ({ count: Math.max(1, parseInt(m.count, 10) || 0), amount: Math.max(0, Number(m.amount) || 0) }))
    .filter((m) => m.count > 0 && m.amount > 0)
    .sort((a, b) => a.count - b.count);
  // Active campaign window — if ended, force multiplier 1
  if (next.campaignEndsAt) {
    const ends = Date.parse(next.campaignEndsAt);
    if (Number.isFinite(ends) && Date.now() > ends) {
      next.campaignMultiplier = 1;
      next.campaignLabel = null;
    }
  }
  return next;
}

function cfg() {
  if (_configOverride) return { ...envDefaults(), ..._configOverride };
  return envDefaults();
}

export function rewardKindLabel(kind = cfg().rewardKind) {
  return normalizeRewardKind(kind) === 'bonus' ? 'Bonus' : 'Free Bet';
}

export function getReferralProgramConfig() {
  return cfg();
}

/** Load referral settings from platform_config into memory (safe to call often). */
export async function refreshReferralProgramConfig() {
  if (_lockConfigForTests) return cfg();
  try {
    const { getConfig } = await import('./configEngine.mjs');
    const res = await getConfig(REFERRAL_CONFIG_KEY);
    if (res?.success && res.value != null) {
      let value = res.value;
      if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch { value = null; }
      }
      if (value && typeof value === 'object') {
        _configOverride = normalizeSettings(value);
      }
    }
  } catch {
    // Keep env defaults when config store is unavailable.
  }
  return cfg();
}

export async function getReferralProgramConfigAsync() {
  await refreshReferralProgramConfig();
  return cfg();
}

/**
 * Admin: update referral reward kind/amounts (persisted in platform_config).
 */
export async function updateReferralProgramSettings(partial = {}, {
  adminId = 'admin',
  reason = 'Admin referral settings update',
} = {}) {
  await refreshReferralProgramConfig();
  const next = normalizeSettings({ ...cfg(), ...partial });
  const { setConfig } = await import('./configEngine.mjs');
  await setConfig({
    configKey: REFERRAL_CONFIG_KEY,
    configValue: {
      enabled: next.enabled,
      rewardKind: next.rewardKind,
      referredReward: next.referredReward,
      referrerReward: next.referrerReward,
      minDeposit: next.minDeposit,
      requireKyc: next.requireKyc,
      requireFirstBet: next.requireFirstBet,
      requireRiskClearance: next.requireRiskClearance,
      maxReferralsPerUser: next.maxReferralsPerUser,
      attributionExpireDays: next.attributionExpireDays,
      playCommissionEnabled: next.playCommissionEnabled,
      playCommissionRate: next.playCommissionRate,
      playCommissionDailyCap: next.playCommissionDailyCap,
      referrerDailyCap: next.referrerDailyCap,
      referrerWeeklyCap: next.referrerWeeklyCap,
      campaignMultiplier: next.campaignMultiplier,
      campaignLabel: next.campaignLabel,
      campaignEndsAt: next.campaignEndsAt,
      milestones: next.milestones,
      bonusWageringMultiplier: next.bonusWageringMultiplier,
    },
    category: 'PROMOTIONS',
    description: 'Referral program reward kind and amounts',
    changedBy: adminId,
    reason,
  });
  _configOverride = next;
  logger.info('referral_program_settings_updated', {
    adminId,
    rewardKind: next.rewardKind,
    referredReward: next.referredReward,
    referrerReward: next.referrerReward,
    playCommissionEnabled: next.playCommissionEnabled,
    playCommissionRate: next.playCommissionRate,
  });
  return next;
}

/** Round INR to 2 dp for play-commission grants. */
export function computePlayCommissionAmount(stake, rate = cfg().playCommissionRate) {
  const s = Number(stake) || 0;
  const r = Math.min(1, Math.max(0, Number(rate) || 0));
  if (s <= 0 || r <= 0) return 0;
  return Math.round(s * r * 100) / 100;
}

/**
 * When a referred user settles a cash bet (WON/LOST), credit the referrer
 * playCommissionRate × stake as freebet/bonus. Idempotent per betId.
 */
export async function creditReferrerPlayCommission({
  betId,
  referredUserId,
  stake,
  fundSource = 'cash',
  outcome = null,
} = {}) {
  await refreshReferralProgramConfig();
  const conf = cfg();
  if (!conf.enabled || !conf.playCommissionEnabled) {
    return { credited: false, reason: 'disabled' };
  }
  if (!betId || !referredUserId) {
    return { credited: false, reason: 'missing_args' };
  }
  const outcomeUp = String(outcome || '').toUpperCase();
  if (outcomeUp !== 'WON' && outcomeUp !== 'LOST') {
    return { credited: false, reason: 'outcome_not_play' };
  }
  const fund = String(fundSource || 'cash').toLowerCase();
  if (fund !== 'cash') {
    return { credited: false, reason: 'non_cash_stake' };
  }

  const amount = computePlayCommissionAmount(stake, conf.playCommissionRate);
  if (amount < 0.01) {
    return { credited: false, reason: 'amount_too_small' };
  }

  const idempotencyKey = `REFERRAL_PLAY:${betId}`;
  const kind = conf.rewardKind;
  const rewardType = kind === 'bonus' ? 'REFERRER_PLAY_BONUS' : 'REFERRER_PLAY_FREEBET';

  try {
    const result = await withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT id, status, amount, transaction_id FROM referral_reward_events
         WHERE idempotency_key = $1 LIMIT 1`,
        [idempotencyKey],
      );
      if (existing.rows[0]) {
        return {
          credited: false,
          duplicate: true,
          eventId: existing.rows[0].id,
          amount: Number(existing.rows[0].amount) || 0,
        };
      }

      const refRes = await client.query(
        `SELECT id, referrer_user_id, status
         FROM referrals
         WHERE referred_user_id = $1
         LIMIT 1
         FOR UPDATE`,
        [referredUserId],
      );
      const ref = refRes.rows[0];
      if (!ref) return { credited: false, reason: 'no_referral' };
      if (ref.status === 'REJECTED' || ref.status === 'FRAUD_REVIEW') {
        return { credited: false, reason: ref.status };
      }
      if (ref.referrer_user_id === referredUserId) {
        return { credited: false, reason: 'self_referral' };
      }

      let grantAmount = amount;
      if (conf.playCommissionDailyCap > 0) {
        const daySum = await client.query(
          `SELECT COALESCE(SUM(e.amount), 0)::float AS earned
           FROM referral_reward_events e
           JOIN referrals r ON r.id = e.referral_id
           WHERE e.beneficiary_user_id = $1
             AND e.reward_type IN ('REFERRER_PLAY_FREEBET', 'REFERRER_PLAY_BONUS')
             AND e.status = 'GRANTED'
             AND e.created_at >= date_trunc('day', NOW())`,
          [ref.referrer_user_id],
        );
        const earnedToday = Number(daySum.rows[0]?.earned || 0);
        const remaining = conf.playCommissionDailyCap - earnedToday;
        if (remaining < 0.01) {
          return { credited: false, reason: 'daily_cap', earnedToday };
        }
        grantAmount = Math.min(grantAmount, Math.round(remaining * 100) / 100);
      }

      const grant = await creditReferralReward(client, {
        userId: ref.referrer_user_id,
        amount: grantAmount,
        referralId: ref.id,
        rewardType,
        idempotencyKey,
        rewardKind: kind,
      });

      await client.query(
        `UPDATE referrals
         SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'playCommissionTotal',
           COALESCE((metadata->>'playCommissionTotal')::numeric, 0) + $2::numeric,
           'playCommissionLastBetId', $3::text,
           'playCommissionLastAt', NOW()::text
         ),
         updated_at = NOW()
         WHERE id = $1`,
        [ref.id, grantAmount, betId],
      );

      return {
        credited: !grant.duplicate,
        duplicate: !!grant.duplicate,
        amount: grantAmount,
        referrerUserId: ref.referrer_user_id,
        referralId: ref.id,
        eventId: grant.eventId,
        transactionId: grant.transactionId,
        rewardKind: kind,
        rate: conf.playCommissionRate,
      };
    });

    if (result?.credited) {
      logger.info('referral_play_commission_granted', {
        betId,
        referredUserId,
        referrerUserId: result.referrerUserId,
        amount: result.amount,
        rate: conf.playCommissionRate,
      });
    }
    return result;
  } catch (err) {
    logger.error('referral_play_commission_failed', {
      betId,
      referredUserId,
      error: err?.message || err,
    });
    return { credited: false, reason: 'error', error: err?.message || String(err) };
  }
}

/** Test helper — clear cached override so env defaults apply. */
export function __resetReferralConfigCacheForTests() {
  _configOverride = null;
  _lockConfigForTests = false;
}

/** Test helper — force in-memory config (skips platform_config). */
export function __setReferralConfigForTests(partial = {}) {
  _configOverride = normalizeSettings({ ...envDefaults(), ...partial });
  _lockConfigForTests = true;
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
  await refreshReferralProgramConfig();
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
  const mult = Number(conf.campaignMultiplier) || 1;
  const referredAmt = (referredRewardAmount != null ? Number(referredRewardAmount) : conf.referredReward) * mult;
  const referrerAmt = (referrerRewardAmount != null ? Number(referrerRewardAmount) : conf.referrerReward) * mult;
  const expireDays = Number(conf.attributionExpireDays) || 0;

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

  if (insert.rows[0] && expireDays > 0) {
    await query(
      `UPDATE referrals
       SET expires_at = NOW() + ($2::text || ' days')::interval,
           metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [
        insert.rows[0].id,
        expireDays,
        JSON.stringify({
          campaignMultiplier: mult,
          campaignLabel: conf.campaignLabel || null,
        }),
      ],
    ).catch(() => null);
  }

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

async function creditReferralReward(client, {
  userId,
  amount,
  referralId,
  rewardType,
  idempotencyKey,
  rewardKind = 'freebet',
}) {
  const kind = normalizeRewardKind(rewardKind);
  const existing = await client.query(
    `SELECT id, status, transaction_id FROM referral_reward_events WHERE idempotency_key = $1 LIMIT 1`,
    [idempotencyKey],
  );
  if (existing.rows[0]) {
    return { duplicate: true, eventId: existing.rows[0].id, transactionId: existing.rows[0].transaction_id };
  }

  let walletRes = await client.query(
    `SELECT wallet_id, balance, COALESCE(bonus_balance, 0) AS bonus_balance,
            COALESCE(freebet_balance, 0) AS freebet_balance
     FROM wallets WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  if (!walletRes.rows[0]) {
    await client.query(
      `INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, freebet_balance, currency)
       VALUES ($1, $2, 0, 0, 0, 'INR')
       ON CONFLICT (user_id) DO NOTHING`,
      [`wal_${userId}`, userId],
    );
    walletRes = await client.query(
      `SELECT wallet_id, balance, COALESCE(bonus_balance, 0) AS bonus_balance,
              COALESCE(freebet_balance, 0) AS freebet_balance
       FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
  }
  if (!walletRes.rows[0]) {
    throw Object.assign(new Error('Wallet not found for referral reward.'), {
      code: 'WALLET_NOT_FOUND',
      status: 400,
    });
  }
  const wallet = walletRes.rows[0];
  const txId = `tx_ref_${crypto.randomBytes(12).toString('hex')}`;
  const eid = eventId();
  const amt = Number(amount) || 0;

  await client.query(
    `INSERT INTO transactions (transaction_id, user_id, type, method, amount, status)
     VALUES ($1, $2, 'BONUS_CLAIM', 'REFERRAL', $3, 'COMPLETED')`,
    [txId, userId, amt],
  );

  let balanceAfter;
  if (kind === 'bonus') {
    const nextBonus = Number(wallet.bonus_balance || 0) + amt;
    balanceAfter = nextBonus;
    await client.query(
      `UPDATE wallets SET bonus_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
      [nextBonus, wallet.wallet_id],
    );
  } else {
    const nextFreebet = Number(wallet.freebet_balance || 0) + amt;
    balanceAfter = nextFreebet;
    await client.query(
      `UPDATE wallets SET freebet_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
      [nextFreebet, wallet.wallet_id],
    );
  }

  await client.query(
    `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
     VALUES ($1, $2, 'CREDIT', $3, $4, $5)`,
    [wallet.wallet_id, txId, amt, balanceAfter, `Referral ${rewardType} · ${referralId}`],
  );
  await client.query(
    `INSERT INTO referral_reward_events (
       id, referral_id, beneficiary_user_id, reward_type, amount, idempotency_key, transaction_id, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'GRANTED')`,
    [eid, referralId, userId, rewardType, amt, idempotencyKey, txId],
  );

  return {
    duplicate: false,
    eventId: eid,
    transactionId: txId,
    rewardKind: kind,
    freebetBalance: kind === 'freebet' ? balanceAfter : Number(wallet.freebet_balance || 0),
    bonusBalance: kind === 'bonus' ? balanceAfter : Number(wallet.bonus_balance || 0),
  };
}

/** @deprecated use creditReferralReward — kept name for any external callers */
async function creditFreebet(client, args) {
  return creditReferralReward(client, { ...args, rewardKind: 'freebet' });
}

/**
 * Qualify + grant referral rewards (idempotent).
 * Gates: min deposit, KYC (when enabled), optional first cash bet, attribution expiry.
 */
export async function qualifyReferralReward({ referredUserId } = {}) {
  await refreshReferralProgramConfig();
  const conf = cfg();
  if (!conf.enabled) return { qualified: false, reason: 'disabled' };

  const refRes = await query(
    `SELECT id, referrer_user_id, referred_user_id, reward_amount, status,
            COALESCE(referred_reward_amount, reward_amount) AS referred_reward_amount,
            COALESCE(referrer_reward_amount, reward_amount) AS referrer_reward_amount,
            qualification_status, reward_status, created_at
     FROM referrals
     WHERE referred_user_id = $1
     LIMIT 1`,
    [referredUserId],
  );
  if (!refRes.rows[0]) return { qualified: false, reason: 'No pending referral found' };

  const ref = refRes.rows[0];
  try {
    const exp = await query(`SELECT expires_at FROM referrals WHERE id = $1`, [ref.id]);
    ref.expires_at = exp.rows[0]?.expires_at || null;
  } catch {
    ref.expires_at = null;
  }
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

  // Expire unused attributions
  try {
    if (ref.expires_at && new Date(ref.expires_at).getTime() < Date.now()) {
      await query(
        `UPDATE referrals
         SET status = 'REJECTED', qualification_status = 'FAILED', reward_status = 'FAILED',
             metadata = COALESCE(metadata, '{}'::jsonb) || '{"reason":"attribution_expired"}'::jsonb,
             updated_at = NOW()
         WHERE id = $1 AND status NOT IN ('REWARDED', 'REJECTED')`,
        [ref.id],
      );
      return { qualified: false, reason: 'attribution_expired', referralId: ref.id };
    }
  } catch { /* expires_at column may be pending migration */ }

  if (conf.requireKyc) {
    const kyc = await query(
      `SELECT UPPER(COALESCE(kyc_status, 'NOT_STARTED')) AS kyc
       FROM user_profiles WHERE user_id = $1`,
      [referredUserId],
    );
    if (!['VERIFIED', 'APPROVED'].includes(String(kyc.rows[0]?.kyc || ''))) {
      return { qualified: false, reason: 'KYC required', referralId: ref.id };
    }
  }

  if (conf.minDeposit > 0) {
    const dep = await query(
      `SELECT COALESCE(SUM(amount), 0)::float AS total
       FROM deposits
       WHERE user_id = $1
         AND UPPER(COALESCE(status, '')) IN ('PAID', 'CAPTURED', 'COMPLETED', 'SUCCESS')`,
      [referredUserId],
    );
    const deposited = Number(dep.rows[0]?.total || 0);
    await query(
      `UPDATE referrals SET qualified_deposit_total = $2, updated_at = NOW() WHERE id = $1`,
      [ref.id, deposited],
    ).catch(() => null);
    if (deposited + 1e-9 < conf.minDeposit) {
      return {
        qualified: false,
        reason: 'min_deposit',
        deposited,
        required: conf.minDeposit,
        referralId: ref.id,
      };
    }
  }

  if (conf.requireFirstBet) {
    const bet = await query(
      `SELECT bet_id, settled_at FROM bets
       WHERE user_id = $1
         AND LOWER(COALESCE(fund_source, 'cash')) = 'cash'
         AND UPPER(COALESCE(status, '')) IN ('WON', 'LOST', 'SETTLED', 'ACCEPTED', 'PENDING', 'OPEN')
       ORDER BY created_at ASC NULLS LAST
       LIMIT 1`,
      [referredUserId],
    );
    if (!bet.rows[0]) {
      return { qualified: false, reason: 'first_bet_required', referralId: ref.id };
    }
    await query(
      `UPDATE referrals SET first_bet_at = COALESCE(first_bet_at, NOW()), updated_at = NOW() WHERE id = $1`,
      [ref.id],
    ).catch(() => null);
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

    // Cap check for referrer signup reward
    let referrerAmt = Number(row.referrer_reward_amount ?? conf.referrerReward);
    if (conf.referrerDailyCap > 0 || conf.referrerWeeklyCap > 0) {
      const caps = await client.query(
        `SELECT
           COALESCE(SUM(e.amount) FILTER (WHERE e.created_at >= date_trunc('day', NOW())), 0)::float AS day_amt,
           COALESCE(SUM(e.amount) FILTER (WHERE e.created_at >= date_trunc('week', NOW())), 0)::float AS week_amt
         FROM referral_reward_events e
         WHERE e.beneficiary_user_id = $1 AND e.status = 'GRANTED'`,
        [row.referrer_user_id],
      );
      const dayAmt = Number(caps.rows[0]?.day_amt || 0);
      const weekAmt = Number(caps.rows[0]?.week_amt || 0);
      if (conf.referrerDailyCap > 0 && dayAmt + referrerAmt > conf.referrerDailyCap) {
        referrerAmt = Math.max(0, conf.referrerDailyCap - dayAmt);
      }
      if (conf.referrerWeeklyCap > 0 && weekAmt + referrerAmt > conf.referrerWeeklyCap) {
        referrerAmt = Math.max(0, Math.min(referrerAmt, conf.referrerWeeklyCap - weekAmt));
      }
    }

    const referredAmt = Number(row.referred_reward_amount ?? conf.referredReward);
    const kind = conf.rewardKind;
    const referredType = kind === 'bonus' ? 'REFERRED_BONUS' : 'REFERRED_FREEBET';
    const referrerType = kind === 'bonus' ? 'REFERRER_BONUS' : 'REFERRER_FREEBET';

    await client.query(
      `UPDATE referrals
       SET status = 'QUALIFIED', qualification_status = 'QUALIFIED',
           qualified_at = COALESCE(qualified_at, NOW()), updated_at = NOW()
       WHERE id = $1`,
      [ref.id],
    );

    const referredGrant = referredAmt > 0
      ? await creditReferralReward(client, {
        userId: row.referred_user_id,
        amount: referredAmt,
        referralId: ref.id,
        rewardType: referredType,
        rewardKind: kind,
        idempotencyKey: `REFERRAL_REWARD:${ref.id}:REFERRED_USER`,
      })
      : null;

    const referrerGrant = referrerAmt > 0
      ? await creditReferralReward(client, {
        userId: row.referrer_user_id,
        amount: referrerAmt,
        referralId: ref.id,
        rewardType: referrerType,
        rewardKind: kind,
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
          rewardType: kind === 'bonus' ? 'BONUS' : 'FREEBET',
          rewardKind: kind,
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
      referredUserId: ref.referred_user_id,
      rewardAmount: referredAmt,
      referredGrant,
      referrerGrant,
    };
  });

  if (result?.success) {
    void notifyReferralRewarded(result).catch(() => null);
    try {
      const { maybeGrantReferralMilestones } = await import('./referralGrowthEngine.mjs');
      await maybeGrantReferralMilestones(result.referrerUserId);
    } catch (err) {
      logger.warn('referral_milestone_hook_failed', { error: err?.message });
    }
    try {
      const { notifyReferralProgress } = await import('./referralGrowthEngine.mjs');
      await notifyReferralProgress({
        referrerUserId: result.referrerUserId,
        referredUserId: result.referredUserId,
        kind: 'rewarded',
      });
    } catch { /* optional */ }
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

/** KYC / Account verification hook: attempt qualify after user verification. */
export async function tryQualifyReferralAfterVerification({ userId } = {}) {
  if (!userId) return { qualified: false, reason: 'missing_user_id' };
  try {
    const existing = await userHasReferralAttribution(userId);
    if (!existing) return { qualified: false, reason: 'no_referral_attribution' };
    return await qualifyReferralReward({
      referredUserId: userId,
      verificationTrigger: true,
    });
  } catch (err) {
    logger.warn('referral_qualify_after_verification_failed', { userId, error: err.message });
    return { qualified: false, error: err.message };
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

/**
 * Background reconciliation fallback: finds pending/unrewarded referrals,
 * evaluates canonical verification & risk status, and qualifies eligible rewards idempotently.
 */
export async function reconcilePendingReferrals({ batchSize = 100 } = {}) {
  const conf = cfg();
  if (!conf.enabled) {
    return { success: false, skipped: true, reason: 'Referral program disabled' };
  }

  let expired = 0;
  try {
    const { expireStaleReferralAttributions } = await import('./referralGrowthEngine.mjs');
    const exp = await expireStaleReferralAttributions({ batchSize });
    expired = exp.expired || 0;
  } catch { /* optional */ }

  const limit = Math.min(Math.max(Number(batchSize) || 100, 1), 500);
  const pending = await query(
    `SELECT r.id, r.referrer_user_id, r.referred_user_id, r.status, r.qualification_status, r.reward_status,
            COALESCE(p.kyc_status, 'NOT_STARTED') AS kyc_status,
            u.status AS user_status
     FROM referrals r
     JOIN users u ON u.user_id = r.referred_user_id
     LEFT JOIN user_profiles p ON p.user_id = r.referred_user_id
     WHERE r.status NOT IN ('REWARDED', 'REJECTED')
        OR r.reward_status = 'PENDING'
     ORDER BY r.created_at ASC
     LIMIT $1`,
    [limit],
  );

  let processed = 0;
  let qualified = 0;
  let skipped = 0;
  let errors = 0;
  const results = [];

  for (const row of pending.rows) {
    processed += 1;
    try {
      const res = await qualifyReferralReward({ referredUserId: row.referred_user_id });
      if (res?.success && res?.qualified) {
        qualified += 1;
        results.push({ referralId: row.id, referredUserId: row.referred_user_id, status: 'REWARDED' });
      } else {
        skipped += 1;
        results.push({ referralId: row.id, referredUserId: row.referred_user_id, status: row.status, reason: res?.reason || 'skipped' });
      }
    } catch (err) {
      errors += 1;
      logger.warn('referral_reconciliation_row_error', { referralId: row.id, error: err.message });
      results.push({ referralId: row.id, referredUserId: row.referred_user_id, status: 'ERROR', error: err.message });
    }
  }

  return {
    success: true,
    processed,
    qualified,
    skipped,
    errors,
    expired,
    results,
  };
}

export async function getMyReferralDashboard(userId) {
  const codeInfo = await ensureReferralCode(userId);
  await refreshReferralProgramConfig();
  const conf = cfg();
  const stats = await query(
    `SELECT
       COUNT(*)::int AS invited,
       COUNT(*) FILTER (WHERE qualification_status = 'QUALIFIED' OR status IN ('QUALIFIED','REWARDED'))::int AS qualified,
       COUNT(*) FILTER (WHERE status IN ('REGISTERED','FRAUD_REVIEW') OR qualification_status = 'PENDING')::int AS pending,
       COALESCE(SUM(referrer_reward_amount) FILTER (WHERE reward_status = 'GRANTED' OR status = 'REWARDED'), 0)::float AS signup_rewards
     FROM referrals WHERE referrer_user_id = $1`,
    [userId],
  );
  const playStats = await query(
    `SELECT
       COALESCE(SUM(e.amount), 0)::float AS play_earnings,
       COUNT(*)::int AS play_credits
     FROM referral_reward_events e
     JOIN referrals r ON r.id = e.referral_id
     WHERE r.referrer_user_id = $1
       AND e.beneficiary_user_id = $1
       AND e.reward_type IN ('REFERRER_PLAY_FREEBET', 'REFERRER_PLAY_BONUS')
       AND e.status = 'GRANTED'`,
    [userId],
  );
  const history = await query(
    `SELECT r.id, r.status, r.qualification_status, r.reward_status,
            r.referrer_reward_amount, r.created_at, r.qualified_at, r.rewarded_at,
            COALESCE((r.metadata->>'playCommissionTotal')::float, 0) AS play_commission_total,
            LEFT(SPLIT_PART(COALESCE(u.email, ''), '@', 1), 3) || '***' AS referred_mask
     FROM referrals r
     LEFT JOIN users u ON u.user_id = r.referred_user_id
     WHERE r.referrer_user_id = $1
     ORDER BY r.created_at DESC
     LIMIT 50`,
    [userId],
  );
  const inbound = await userHasReferralAttribution(userId);
  const signupRewards = Number(stats.rows[0]?.signup_rewards || 0);
  const playEarnings = Number(playStats.rows[0]?.play_earnings || 0);
  const playRatePct = Math.round((Number(conf.playCommissionRate) || 0) * 1000) / 10;
  let share = null;
  let milestones = { next: null, granted: [], successful: Number(stats.rows[0]?.qualified || 0) };
  try {
    const { buildReferralShareAssets } = await import('./referralGrowthEngine.mjs');
    share = buildReferralShareAssets(codeInfo?.code, {
      referredReward: conf.referredReward * (conf.campaignMultiplier || 1),
      rewardLabel: rewardKindLabel(conf.rewardKind),
      playCommissionRatePct: playRatePct,
    });
  } catch { /* optional */ }
  try {
    const ms = conf.milestones || [];
    const successful = Number(stats.rows[0]?.qualified || 0);
    const next = ms.find((m) => successful < m.count) || null;
    const grantedRes = await query(
      `SELECT milestone, amount, created_at FROM referral_milestone_grants
       WHERE referrer_user_id = $1 ORDER BY milestone ASC`,
      [userId],
    ).catch(() => ({ rows: [] }));
    milestones = {
      list: ms,
      successful,
      next,
      granted: grantedRes.rows || [],
    };
  } catch { /* optional */ }

  return {
    enabled: conf.enabled,
    code: codeInfo?.code || null,
    status: codeInfo?.status || null,
    link: codeInfo?.link || referralLinkFromCode(codeInfo?.code),
    rewardKind: conf.rewardKind,
    rewardLabel: rewardKindLabel(conf.rewardKind),
    referredReward: conf.referredReward,
    referrerReward: conf.referrerReward,
    playCommissionEnabled: conf.playCommissionEnabled,
    playCommissionRate: conf.playCommissionRate,
    playCommissionRatePct: playRatePct,
    minDeposit: conf.minDeposit,
    requireKyc: conf.requireKyc,
    requireFirstBet: conf.requireFirstBet,
    campaignMultiplier: conf.campaignMultiplier,
    campaignLabel: conf.campaignLabel,
    campaignEndsAt: conf.campaignEndsAt,
    share,
    milestones,
    joinedViaReferral: Boolean(inbound),
    inboundReferralCode: inbound?.referral_code || null,
    stats: {
      invited: Number(stats.rows[0]?.invited || 0),
      qualified: Number(stats.rows[0]?.qualified || 0),
      pending: Number(stats.rows[0]?.pending || 0),
      signupRewards,
      playEarnings,
      playCredits: Number(playStats.rows[0]?.play_credits || 0),
      rewardsEarned: signupRewards + playEarnings,
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
    config: await getReferralProgramConfigAsync(),
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
         AND UPPER(COALESCE(d.status,'')) IN ('PAID','CAPTURED','SUCCESS','COMPLETED')
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
    config: await getReferralProgramConfigAsync(),
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

/** Explicit fraud/admin approve — clear FRAUD_REVIEW then qualify. */
export async function adminApproveReferral({ referralId, adminId, reason } = {}) {
  const ref = await query(`SELECT * FROM referrals WHERE id = $1`, [referralId]);
  if (!ref.rows[0]) {
    throw Object.assign(new Error('Referral not found'), { status: 404 });
  }
  if (ref.rows[0].status === 'REJECTED') {
    throw Object.assign(new Error('Referral already rejected'), { status: 400, code: 'ALREADY_REJECTED' });
  }
  if (ref.rows[0].status === 'REWARDED') {
    return { success: true, alreadyRewarded: true, referralId };
  }
  await query(
    `UPDATE referrals
     SET status = 'REGISTERED',
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'approvedBy', $2::text, 'approvedReason', $3::text, 'approvedAt', NOW()::text
         ),
         updated_at = NOW()
     WHERE id = $1`,
    [referralId, adminId || 'admin', reason || 'Admin approve'],
  );
  const result = await qualifyReferralReward({ referredUserId: ref.rows[0].referred_user_id });
  try {
    const { logAdminAction } = await import('../server/middleware/auditLogger.js');
    await logAdminAction({
      actorId: adminId || 'admin',
      targetId: ref.rows[0].referred_user_id,
      action: 'REFERRAL_APPROVED',
      details: { referralId, reason: reason || null, result },
    });
  } catch { /* ignore */ }
  return { success: true, approved: true, ...result };
}

/** Explicit reject — blocks future qualify and play commission. */
export async function adminRejectReferral({ referralId, adminId, reason } = {}) {
  const ref = await query(`SELECT * FROM referrals WHERE id = $1`, [referralId]);
  if (!ref.rows[0]) {
    throw Object.assign(new Error('Referral not found'), { status: 404 });
  }
  if (ref.rows[0].status === 'REWARDED') {
    // Reject after reward → clawback
    const claw = await clawbackReferralRewards({
      referralId,
      reason: reason || 'Admin reject after reward',
      adminId,
    });
    return { success: true, rejected: true, clawedBack: true, ...claw };
  }
  await query(
    `UPDATE referrals
     SET status = 'REJECTED', qualification_status = 'FAILED', reward_status = 'FAILED',
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'rejectedBy', $2::text, 'rejectedReason', $3::text, 'rejectedAt', NOW()::text
         ),
         updated_at = NOW()
     WHERE id = $1`,
    [referralId, adminId || 'admin', reason || 'Admin reject'],
  );
  try {
    const { logAdminAction } = await import('../server/middleware/auditLogger.js');
    await logAdminAction({
      actorId: adminId || 'admin',
      targetId: ref.rows[0].referred_user_id,
      action: 'REFERRAL_REJECTED',
      details: { referralId, reason: reason || null },
    });
  } catch { /* ignore */ }
  return { success: true, rejected: true, referralId };
}

/**
 * Reverse GRANTED referral rewards (freebet/bonus buckets) for a referral or referred user.
 * Used on ban / chargeback / promo abuse / admin reject.
 */
export async function clawbackReferralRewards({
  referralId = null,
  referredUserId = null,
  reason = 'clawback',
  adminId = 'SYSTEM',
} = {}) {
  const refs = await query(
    `SELECT * FROM referrals
     WHERE ($1::text IS NOT NULL AND id = $1)
        OR ($2::text IS NOT NULL AND referred_user_id = $2)
     ORDER BY created_at DESC`,
    [referralId, referredUserId],
  );
  if (!refs.rows.length) return { success: false, reason: 'not_found' };

  const reversed = [];
  for (const ref of refs.rows) {
    const events = await query(
      `SELECT * FROM referral_reward_events
       WHERE referral_id = $1 AND status = 'GRANTED'
       ORDER BY created_at ASC`,
      [ref.id],
    );
    for (const ev of events.rows) {
      try {
        await withTransaction(async (client) => {
          const locked = await client.query(
            `SELECT * FROM referral_reward_events WHERE id = $1 FOR UPDATE`,
            [ev.id],
          );
          if (!locked.rows[0] || locked.rows[0].status !== 'GRANTED') return;

          const wallet = await client.query(
            `SELECT wallet_id, COALESCE(bonus_balance,0) AS bonus_balance,
                    COALESCE(freebet_balance,0) AS freebet_balance
             FROM wallets WHERE user_id = $1 FOR UPDATE`,
            [ev.beneficiary_user_id],
          );
          if (!wallet.rows[0]) return;
          const amt = Number(ev.amount) || 0;
          const isBonus = String(ev.reward_type || '').includes('BONUS');
          const field = isBonus ? 'bonus_balance' : 'freebet_balance';
          const current = Number(wallet.rows[0][field] || 0);
          const next = Math.max(0, Math.round((current - amt) * 100) / 100);
          await client.query(
            `UPDATE wallets SET ${field} = $1, updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
            [next, wallet.rows[0].wallet_id],
          );
          const txId = `tx_ref_claw_${crypto.randomBytes(10).toString('hex')}`;
          await client.query(
            `INSERT INTO transactions (transaction_id, user_id, type, method, amount, status)
             VALUES ($1, $2, 'BONUS_CLAWBACK', 'REFERRAL', $3, 'COMPLETED')`,
            [txId, ev.beneficiary_user_id, amt],
          );
          await client.query(
            `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
             VALUES ($1, $2, 'DEBIT', $3, $4, $5)`,
            [wallet.rows[0].wallet_id, txId, amt, next, `Referral clawback · ${reason} · ${ref.id}`],
          );
          await client.query(
            `UPDATE referral_reward_events SET status = 'REVERSED' WHERE id = $1`,
            [ev.id],
          );
          reversed.push({ eventId: ev.id, amount: amt, userId: ev.beneficiary_user_id });
        });
      } catch (err) {
        logger.warn('referral_clawback_event_failed', { eventId: ev.id, error: err.message });
      }
    }
    await query(
      `UPDATE referrals
       SET status = 'REJECTED', reward_status = 'FAILED',
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
             'clawbackReason', $2::text, 'clawbackBy', $3::text, 'clawbackAt', NOW()::text
           ),
           updated_at = NOW()
       WHERE id = $1`,
      [ref.id, reason, adminId],
    );
  }

  try {
    const { logAdminAction } = await import('../server/middleware/auditLogger.js');
    await logAdminAction({
      actorId: adminId,
      targetId: referredUserId || refs.rows[0]?.referred_user_id,
      action: 'REFERRAL_CLAWBACK',
      details: { referralId, referredUserId, reason, reversedCount: reversed.length },
    });
  } catch { /* ignore */ }

  return { success: true, reversed, count: reversed.length };
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
