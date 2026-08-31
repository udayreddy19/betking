import crypto from 'crypto';
import { query, withTransaction } from '../db/pg.js';
import { getVerifiedIdentity, assertIdentityHasNotClaimedPromo } from './userIdentity.mjs';
import {
  EXCLUSIVE_SIGNUP_PROMO_CODES,
  isExclusiveSignupPromo,
} from './exclusiveSignupPromos.mjs';

export const SIGNUP_REWARD_TYPES = ['bonus', 'freebet', 'cash'];
export { EXCLUSIVE_SIGNUP_PROMO_CODES, isExclusiveSignupPromo };

export function normalizePromoCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 32);
}

function parsePositiveCap(value, { emptyValue = null, field = 'Limit' } = {}) {
  if (value === '' || value == null) return emptyValue;
  const cap = Number(value);
  if (!Number.isInteger(cap) || cap <= 0) {
    throw Object.assign(new Error(`${field} must be a positive whole number.`), {
      code: 'INVALID_CAP',
      status: 400,
    });
  }
  return cap;
}

export function hasReachedPerUserLimit(usedByUser, maxPerUser) {
  if (maxPerUser == null) return false;
  return Number(usedByUser) >= Number(maxPerUser);
}

function mapCodeRow(row) {
  if (!row) return null;
  return {
    id: row.code_id,
    code: row.code,
    name: row.name,
    rewardType: row.reward_type,
    amount: Number(row.amount),
    isActive: !!row.is_active,
    inviteOnly: !!row.is_invite_only,
    maxRedemptions: row.max_redemptions == null ? null : Number(row.max_redemptions),
    maxPerUser: row.max_per_user == null ? null : Number(row.max_per_user),
    redemptionCount: Number(row.redemption_count || 0),
    inviteCount: row.invite_count == null ? undefined : Number(row.invite_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeInviteEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

export async function listSignupPromoCodes() {
  const res = await query(
    `SELECT c.*,
            (SELECT COUNT(*)::int FROM signup_promo_invites i WHERE i.code_id = c.code_id) AS invite_count
     FROM signup_promo_codes c
     ORDER BY c.created_at DESC`,
  );
  return (res.rows || []).map(mapCodeRow);
}

export async function createSignupPromoCode({
  code,
  name,
  rewardType,
  amount,
  isActive = false,
  inviteOnly = false,
  maxRedemptions = null,
  maxPerUser = 1,
  createdBy = null,
}) {
  const normalized = normalizePromoCode(code);
  if (normalized.length < 3) {
    throw Object.assign(new Error('Code must be at least 3 letters or numbers.'), {
      code: 'INVALID_CODE',
      status: 400,
    });
  }
  const type = String(rewardType || '').toLowerCase();
  if (!SIGNUP_REWARD_TYPES.includes(type)) {
    throw Object.assign(new Error('Reward type must be bonus, freebet, or cash.'), {
      code: 'INVALID_REWARD_TYPE',
      status: 400,
    });
  }
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw Object.assign(new Error('Amount must be greater than 0.'), {
      code: 'INVALID_AMOUNT',
      status: 400,
    });
  }
  const cap = parsePositiveCap(maxRedemptions, {
    emptyValue: null,
    field: 'Max claims',
  });
  const perUser = parsePositiveCap(maxPerUser, {
    emptyValue: 1,
    field: 'Max per user',
  });

  const id = `spc_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  try {
    await query(`ALTER TABLE signup_promo_codes ADD COLUMN IF NOT EXISTS is_invite_only BOOLEAN NOT NULL DEFAULT FALSE`).catch(() => null);
    const res = await query(
      `INSERT INTO signup_promo_codes
         (code_id, code, name, reward_type, amount, is_active, max_redemptions, max_per_user, created_by, is_invite_only)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        id,
        normalized,
        String(name || normalized).trim().slice(0, 128),
        type,
        value.toFixed(2),
        !!isActive,
        cap,
        perUser,
        createdBy,
        !!inviteOnly,
      ],
    );
    return mapCodeRow(res.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      throw Object.assign(new Error('That promo code already exists.'), {
        code: 'CODE_EXISTS',
        status: 409,
      });
    }
    throw err;
  }
}

export async function toggleSignupPromoCode(codeId, isActive) {
  const res = await query(
    `UPDATE signup_promo_codes
     SET is_active = $2, updated_at = CURRENT_TIMESTAMP
     WHERE code_id = $1
     RETURNING *`,
    [codeId, !!isActive],
  );
  if (res.rows.length === 0) {
    throw Object.assign(new Error('Promo code not found.'), {
      code: 'CODE_NOT_FOUND',
      status: 404,
    });
  }
  return mapCodeRow(res.rows[0]);
}

/**
 * Credit a signup promo inside an open DB transaction (client from withTransaction).
 * No-op if promoCode is empty. Throws if the code is invalid/inactive/exhausted.
 */
export async function applySignupPromoInTransaction(client, { userId, promoCode }) {
  const normalized = normalizePromoCode(promoCode);
  if (!normalized) return null;
  if (normalized.length < 3) {
    throw Object.assign(new Error('Promo code is not valid.'), {
      code: 'PROMO_INVALID',
      status: 400,
    });
  }

  // Referral accounts cannot claim initial signup / welcome promos (row-lock for race safety)
  const { assertNoReferralPromoConflict } = await import('./referralLoyaltyEngine.mjs');
  await assertNoReferralPromoConflict(
    userId,
    (text, params) => client.query(text, params),
    { forUpdate: true },
  );

  const codeRes = await client.query(
    `SELECT * FROM signup_promo_codes WHERE code = $1 FOR UPDATE`,
    [normalized],
  );
  if (codeRes.rows.length === 0) {
    const depositPromo = await client.query(
      `SELECT code, type FROM promotions WHERE code = $1 AND status = 'ACTIVE' LIMIT 1`,
      [normalized],
    );
    if (depositPromo.rows.length > 0) {
      return {
        deferred: true,
        code: normalized,
        claimType: 'deposit_bonus',
        rewardType: String(depositPromo.rows[0].type || '').toLowerCase().includes('free') ? 'freebet' : 'bonus',
      };
    }
    throw Object.assign(new Error('Promo code is not valid.'), {
      code: 'PROMO_INVALID',
      status: 400,
    });
  }
  const row = codeRes.rows[0];
  if (!row.is_active) {
    throw Object.assign(new Error('This promo code is not active.'), {
      code: 'PROMO_INACTIVE',
      status: 400,
    });
  }

  if (row.is_invite_only) {
    const userEmailRes = await client.query(
      `SELECT LOWER(TRIM(email)) AS email FROM users WHERE user_id = $1`,
      [userId],
    );
    const email = userEmailRes.rows[0]?.email || '';
    if (!email) {
      throw Object.assign(new Error('This promo code is invite-only and your account has no email.'), {
        code: 'PROMO_INVITE_REQUIRED',
        status: 403,
      });
    }
    const invited = await client.query(
      `SELECT invite_id FROM signup_promo_invites
       WHERE code_id = $1 AND email_normalized = $2
       LIMIT 1`,
      [row.code_id, email],
    );
    if (!invited.rows[0]) {
      throw Object.assign(new Error('This promo code is private. Only invited players can redeem it.'), {
        code: 'PROMO_INVITE_REQUIRED',
        status: 403,
      });
    }
  }

  const max = row.max_redemptions == null ? null : Number(row.max_redemptions);
  const used = Number(row.redemption_count || 0);
  if (max != null && used >= max) {
    throw Object.assign(new Error('This promo code has reached its claim limit.'), {
      code: 'PROMO_EXHAUSTED',
      status: 400,
    });
  }

  const maxPerUser = row.max_per_user == null ? null : Number(row.max_per_user);
  const usedByUserRes = await client.query(
    `SELECT COUNT(*)::int AS used
     FROM signup_promo_redemptions
     WHERE user_id = $1 AND code_id = $2 AND revoked_at IS NULL`,
    [userId, row.code_id],
  );
  const usedByUser = Number(usedByUserRes.rows[0]?.used || 0);
  if (hasReachedPerUserLimit(usedByUser, maxPerUser)) {
    throw Object.assign(
      new Error(
        maxPerUser === 1
          ? 'You have already claimed this promo code.'
          : `You have already claimed this code ${maxPerUser} times.`,
      ),
      { code: 'PROMO_USER_LIMIT', status: 400 },
    );
  }

  const identity = await getVerifiedIdentity(userId, client);

  if (isExclusiveSignupPromo(row.code)) {
    const exclusiveRes = await client.query(
      `SELECT spc.code
       FROM signup_promo_redemptions spr
       JOIN signup_promo_codes spc ON spc.code_id = spr.code_id
       WHERE spr.revoked_at IS NULL
         AND UPPER(spc.code) = ANY($1::text[])
         AND (
           spr.user_id = $2
           OR ($3::text IS NOT NULL AND spr.pan_hash = $3)
           OR ($4::text IS NOT NULL AND spr.aadhaar_hash = $4)
         )
       LIMIT 1`,
      [
        [...EXCLUSIVE_SIGNUP_PROMO_CODES],
        userId,
        identity?.panHash || null,
        identity?.aadhaarHash || null,
      ],
    );
    if (exclusiveRes.rows.length > 0) {
      const used = String(exclusiveRes.rows[0].code || '').toUpperCase();
      throw Object.assign(
        new Error(
          used === String(row.code).toUpperCase()
            ? 'You have already claimed this promo code.'
            : `You already claimed ${used}. Only one of SPORTS500, VIP1000, or LIVE100 can be used.`,
        ),
        { code: 'PROMO_EXCLUSIVE_USED', status: 400, claimedCode: used },
      );
    }
  }

  if (identity) {
    await assertIdentityHasNotClaimedPromo({
      exec: client,
      codeId: row.code_id,
      panHash: identity.panHash,
      aadhaarHash: identity.aadhaarHash,
      excludeUserId: userId,
    });
  }

  // Abuse evaluation before any wallet/ledger credit (additive; preserves exclusivity above)
  {
    const { assertPromoAbuseAllowsClaim } = await import('./promotionAbuseEngine.mjs');
    await assertPromoAbuseAllowsClaim(userId, {
      promoCode: row.code,
      exec: client.query.bind(client),
      context: 'signup_promo',
    });
  }

  const walletRes = await client.query(
    `SELECT wallet_id, balance, bonus_balance, COALESCE(freebet_balance, 0) AS freebet_balance
     FROM wallets WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  if (walletRes.rows.length === 0) {
    throw Object.assign(new Error('Wallet not found for promo credit.'), {
      code: 'WALLET_NOT_FOUND',
      status: 400,
    });
  }
  const wallet = walletRes.rows[0];
  const amount = Number(row.amount);
  const rewardType = row.reward_type;
  const txId = `tx_sp_${crypto.randomBytes(16).toString('hex')}`;
  const redemptionId = `spr_${crypto.randomBytes(16).toString('hex')}`;
  let nextBalance = Number(wallet.balance || 0);
  let nextBonus = Number(wallet.bonus_balance || 0);
  let nextFreebet = Number(wallet.freebet_balance || 0);

  await client.query(
    `INSERT INTO transactions (transaction_id, user_id, type, method, amount, status)
     VALUES ($1, $2, 'BONUS_CLAIM', 'SIGNUP_PROMO', $3, 'COMPLETED')`,
    [txId, userId, amount],
  );

  if (rewardType === 'cash') {
    nextBalance += amount;
    await client.query(
      `UPDATE wallets SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
      [nextBalance, wallet.wallet_id],
    );
    await client.query(
      `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'CREDIT', $3, $4, $5)`,
      [wallet.wallet_id, txId, amount, nextBalance, `Signup promo ${row.code} · cash`],
    );
  } else if (rewardType === 'freebet') {
    nextFreebet += amount;
    await client.query(
      `UPDATE wallets SET freebet_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
      [nextFreebet, wallet.wallet_id],
    );
    await client.query(
      `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'CREDIT', $3, $4, $5)`,
      [wallet.wallet_id, txId, amount, nextFreebet, `Signup promo ${row.code} · freebet`],
    );
  } else {
    nextBonus += amount;
    await client.query(
      `UPDATE wallets SET bonus_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
      [nextBonus, wallet.wallet_id],
    );
    await client.query(
      `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'CREDIT', $3, $4, $5)`,
      [wallet.wallet_id, txId, amount, nextBonus, `Signup promo ${row.code} · bonus`],
    );
  }

  await client.query(
    `INSERT INTO signup_promo_redemptions (
       redemption_id, code_id, user_id, reward_type, amount, pan_hash, aadhaar_hash
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      redemptionId,
      row.code_id,
      userId,
      rewardType,
      amount,
      identity?.panHash || null,
      identity?.aadhaarHash || null,
    ],
  );
  await client.query(
    `UPDATE signup_promo_codes
     SET redemption_count = redemption_count + 1, updated_at = CURRENT_TIMESTAMP
     WHERE code_id = $1`,
    [row.code_id],
  );

  return {
    code: row.code,
    name: row.name,
    rewardType,
    amount,
    wallet: {
      balance: nextBalance,
      bonusBalance: nextBonus,
      freebetBalance: nextFreebet,
    },
  };
}

export async function claimSignupPromo(userId, promoCode) {
  if (!userId) {
    throw Object.assign(new Error('Please log in to claim a promo code.'), {
      code: 'AUTH_REQUIRED',
      status: 401,
    });
  }
  const normalized = normalizePromoCode(promoCode);
  if (!normalized) {
    throw Object.assign(new Error('Enter a promo code.'), {
      code: 'PROMO_REQUIRED',
      status: 400,
    });
  }
  return withTransaction((client) => applySignupPromoInTransaction(client, { userId, promoCode: normalized }));
}

export async function listUserSignupPromoClaims(userId) {
  if (!userId) return [];
  const res = await query(
    `SELECT spc.code, spr.reward_type AS "rewardType", spr.amount, spr.created_at AS "claimedAt"
     FROM signup_promo_redemptions spr
     JOIN signup_promo_codes spc ON spc.code_id = spr.code_id
     WHERE spr.user_id = $1 AND spr.revoked_at IS NULL
     ORDER BY spr.created_at DESC`,
    [userId],
  );
  return (res.rows || []).map((row) => ({
    code: String(row.code || '').toUpperCase(),
    rewardType: row.rewardType,
    amount: Number(row.amount || 0),
    claimedAt: row.claimedAt,
    exclusive: isExclusiveSignupPromo(row.code),
  }));
}

export async function revokeSignupRedemption(client, redemption) {
  if (!redemption || redemption.revoked_at) return false;

  const walletRes = await client.query(
    `SELECT wallet_id, balance, bonus_balance, COALESCE(freebet_balance, 0) AS freebet_balance
     FROM wallets WHERE user_id = $1 FOR UPDATE`,
    [redemption.user_id],
  );
  if (walletRes.rows.length === 0) return false;
  const wallet = walletRes.rows[0];
  const amount = Number(redemption.amount || 0);
  const rewardType = redemption.reward_type;

  const txId = `tx_promo_rev_${redemption.redemption_id}`;
  let ledgerAfter = Number(wallet.balance || 0);

  if (rewardType === 'cash') {
    const curBal = Number(wallet.balance || 0);
    ledgerAfter = Number(Math.max(0.00, curBal - amount).toFixed(2));
    await client.query(
      `UPDATE wallets SET balance = GREATEST(0.00, balance - $1), updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
      [amount, wallet.wallet_id],
    );
  } else if (rewardType === 'freebet') {
    const curFb = Number(wallet.freebet_balance || 0);
    ledgerAfter = Number(Math.max(0.00, curFb - amount).toFixed(2));
    await client.query(
      `UPDATE wallets SET freebet_balance = GREATEST(0.00, COALESCE(freebet_balance, 0) - $1), updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
      [amount, wallet.wallet_id],
    );
  } else {
    const curBn = Number(wallet.bonus_balance || 0);
    ledgerAfter = Number(Math.max(0.00, curBn - amount).toFixed(2));
    await client.query(
      `UPDATE wallets SET bonus_balance = GREATEST(0.00, bonus_balance - $1), updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
      [amount, wallet.wallet_id],
    );
  }

  await client.query(
    `INSERT INTO transactions (transaction_id, user_id, type, method, amount, status, created_at)
     VALUES ($1, $2, 'PROMO_REVOKED', 'SIGNUP_PROMO', $3, 'SUCCESS', NOW())
     ON CONFLICT (transaction_id) DO NOTHING`,
    [txId, redemption.user_id, amount],
  );

  await client.query(
    `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
     VALUES ($1, $2, 'DEBIT', $3, $4, $5, NOW())`,
    [wallet.wallet_id, txId, amount, ledgerAfter, `Revoked signup promo redemption #${redemption.redemption_id}`],
  );

  await client.query(
    `UPDATE signup_promo_redemptions SET revoked_at = CURRENT_TIMESTAMP WHERE redemption_id = $1`,
    [redemption.redemption_id],
  );
  await client.query(
    `UPDATE signup_promo_codes
     SET redemption_count = GREATEST(0, redemption_count - 1), updated_at = CURRENT_TIMESTAMP
     WHERE code_id = $1`,
    [redemption.code_id],
  );
  return true;
}

export async function revokeSignupPromoRedemption({ redemptionId, adminId = null, reason = '' }) {
  if (!redemptionId) throw new Error('redemptionId is required');
  return withTransaction(async (client) => {
    const rRes = await client.query(
      `SELECT * FROM signup_promo_redemptions WHERE redemption_id = $1 FOR UPDATE`,
      [redemptionId],
    );
    if (rRes.rows.length === 0) {
      throw new Error(`Redemption #${redemptionId} not found`);
    }
    const redemption = rRes.rows[0];
    if (redemption.revoked_at) {
      return { success: true, alreadyRevoked: true, redemptionId };
    }
    const res = await revokeSignupRedemption(client, redemption);
    return { success: res, redemptionId, revokedBy: adminId, reason };
  });
}

export async function bindPromoIdentityOnKycVerify(userId, exec) {
  const identity = await getVerifiedIdentity(userId, exec);
  if (!identity) return { bound: 0, revoked: 0 };

  const run = typeof exec === 'function' ? exec : exec?.query?.bind(exec) || query;
  const redemptions = await run(
    `SELECT * FROM signup_promo_redemptions WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );

  let bound = 0;
  let revoked = 0;
  const inTx = async (fn) => {
    if (exec && typeof exec !== 'function' && exec.query) return fn(exec);
    return withTransaction(fn);
  };

  for (const row of redemptions.rows) {
    const codeRes = await run(
      `SELECT code FROM signup_promo_codes WHERE code_id = $1`,
      [row.code_id],
    );
    const code = codeRes.rows[0]?.code;
    try {
      if (isExclusiveSignupPromo(code)) {
        const exclusiveDup = await run(
          `SELECT spr.redemption_id
           FROM signup_promo_redemptions spr
           JOIN signup_promo_codes spc ON spc.code_id = spr.code_id
           WHERE spr.revoked_at IS NULL
             AND UPPER(spc.code) = ANY($1::text[])
             AND spr.redemption_id <> $2
             AND (
               ($3::text IS NOT NULL AND spr.pan_hash = $3)
               OR ($4::text IS NOT NULL AND spr.aadhaar_hash = $4)
             )
           LIMIT 1`,
          [[...EXCLUSIVE_SIGNUP_PROMO_CODES], row.redemption_id, identity.panHash, identity.aadhaarHash],
        );
        if (exclusiveDup.rows.length > 0) {
          throw Object.assign(new Error('PROMO_IDENTITY_USED'), { code: 'PROMO_IDENTITY_USED' });
        }
      }
      await assertIdentityHasNotClaimedPromo({
        exec: run,
        codeId: row.code_id,
        panHash: identity.panHash,
        aadhaarHash: identity.aadhaarHash,
        excludeUserId: userId,
      });
      await run(
        `UPDATE signup_promo_redemptions
         SET pan_hash = $1, aadhaar_hash = $2
         WHERE redemption_id = $3 AND revoked_at IS NULL`,
        [identity.panHash, identity.aadhaarHash, row.redemption_id],
      );
      bound += 1;
    } catch (err) {
      if (err.code !== 'PROMO_IDENTITY_USED') throw err;
      await inTx((client) => revokeSignupRedemption(client, row));
      revoked += 1;
    }
  }

  const bonuses = await run(
    `SELECT * FROM user_bonuses
     WHERE user_id = $1 AND status IN ('ACTIVE', 'COMPLETED', 'RELEASED')`,
    [userId],
  );
  for (const bonus of bonuses.rows) {
    try {
      await assertIdentityHasNotClaimedPromo({
        exec: run,
        promotionId: bonus.promotion_id,
        panHash: identity.panHash,
        aadhaarHash: identity.aadhaarHash,
        excludeUserId: userId,
      });
      await run(
        `UPDATE user_bonuses SET pan_hash = $1, aadhaar_hash = $2 WHERE id = $3`,
        [identity.panHash, identity.aadhaarHash, bonus.id],
      );
      bound += 1;
    } catch (err) {
      if (err.code !== 'PROMO_IDENTITY_USED') throw err;
      await run(
        `UPDATE user_bonuses SET status = 'REVOKED' WHERE id = $1`,
        [bonus.id],
      );
      await run(
        `UPDATE wallets
         SET bonus_balance = GREATEST(0.00, bonus_balance - $1), updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2`,
        [bonus.bonus_amount, userId],
      );
      revoked += 1;
    }
  }

  return { bound, revoked };
}

/**
 * Invite selected emails to an invite-only (or any) promo code.
 * Adds allowlist rows and emails from promos@oddsyra.com.
 * Does not grant the reward — user must still claim the code.
 */
export async function sendSignupPromoInvites({
  codeId,
  emails = [],
  adminId = null,
} = {}) {
  await query(`ALTER TABLE signup_promo_codes ADD COLUMN IF NOT EXISTS is_invite_only BOOLEAN NOT NULL DEFAULT FALSE`).catch(() => null);
  await query(`
    CREATE TABLE IF NOT EXISTS signup_promo_invites (
      invite_id VARCHAR(64) PRIMARY KEY,
      code_id VARCHAR(64) NOT NULL REFERENCES signup_promo_codes(code_id) ON DELETE CASCADE,
      email_normalized VARCHAR(255) NOT NULL,
      user_id VARCHAR(64) REFERENCES users(user_id) ON DELETE SET NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_by VARCHAR(64),
      provider_message_id VARCHAR(128),
      status VARCHAR(16) NOT NULL DEFAULT 'SENT',
      failure_reason TEXT,
      UNIQUE (code_id, email_normalized)
    )
  `).catch(() => null);

  const codeRes = await query(`SELECT * FROM signup_promo_codes WHERE code_id = $1`, [codeId]);
  const promo = codeRes.rows[0];
  if (!promo) {
    throw Object.assign(new Error('Promo code not found.'), { code: 'CODE_NOT_FOUND', status: 404 });
  }
  if (!promo.is_active) {
    throw Object.assign(new Error('Enable the promo code before sending invites.'), {
      code: 'PROMO_INACTIVE',
      status: 400,
    });
  }

  const uniqueEmails = [...new Set(
    (Array.isArray(emails) ? emails : String(emails || '').split(/[\s,;]+/))
      .map(normalizeInviteEmail)
      .filter((e) => e && e.includes('@')),
  )].slice(0, 200);

  if (uniqueEmails.length === 0) {
    throw Object.assign(new Error('Enter at least one valid email address.'), {
      code: 'EMAILS_REQUIRED',
      status: 400,
    });
  }

  const { sendPromoCodeInviteEmail } = await import('../server/auth/emailService.js');
  const results = [];

  for (const email of uniqueEmails) {
    const userRes = await query(
      `SELECT user_id, first_name FROM users WHERE LOWER(TRIM(email)) = $1 LIMIT 1`,
      [email],
    );
    const userId = userRes.rows[0]?.user_id || null;
    const name = userRes.rows[0]?.first_name || null;
    const inviteId = `spi_${crypto.randomBytes(10).toString('hex')}`;

    if (userId) {
      try {
        const { canSendPromotionalEmail } = await import('./notificationPreferencesEngine.mjs');
        const allowed = await canSendPromotionalEmail(userId);
        if (!allowed) {
          await query(
            `INSERT INTO signup_promo_invites (
               invite_id, code_id, email_normalized, user_id, sent_at, sent_by,
               provider_message_id, status, failure_reason
             ) VALUES ($1,$2,$3,$4,NOW(),$5,NULL,'SKIPPED','marketing_opt_out')
             ON CONFLICT (code_id, email_normalized) DO UPDATE SET
               status = 'SKIPPED',
               failure_reason = 'marketing_opt_out',
               sent_at = NOW(),
               sent_by = EXCLUDED.sent_by`,
            [inviteId, promo.code_id, email, userId, adminId],
          ).catch(() => null);
          results.push({
            email,
            success: false,
            skipped: true,
            error: 'marketing_opt_out',
            messageId: null,
          });
          continue;
        }
      } catch { /* preference lookup failure → proceed */ }
    }

    const sendResult = await sendPromoCodeInviteEmail({
      email,
      name,
      promoCode: promo.code,
      promoName: promo.name,
      rewardType: promo.reward_type,
      amount: promo.amount,
    });

    await query(
      `INSERT INTO signup_promo_invites (
         invite_id, code_id, email_normalized, user_id, sent_at, sent_by,
         provider_message_id, status, failure_reason
       ) VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,$8)
       ON CONFLICT (code_id, email_normalized) DO UPDATE SET
         sent_at = NOW(),
         sent_by = EXCLUDED.sent_by,
         user_id = COALESCE(EXCLUDED.user_id, signup_promo_invites.user_id),
         provider_message_id = COALESCE(EXCLUDED.provider_message_id, signup_promo_invites.provider_message_id),
         status = EXCLUDED.status,
         failure_reason = EXCLUDED.failure_reason`,
      [
        inviteId,
        promo.code_id,
        email,
        userId,
        adminId,
        sendResult.messageId || null,
        sendResult.success ? 'SENT' : 'FAILED',
        sendResult.error || null,
      ],
    );

    results.push({
      email,
      success: !!sendResult.success,
      error: sendResult.error || null,
      messageId: sendResult.messageId || null,
    });
  }

  return {
    code: promo.code,
    inviteOnly: !!promo.is_invite_only,
    sent: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

export { mapCodeRow };
