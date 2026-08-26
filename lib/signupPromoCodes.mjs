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
    maxRedemptions: row.max_redemptions == null ? null : Number(row.max_redemptions),
    maxPerUser: row.max_per_user == null ? null : Number(row.max_per_user),
    redemptionCount: Number(row.redemption_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSignupPromoCodes() {
  const res = await query(
    `SELECT * FROM signup_promo_codes ORDER BY created_at DESC`,
  );
  return (res.rows || []).map(mapCodeRow);
}

export async function createSignupPromoCode({
  code,
  name,
  rewardType,
  amount,
  isActive = false,
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
    const res = await query(
      `INSERT INTO signup_promo_codes
         (code_id, code, name, reward_type, amount, is_active, max_redemptions, max_per_user, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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

  // Referral accounts cannot claim initial signup / welcome promos
  const { assertNoReferralPromoConflict } = await import('./referralLoyaltyEngine.mjs');
  await assertNoReferralPromoConflict(userId, (text, params) => client.query(text, params));

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

  if (rewardType === 'cash') {
    await client.query(
      `UPDATE wallets SET balance = GREATEST(0.00, balance - $1), updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
      [amount, wallet.wallet_id],
    );
  } else if (rewardType === 'freebet') {
    await client.query(
      `UPDATE wallets SET freebet_balance = GREATEST(0.00, COALESCE(freebet_balance, 0) - $1), updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
      [amount, wallet.wallet_id],
    );
  } else {
    await client.query(
      `UPDATE wallets SET bonus_balance = GREATEST(0.00, bonus_balance - $1), updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
      [amount, wallet.wallet_id],
    );
  }

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

export { mapCodeRow };
