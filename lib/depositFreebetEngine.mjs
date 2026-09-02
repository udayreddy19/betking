/**
 * Deposit → Free Bet campaign.
 * Extends `promotions` (FREE_BET + auto_grant_on_deposit) and credits wallets.freebet_balance.
 * Settlement: existing freebet profit-only rules (wageringRules.splitBetWinPayout) — not reinvented.
 */

import crypto from 'crypto';
import { query, withTransaction } from '../db/pg.js';
import { addColumnIfMissing, createTableIfMissing, memoizeEnsure } from './schemaGuard.mjs';
import { logger } from './logger.mjs';

export const DEPOSIT_FREEBET_CODE = 'DEPOSIT_MATCH_FREEBET';

function grantId() {
  return `dfb_${crypto.randomBytes(12).toString('hex')}`;
}

function emailLogId() {
  return `dfe_${crypto.randomBytes(10).toString('hex')}`;
}

function asNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clampConfig(input = {}) {
  const name = String(input.name || 'Deposit 100% Free Bet').trim().slice(0, 128) || 'Deposit 100% Free Bet';
  const enabled = Boolean(input.enabled ?? input.isActive ?? false);
  const minDeposit = Math.max(0, asNum(input.minDeposit, 10000));
  const matchPercent = Math.min(500, Math.max(0, asNum(input.matchPercent, 100)));
  const maxFreeBet = Math.max(0, asNum(input.maxFreeBet, 10000));
  const maxEligibleDeposit = input.maxEligibleDeposit == null || input.maxEligibleDeposit === ''
    ? null
    : Math.max(0, asNum(input.maxEligibleDeposit, maxFreeBet));
  const eligibility = ['NEW', 'EXISTING', 'ALL'].includes(String(input.eligibility || '').toUpperCase())
    ? String(input.eligibility).toUpperCase()
    : 'ALL';
  const onePerUser = input.onePerUser !== false;
  const emailOnGrant = input.emailOnGrant !== false;
  const freebetExpiryDays = Math.min(365, Math.max(1, Math.floor(asNum(input.freebetExpiryDays, 7))));
  const splitEnabled = Boolean(input.splitEnabled) || asNum(input.splitParts, 1) > 1;
  const splitParts = splitEnabled
    ? Math.min(50, Math.max(2, Math.floor(asNum(input.splitParts, 10))))
    : 1;
  const splitEachRaw = Number(input.splitEach);
  const splitEach = splitEnabled && Number.isFinite(splitEachRaw) && splitEachRaw > 0
    ? Number(splitEachRaw.toFixed(2))
    : null;
  if (splitEnabled && !(splitEach > 0)) {
    throw Object.assign(new Error('Pack needs an amount for each stake'), {
      code: 'INVALID_SPLIT_EACH',
      status: 400,
    });
  }
  const startsAt = input.startsAt ? new Date(input.startsAt) : null;
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (startsAt && Number.isNaN(startsAt.getTime())) {
    throw Object.assign(new Error('Invalid start date'), { code: 'INVALID_START', status: 400 });
  }
  if (endsAt && Number.isNaN(endsAt.getTime())) {
    throw Object.assign(new Error('Invalid end date'), { code: 'INVALID_END', status: 400 });
  }
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw Object.assign(new Error('End date must be after start date'), { code: 'INVALID_WINDOW', status: 400 });
  }
  if (matchPercent <= 0) {
    throw Object.assign(new Error('Free bet % must be greater than 0'), { code: 'INVALID_PERCENT', status: 400 });
  }
  if (maxFreeBet <= 0) {
    throw Object.assign(new Error('Maximum free bet must be greater than 0'), { code: 'INVALID_MAX', status: 400 });
  }
  return {
    name,
    enabled,
    minDeposit,
    matchPercent,
    maxFreeBet,
    maxEligibleDeposit,
    eligibility,
    onePerUser,
    emailOnGrant,
    freebetExpiryDays,
    splitParts,
    splitEach,
    startsAt: startsAt ? startsAt.toISOString() : null,
    endsAt: endsAt ? endsAt.toISOString() : null,
  };
}

export function calculateDepositFreebetAmount({
  depositAmount,
  matchPercent,
  maxFreeBet,
  maxEligibleDeposit = null,
  minDeposit = 0,
} = {}) {
  const deposit = asNum(depositAmount);
  const minDep = asNum(minDeposit);
  if (deposit < minDep) {
    return { eligible: false, amount: 0, reason: 'MINIMUM_DEPOSIT_NOT_MET' };
  }
  const cappedDeposit = maxEligibleDeposit != null && asNum(maxEligibleDeposit) > 0
    ? Math.min(deposit, asNum(maxEligibleDeposit))
    : deposit;
  const raw = cappedDeposit * (asNum(matchPercent) / 100);
  const amount = Number(Math.min(raw, asNum(maxFreeBet)).toFixed(2));
  if (amount <= 0) {
    return { eligible: false, amount: 0, reason: 'REWARD_ZERO' };
  }
  return { eligible: true, amount, reason: null, cappedDeposit };
}

/** Lifecycle display status. Grants still require stored status === 'ACTIVE' only. */
export function resolveCampaignLifecycleStatus(row) {
  const raw = String(row?.status || '').toUpperCase();
  if (raw === 'DELETED') return 'DELETED';
  if (raw === 'COMPLETED' || raw === 'CLOSED') return 'COMPLETED';
  if (raw === 'PAUSED') return 'PAUSED';
  if (raw === 'DRAFT') return 'DRAFT';
  if (raw === 'SCHEDULED') return 'SCHEDULED';
  const endsAt = row?.expires_at ? new Date(row.expires_at) : null;
  if (endsAt && !Number.isNaN(endsAt.getTime()) && endsAt.getTime() < Date.now()) {
    return 'EXPIRED';
  }
  if (raw === 'ACTIVE') {
    const startsAt = row?.starts_at ? new Date(row.starts_at) : null;
    if (startsAt && !Number.isNaN(startsAt.getTime()) && startsAt.getTime() > Date.now()) {
      return 'SCHEDULED';
    }
    return 'ACTIVE';
  }
  return raw || 'DRAFT';
}

function parseVipTiers(raw) {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((t) => String(t || '').trim().toUpperCase()).filter(Boolean))];
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parseVipTiers(parsed);
    } catch {
      return [...new Set(raw.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean))];
    }
  }
  return [];
}

function mapCampaignRow(row) {
  if (!row) return null;
  const lifecycleStatus = resolveCampaignLifecycleStatus(row);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    enabled: String(row.status || '').toUpperCase() === 'ACTIVE',
    status: row.status,
    lifecycleStatus,
    minDeposit: asNum(row.min_stake),
    matchPercent: asNum(row.match_percent, 100),
    maxFreeBet: asNum(row.max_reward),
    maxEligibleDeposit: row.max_eligible_deposit == null ? null : asNum(row.max_eligible_deposit),
    eligibility: String(row.eligibility || 'ALL').toUpperCase(),
    onePerUser: Number(row.per_user_limit || 1) <= 1,
    emailOnGrant: row.email_on_grant !== false,
    freebetExpiryDays: Math.max(1, Number(row.freebet_expiry_days || 7)),
    splitParts: Math.max(1, Number(row.split_parts || 1)),
    splitEach: row.split_each == null || row.split_each === '' ? null : asNum(row.split_each),
    startsAt: row.starts_at || null,
    endsAt: row.expires_at || null,
    usedBudget: asNum(row.used_budget),
    budget: asNum(row.budget),
    rewardBucket: row.reward_bucket || 'freebet',
    autoGrantOnDeposit: row.auto_grant_on_deposit !== false,
    audienceSegmentId: row.audience_segment_id || null,
    audienceVipTiers: parseVipTiers(row.audience_vip_tiers),
    audienceExcludeSegmentIds: parseExcludeSegmentIds(row.audience_exclude_segment_ids),
    updatedAt: row.updated_at || null,
  };
}

function parseExcludeSegmentIds(raw) {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 50);
  }
  if (typeof raw === 'string') {
    try {
      return parseExcludeSegmentIds(JSON.parse(raw));
    } catch {
      return raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
    }
  }
  return [];
}

export async function ensureDepositFreebetCampaign() {
  await ensureSplitPartsColumn();
  const existing = await query(
    `SELECT * FROM promotions WHERE code = $1 LIMIT 1`,
    [DEPOSIT_FREEBET_CODE],
  );
  if (existing.rows[0]) return mapCampaignRow(existing.rows[0]);

  await query(
    `INSERT INTO promotions (
       id, name, code, type, status, budget, used_budget, max_reward, per_user_limit,
       min_odds, min_stake, wagering_multiplier, match_percent, expires_at,
       starts_at, reward_bucket, auto_grant_on_deposit, eligibility,
       email_on_grant, freebet_expiry_days, max_eligible_deposit, updated_at
     ) VALUES (
       $1, 'Deposit 100% Free Bet', $2, 'FREE_BET', 'PAUSED',
       10000000.00, 0.00, 10000.00, 1,
       1.00, 10000.00, 0.00, 100.00, NULL,
       NULL, 'freebet', true, 'ALL',
       true, 7, 10000.00, NOW()
     )
     ON CONFLICT (code) DO NOTHING`,
    [`promo_deposit_match_freebet`, DEPOSIT_FREEBET_CODE],
  );
  const again = await query(`SELECT * FROM promotions WHERE code = $1 LIMIT 1`, [DEPOSIT_FREEBET_CODE]);
  return mapCampaignRow(again.rows[0]);
}

export async function getDepositFreebetCampaign() {
  return ensureDepositFreebetCampaign();
}

export async function upsertDepositFreebetCampaign(rawConfig = {}, { adminId } = {}) {
  const conf = clampConfig(rawConfig);
  await ensureDepositFreebetCampaign();

  return withTransaction(async (client) => {
    const beforeRes = await client.query(
      `SELECT * FROM promotions WHERE code = $1 FOR UPDATE`,
      [DEPOSIT_FREEBET_CODE],
    );
    const prev = beforeRes.rows[0];
    if (!prev) {
      throw Object.assign(new Error('Campaign not found'), { status: 404, code: 'NOT_FOUND' });
    }

    const updated = await client.query(
      `UPDATE promotions SET
         name = $1,
         status = $2,
         min_stake = $3,
         match_percent = $4,
         max_reward = $5,
         max_eligible_deposit = $6,
         eligibility = $7,
         per_user_limit = $8,
         email_on_grant = $9,
         freebet_expiry_days = $10,
         split_parts = $14,
         split_each = $15,
         starts_at = $11,
         expires_at = $12,
         reward_bucket = 'freebet',
         auto_grant_on_deposit = true,
         type = 'FREE_BET',
         updated_at = NOW()
       WHERE code = $13
       RETURNING *`,
      [
        conf.name,
        conf.enabled ? 'ACTIVE' : 'PAUSED',
        conf.minDeposit,
        conf.matchPercent,
        conf.maxFreeBet,
        conf.maxEligibleDeposit,
        conf.eligibility,
        conf.onePerUser ? 1 : 0,
        conf.emailOnGrant,
        conf.freebetExpiryDays,
        conf.startsAt,
        conf.endsAt,
        DEPOSIT_FREEBET_CODE,
        conf.splitParts,
        conf.splitEach,
      ],
    );

    return {
      campaign: mapCampaignRow(updated.rows[0]),
      before: mapCampaignRow(prev),
      adminId: adminId || null,
    };
  });
}

async function countCapturedDeposits(client, userId) {
  const res = await client.query(
    `SELECT COUNT(*)::int AS n FROM deposits
     WHERE user_id = $1 AND UPPER(COALESCE(status, '')) = 'CAPTURED'`,
    [userId],
  );
  return Number(res.rows[0]?.n || 0);
}

async function assertAccountEligible(client, userId) {
  const profile = await client.query(
    `SELECT UPPER(COALESCE(account_status, 'ACTIVE')) AS account_status
     FROM user_profiles WHERE user_id = $1`,
    [userId],
  );
  const status = profile.rows[0]?.account_status || 'ACTIVE';
  if (['SUSPENDED', 'BANNED', 'CLOSED', 'SELF_EXCLUDED'].includes(status)) {
    return { ok: false, reason: 'USER_NOT_ELIGIBLE' };
  }
  const user = await client.query(
    `SELECT UPPER(COALESCE(status, 'ACTIVE')) AS status FROM users WHERE user_id = $1`,
    [userId],
  );
  if (user.rows[0] && !['ACTIVE', 'VERIFIED'].includes(String(user.rows[0].status))) {
    return { ok: false, reason: 'USER_NOT_ELIGIBLE' };
  }
  return { ok: true };
}

/**
 * Evaluate + grant after a CAPTURED deposit.
 * Checks active freebet auto-grant campaigns (targeted first, then global).
 * Idempotent per deposit_id (one reward per deposit) and per user+campaign when one-per-user.
 */
export async function tryGrantDepositFreebet({
  userId,
  depositId,
  amount,
  autoEmail = true,
} = {}) {
  if (!userId || !depositId) {
    return { granted: false, reason: 'MISSING_ARGS' };
  }
  const depositAmount = asNum(amount);
  if (depositAmount <= 0) {
    return { granted: false, reason: 'INVALID_AMOUNT' };
  }

  try {
    const { ensureDiscreteRewardSchema } = await import('./discreteRewardEngine.mjs');
    await ensureDiscreteRewardSchema();
    const result = await withTransaction(async (client) => {
      const existingDeposit = await client.query(
        `SELECT grant_id, freebet_amount, status, promotion_id
         FROM deposit_freebet_grants WHERE deposit_id = $1`,
        [depositId],
      );
      if (existingDeposit.rows[0]) {
        return {
          granted: false,
          reason: 'ALREADY_REWARDED',
          duplicate: true,
          grantId: existingDeposit.rows[0].grant_id,
          promotionId: existingDeposit.rows[0].promotion_id,
          amount: asNum(existingDeposit.rows[0].freebet_amount),
        };
      }

      const account = await assertAccountEligible(client, userId);
      if (!account.ok) {
        return { granted: false, reason: account.reason };
      }

      const campaigns = await client.query(
        `SELECT * FROM promotions
         WHERE COALESCE(reward_bucket, 'bonus') = 'freebet'
           AND COALESCE(auto_grant_on_deposit, false) = true
           AND UPPER(COALESCE(status, '')) = 'ACTIVE'
           AND (starts_at IS NULL OR starts_at <= NOW())
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY COALESCE(is_targeted, false) DESC, created_at ASC
         FOR UPDATE`,
      );

      if (!campaigns.rows.length) {
        return { granted: false, reason: 'PROMOTION_INACTIVE' };
      }

      const depositCount = await countCapturedDeposits(client, userId);
      let lastSkip = 'USER_NOT_ELIGIBLE';

      for (const promo of campaigns.rows) {
        const targeted = !!promo.is_targeted;
        if (targeted) {
          const assigned = await client.query(
            `SELECT assignment_id FROM deposit_freebet_campaign_users
             WHERE promotion_id = $1 AND user_id = $2
             LIMIT 1`,
            [promo.id, userId],
          );
          if (!assigned.rows[0]) {
            lastSkip = 'USER_NOT_ELIGIBLE';
            continue;
          }
          // Defense in depth: re-check exclude segments at grant time
          // (assignment may predate a later segment membership).
          const grantExcludeSegs = parseExcludeSegmentIds(promo.audience_exclude_segment_ids);
          if (grantExcludeSegs.length) {
            const exMem = await client.query(
              `SELECT 1 FROM user_segment_memberships
               WHERE user_id = $1 AND segment_id = ANY($2::text[])
               LIMIT 1`,
              [userId, grantExcludeSegs],
            );
            if (exMem.rows[0]) {
              lastSkip = 'USER_EXCLUDED';
              continue;
            }
          }
        } else {
          const eligibility = String(promo.eligibility || 'ALL').toUpperCase();
          if (eligibility === 'NEW' && depositCount !== 1) {
            lastSkip = 'USER_NOT_ELIGIBLE';
            continue;
          }
          if (eligibility === 'EXISTING' && depositCount <= 1) {
            lastSkip = 'USER_NOT_ELIGIBLE';
            continue;
          }
        }

        const perUserLimit = Number(promo.per_user_limit);
        if (perUserLimit === 1 || perUserLimit <= 1) {
          const prior = await client.query(
            `SELECT grant_id FROM deposit_freebet_grants
             WHERE user_id = $1 AND promotion_id = $2
               AND status IN ('AVAILABLE', 'USED', 'EXPIRED')
             LIMIT 1`,
            [userId, promo.id],
          );
          if (prior.rows[0]) {
            lastSkip = 'ALREADY_REWARDED';
            continue;
          }
        }

        const calc = calculateDepositFreebetAmount({
          depositAmount,
          matchPercent: promo.match_percent,
          maxFreeBet: promo.max_reward,
          maxEligibleDeposit: promo.max_eligible_deposit,
          minDeposit: promo.min_stake,
        });
        if (!calc.eligible) {
          lastSkip = calc.reason;
          continue;
        }

        // Abuse gate before crediting freebet (no money invented on block)
        try {
          const { assertPromoAbuseAllowsClaim } = await import('./promotionAbuseEngine.mjs');
          await assertPromoAbuseAllowsClaim(userId, {
            promoCode: promo.code,
            promotionId: promo.id,
            depositId,
            exec: client.query.bind(client),
            context: targeted ? 'targeted_deposit_freebet' : 'deposit_freebet',
          });
        } catch (err) {
          if (err?.code === 'PROMO_ABUSE_BLOCKED') {
            return {
              granted: false,
              reason: 'PROMO_ABUSE_BLOCKED',
              evaluation: err.evaluation || null,
              promotionId: promo.id,
            };
          }
          throw err;
        }

        const rewardAmount = calc.amount;
        const splitParts = Math.max(1, Number(promo.split_parts || 1));
        const splitEach = promo.split_each == null ? null : Number(promo.split_each);
        const { resolveDeliveryAmounts } = await import('./rewardSplit.mjs');
        const splitAmounts = resolveDeliveryAmounts({
          matchAmount: rewardAmount,
          parts: splitParts,
          each: splitEach,
        });
        const usedBudget = asNum(promo.used_budget);
        const totalBudget = asNum(promo.budget, 1e12);
        if (usedBudget + rewardAmount > totalBudget) {
          lastSkip = 'BUDGET_EXHAUSTED';
          continue;
        }

        const walletRes = await client.query(
          `SELECT wallet_id, balance, COALESCE(freebet_balance, 0) AS freebet_balance
           FROM wallets WHERE user_id = $1 FOR UPDATE`,
          [userId],
        );
        if (!walletRes.rows[0]) {
          return { granted: false, reason: 'WALLET_NOT_FOUND', promotionId: promo.id };
        }
        const wallet = walletRes.rows[0];
        const nextFreebet = Number((asNum(wallet.freebet_balance) + rewardAmount).toFixed(2));
        const txId = `tx_dfb_${crypto.randomBytes(10).toString('hex')}`;
        const gid = grantId();
        const expiryDays = Math.max(1, Number(promo.freebet_expiry_days || 7));
        const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

        await client.query(
          `UPDATE promotions SET used_budget = used_budget + $1, updated_at = NOW() WHERE id = $2`,
          [rewardAmount, promo.id],
        );

        await client.query(
          `INSERT INTO deposit_freebet_grants (
             grant_id, user_id, promotion_id, deposit_id, deposit_amount, freebet_amount,
             remaining_amount, status, email_status, expires_at, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $6, 'AVAILABLE', 'NONE', $7, NOW(), NOW()
           )`,
          [gid, userId, promo.id, depositId, depositAmount, rewardAmount, expiresAt.toISOString()],
        );

        await client.query(
          `INSERT INTO transactions (transaction_id, user_id, type, method, amount, status)
           VALUES ($1, $2, 'BONUS_CLAIM', 'DEPOSIT_FREEBET', $3, 'COMPLETED')`,
          [txId, userId, rewardAmount],
        );
        await client.query(
          `UPDATE wallets SET freebet_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
          [nextFreebet, wallet.wallet_id],
        );
        await client.query(
          `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
           VALUES ($1, $2, 'CREDIT', $3, $4, $5)`,
          [
            wallet.wallet_id,
            txId,
            rewardAmount,
            nextFreebet,
            splitAmounts.length > 1
              ? `Deposit free bet: ${promo.name} (${splitAmounts.length} stakes)`
              : `Deposit free bet: ${promo.name}`,
          ],
        );

        if (splitAmounts.length >= 1) {
          const { issueDiscreteReward } = await import('./discreteRewardEngine.mjs');
          for (let i = 0; i < splitAmounts.length; i += 1) {
            const part = splitAmounts[i];
            const partLabel = splitAmounts.length > 1
              ? `${i + 1}/${splitAmounts.length}`
              : '';
            await issueDiscreteReward({
              userId,
              rewardType: 'freebet',
              amount: part,
              title: splitAmounts.length > 1
                ? `${promo.name} ${partLabel}`
                : promo.name,
              source: 'DEPOSIT_FREEBET',
              promotionId: promo.id,
              expiryDays,
              expiresAt: expiresAt.toISOString(),
              metadata: {
                grantId: gid,
                depositId,
                splitIndex: i + 1,
                splitParts: splitAmounts.length,
                parentAmount: rewardAmount,
              },
              client,
              creditWallet: false,
            });
          }
        }

        return {
          granted: true,
          grantId: gid,
          promotionId: promo.id,
          promotionName: promo.name,
          targeted: targeted,
          amount: rewardAmount,
          splitParts: splitAmounts.length,
          splitAmounts: splitAmounts.length > 1 ? splitAmounts : undefined,
          depositAmount,
          expiresAt: expiresAt.toISOString(),
          freebetBalance: nextFreebet,
          emailOnGrant: promo.email_on_grant !== false,
        };
      }

      return { granted: false, reason: lastSkip };
    });

    if (result.granted && autoEmail && result.emailOnGrant) {
      void sendDepositFreebetGrantEmail({ grantId: result.grantId }).catch((err) => {
        logger.warn('deposit_freebet_email_auto_failed', { grantId: result.grantId, error: err.message });
      });
    }

    return result;
  } catch (err) {
    if (String(err.message || '').includes('deposit_freebet_grants_deposit_unique')
      || err.code === '23505') {
      return { granted: false, reason: 'ALREADY_REWARDED', duplicate: true };
    }
    logger.warn('deposit_freebet_grant_failed', { userId, depositId, error: err.message });
    return { granted: false, reason: 'ERROR', error: err.message };
  }
}

export async function expireDepositFreebetGrants(exec, userId) {
  const q = typeof exec.query === 'function' ? exec.query.bind(exec) : exec;
  const expired = await q(
    `SELECT grant_id, remaining_amount
     FROM deposit_freebet_grants
     WHERE user_id = $1
       AND status = 'AVAILABLE'
       AND expires_at IS NOT NULL
       AND expires_at <= NOW()
       AND remaining_amount > 0
     FOR UPDATE`,
    [userId],
  );
  if (!expired.rows.length) return { expiredFreebet: 0 };

  let freebetTotal = 0;
  for (const row of expired.rows) {
    freebetTotal += asNum(row.remaining_amount);
    await q(
      `UPDATE deposit_freebet_grants
       SET status = 'EXPIRED', remaining_amount = 0, updated_at = NOW()
       WHERE grant_id = $1`,
      [row.grant_id],
    );
  }

  const wallet = await q(
    `SELECT wallet_id, COALESCE(freebet_balance, 0) AS freebet_balance
     FROM wallets WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  if (!wallet.rows[0] || freebetTotal <= 0) {
    return { expiredFreebet: freebetTotal };
  }
  const deduct = Math.min(freebetTotal, asNum(wallet.rows[0].freebet_balance));
  if (deduct > 0) {
    await q(
      `UPDATE wallets
       SET freebet_balance = GREATEST(0, freebet_balance - $1), updated_at = NOW()
       WHERE wallet_id = $2`,
      [deduct, wallet.rows[0].wallet_id],
    );
    const txId = `tx_dfb_exp_${crypto.randomBytes(8).toString('hex')}`;
    await q(
      `INSERT INTO transactions (transaction_id, user_id, type, method, amount, status)
       VALUES ($1, $2, 'ADJUSTMENT', 'FREEBET_EXPIRED', $3, 'COMPLETED')
       ON CONFLICT DO NOTHING`,
      [txId, userId, deduct],
    ).catch(() => null);
  }
  return { expiredFreebet: deduct };
}

export async function consumeDepositFreebetGrants(exec, userId, amount) {
  const q = typeof exec.query === 'function' ? exec.query.bind(exec) : exec;
  await expireDepositFreebetGrants(exec, userId);
  let left = asNum(amount);
  if (left <= 0) return 0;

  const grants = await q(
    `SELECT grant_id, remaining_amount
     FROM deposit_freebet_grants
     WHERE user_id = $1
       AND status = 'AVAILABLE'
       AND remaining_amount > 0
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY expires_at ASC NULLS LAST, created_at ASC
     FOR UPDATE`,
    [userId],
  );

  let consumed = 0;
  for (const row of grants.rows) {
    if (left <= 0) break;
    const available = asNum(row.remaining_amount);
    const take = Math.min(left, available);
    if (take <= 0) continue;
    left -= take;
    consumed += take;
    const next = Number((available - take).toFixed(2));
    await q(
      `UPDATE deposit_freebet_grants
       SET remaining_amount = $1, status = $2, updated_at = NOW()
       WHERE grant_id = $3`,
      [next, next <= 0 ? 'USED' : 'AVAILABLE', row.grant_id],
    );
  }
  return consumed;
}

export async function listDepositFreebetGrants({
  limit = 100,
  status = null,
  q: search = null,
} = {}) {
  const params = [];
  const where = [];
  if (status) {
    params.push(String(status).toUpperCase());
    where.push(`g.status = $${params.length}`);
  }
  if (search) {
    params.push(`%${String(search).trim()}%`);
    where.push(`(u.email ILIKE $${params.length} OR g.user_id ILIKE $${params.length} OR g.grant_id ILIKE $${params.length})`);
  }
  params.push(Math.min(500, Math.max(1, Number(limit) || 100)));
  const res = await query(
    `SELECT g.*, p.name AS promotion_name, p.code AS promotion_code,
            LEFT(SPLIT_PART(COALESCE(u.email, ''), '@', 1), 3) || '***' AS user_mask,
            u.email AS user_email
     FROM deposit_freebet_grants g
     JOIN promotions p ON p.id = g.promotion_id
     LEFT JOIN users u ON u.user_id = g.user_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY g.created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return res.rows.map((r) => ({
    id: r.grant_id,
    userId: r.user_id,
    userMask: r.user_mask,
    promotionName: r.promotion_name,
    depositId: r.deposit_id,
    depositAmount: asNum(r.deposit_amount),
    freebetAmount: asNum(r.freebet_amount),
    remainingAmount: asNum(r.remaining_amount),
    status: r.status,
    emailStatus: r.email_status,
    emailSentAt: r.email_sent_at,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }));
}

export async function getDepositFreebetStats() {
  const campaign = await getDepositFreebetCampaign();
  const stats = await query(
    `SELECT
       COUNT(*)::int AS rewards_granted,
       COALESCE(SUM(freebet_amount), 0)::float AS total_freebet_value,
       COALESCE(SUM(freebet_amount) FILTER (WHERE status = 'USED'), 0)::float AS used_value,
       COALESCE(SUM(remaining_amount) FILTER (WHERE status = 'AVAILABLE'), 0)::float AS available_value,
       COALESCE(SUM(freebet_amount) FILTER (WHERE status = 'EXPIRED'), 0)::float AS expired_value,
       COUNT(*) FILTER (WHERE email_status = 'SENT')::int AS emails_sent,
       COUNT(*) FILTER (WHERE email_status = 'FAILED')::int AS emails_failed,
       COUNT(DISTINCT user_id)::int AS eligible_users
     FROM deposit_freebet_grants
     WHERE promotion_id = $1`,
    [campaign?.id],
  );
  const row = stats.rows[0] || {};
  return {
    campaign,
    eligibleUsers: Number(row.eligible_users || 0),
    rewardsGranted: Number(row.rewards_granted || 0),
    totalFreebetValue: asNum(row.total_freebet_value),
    usedValue: asNum(row.used_value),
    availableValue: asNum(row.available_value),
    expiredValue: asNum(row.expired_value),
    emailsSent: Number(row.emails_sent || 0),
    emailsFailed: Number(row.emails_failed || 0),
  };
}

export async function listMyDepositFreebetGrants(userId) {
  await expireDepositFreebetGrants(query, userId).catch(() => null);
  const res = await query(
    `SELECT g.*, p.name AS promotion_name
     FROM deposit_freebet_grants g
     JOIN promotions p ON p.id = g.promotion_id
     WHERE g.user_id = $1
     ORDER BY g.created_at DESC
     LIMIT 50`,
    [userId],
  );
  return res.rows.map((r) => ({
    id: r.grant_id,
    promotionName: r.promotion_name,
    depositAmount: asNum(r.deposit_amount),
    freebetAmount: asNum(r.freebet_amount),
    remainingAmount: asNum(r.remaining_amount),
    status: r.status,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }));
}

export async function sendDepositFreebetGrantEmail({
  grantId: gid,
  adminId = null,
  resend = false,
} = {}) {
  const grantRes = await query(
    `SELECT g.*, p.name AS promotion_name, u.email, u.first_name
     FROM deposit_freebet_grants g
     JOIN promotions p ON p.id = g.promotion_id
     JOIN users u ON u.user_id = g.user_id
     WHERE g.grant_id = $1`,
    [gid],
  );
  const grant = grantRes.rows[0];
  if (!grant) {
    throw Object.assign(new Error('Grant not found'), { status: 404, code: 'NOT_FOUND' });
  }
  if (!grant.email) {
    throw Object.assign(new Error('User has no email'), { status: 400, code: 'NO_EMAIL' });
  }

  const { sendDepositFreebetEmail } = await import('../server/auth/emailService.js');
  const sendResult = await sendDepositFreebetEmail({
    email: grant.email,
    name: grant.first_name || 'there',
    freeBetAmount: asNum(grant.freebet_amount),
    depositAmount: asNum(grant.deposit_amount),
    promotionName: grant.promotion_name,
    expiryDate: grant.expires_at,
  });

  const status = sendResult.success ? 'SENT' : 'FAILED';
  await query(
    `INSERT INTO deposit_freebet_email_log (
       log_id, grant_id, user_id, promotion_id, email_to, template, status,
       provider_message_id, failure_reason, admin_id
     ) VALUES ($1,$2,$3,$4,$5,'deposit_freebet_ready',$6,$7,$8,$9)`,
    [
      emailLogId(),
      gid,
      grant.user_id,
      grant.promotion_id,
      grant.email,
      status,
      sendResult.messageId || null,
      sendResult.error || null,
      adminId,
    ],
  );
  await query(
    `UPDATE deposit_freebet_grants SET
       email_status = $1::varchar(16),
       email_sent_at = COALESCE($2::timestamptz, email_sent_at),
       email_message_id = COALESCE($3::varchar(128), email_message_id),
       email_error = $4::text,
       email_admin_id = COALESCE($5::varchar(64), email_admin_id),
       updated_at = NOW()
     WHERE grant_id = $6`,
    [
      status,
      status === 'SENT' ? new Date().toISOString() : null,
      sendResult.messageId || null,
      sendResult.error || null,
      adminId,
      gid,
    ],
  );

  return {
    success: sendResult.success,
    status,
    resend: Boolean(resend),
    messageId: sendResult.messageId || null,
    error: sendResult.error || null,
  };
}

export async function previewDepositFreebet({
  depositAmount = 10000,
  matchPercent,
  maxFreeBet,
  maxEligibleDeposit,
  minDeposit,
} = {}) {
  const campaign = await getDepositFreebetCampaign();
  return calculateDepositFreebetAmount({
    depositAmount,
    matchPercent: matchPercent ?? campaign.matchPercent,
    maxFreeBet: maxFreeBet ?? campaign.maxFreeBet,
    maxEligibleDeposit: maxEligibleDeposit !== undefined ? maxEligibleDeposit : campaign.maxEligibleDeposit,
    minDeposit: minDeposit ?? campaign.minDeposit,
  });
}

const ensureSplitPartsColumn = memoizeEnsure(async () => {
  await addColumnIfMissing(
    'promotions',
    'split_parts',
    `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS split_parts INT NOT NULL DEFAULT 1`,
  );
  await addColumnIfMissing(
    'promotions',
    'split_each',
    `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS split_each NUMERIC(14, 2)`,
  );
});

const ensureTargetedSchema = memoizeEnsure(async () => {
  await ensureSplitPartsColumn();
  await addColumnIfMissing(
    'promotions',
    'is_targeted',
    `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS is_targeted BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  await addColumnIfMissing('promotions', 'description', `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS description TEXT`);
  await addColumnIfMissing('promotions', 'email_subject', `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS email_subject VARCHAR(255)`);
  await addColumnIfMissing('promotions', 'email_body', `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS email_body TEXT`);
  await addColumnIfMissing('promotions', 'audience_segment_id', `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS audience_segment_id VARCHAR(64)`);
  await addColumnIfMissing(
    'promotions',
    'audience_vip_tiers',
    `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS audience_vip_tiers JSONB NOT NULL DEFAULT '[]'::jsonb`,
  );
  await addColumnIfMissing(
    'promotions',
    'audience_exclude_segment_ids',
    `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS audience_exclude_segment_ids JSONB NOT NULL DEFAULT '[]'::jsonb`,
  );
  await createTableIfMissing(
    'deposit_freebet_campaign_users',
    `
      CREATE TABLE IF NOT EXISTS deposit_freebet_campaign_users (
        assignment_id VARCHAR(64) PRIMARY KEY,
        promotion_id VARCHAR(64) NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
        user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        assigned_by VARCHAR(64),
        offer_email_status VARCHAR(16) NOT NULL DEFAULT 'NONE',
        offer_email_sent_at TIMESTAMPTZ,
        offer_email_message_id VARCHAR(128),
        offer_email_error TEXT,
        UNIQUE (promotion_id, user_id)
      )
    `,
  );
});

async function resolveAudienceUserIds({
  userIds = [],
  segmentId = null,
  segmentIds = [],
  excludeSegmentIds = [],
  excludeUserIds = [],
  vipTiers = [],
  refreshSegment = true,
} = {}) {
  const ids = new Set((userIds || []).map((u) => String(u || '').trim()).filter(Boolean));
  const includeSegs = [
    segmentId,
    ...(Array.isArray(segmentIds) ? segmentIds : []),
  ].map((s) => String(s || '').trim()).filter(Boolean);

  if (includeSegs.length) {
    const {
      refreshCustomerSegmentMemberships,
      listSegmentMemberIds,
    } = await import('./crmEngine.mjs');
    for (const sid of includeSegs) {
      if (refreshSegment) {
        try {
          await refreshCustomerSegmentMemberships(sid);
        } catch {
          /* membership may be stale if refresh fails; still use existing members */
        }
      }
      const members = await listSegmentMemberIds(sid, { limit: 5000 });
      for (const id of members.userIds || []) ids.add(id);
    }
  }

  let result = [...ids];
  const tiers = parseVipTiers(vipTiers);
  if (tiers.length && result.length) {
    const vipRes = await query(
      `SELECT u.user_id
       FROM users u
       LEFT JOIN user_loyalty ul ON ul.user_id = u.user_id
       WHERE u.user_id = ANY($1)
         AND UPPER(COALESCE(ul.tier, 'BRONZE')) = ANY($2)`,
      [result, tiers],
    );
    result = vipRes.rows.map((r) => r.user_id);
  } else if (tiers.length && !result.length) {
    const vipRes = await query(
      `SELECT u.user_id
       FROM users u
       LEFT JOIN user_loyalty ul ON ul.user_id = u.user_id
       WHERE UPPER(COALESCE(ul.tier, 'BRONZE')) = ANY($1)
       ORDER BY u.created_at DESC
       LIMIT 5000`,
      [tiers],
    );
    result = vipRes.rows.map((r) => r.user_id);
  }

  const exclude = new Set(
    (excludeUserIds || []).map((u) => String(u || '').trim()).filter(Boolean),
  );
  const exSegs = parseExcludeSegmentIds(excludeSegmentIds);
  if (exSegs.length) {
    // Do not auto-refresh exclude segments here — refresh would wipe manually curated exclusions.
    // Admins sync exclude segments explicitly via CRM Sync.
    const { listSegmentMemberIds } = await import('./crmEngine.mjs');
    for (const sid of exSegs) {
      try {
        const members = await listSegmentMemberIds(sid, { limit: 5000 });
        for (const id of members.userIds || []) exclude.add(id);
      } catch { /* skip missing exclude segments */ }
    }
  }
  if (exclude.size) {
    result = result.filter((id) => !exclude.has(id));
  }
  return result.slice(0, 5000);
}

/**
 * Server-side preview of final eligible recipients (never trust frontend alone).
 */
export async function previewTargetedDepositFreebetAudience({
  userIds = [],
  segmentId = null,
  segmentIds = [],
  excludeSegmentIds = [],
  excludeUserIds = [],
  vipTiers = [],
  limit = 50,
} = {}) {
  await ensureTargetedSchema();
  const resolved = await resolveAudienceUserIds({
    userIds,
    segmentId,
    segmentIds,
    excludeSegmentIds,
    excludeUserIds,
    vipTiers,
    refreshSegment: true,
  });
  const sampleIds = resolved.slice(0, Math.min(100, Math.max(1, Number(limit) || 50)));
  let sample = [];
  if (sampleIds.length) {
    const res = await query(
      `SELECT u.user_id,
              LEFT(SPLIT_PART(COALESCE(u.email,''), '@', 1), 3) || '***' AS email_mask,
              UPPER(COALESCE(p.kyc_status,'NOT_STARTED')) AS kyc_status,
              UPPER(COALESCE(ul.tier,'BRONZE')) AS vip_tier
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.user_id
       LEFT JOIN user_loyalty ul ON ul.user_id = u.user_id
       WHERE u.user_id = ANY($1)`,
      [sampleIds],
    );
    sample = (res.rows || []).map((r) => ({
      userId: r.user_id,
      emailMask: r.email_mask,
      kycStatus: r.kyc_status,
      vipTier: r.vip_tier,
    }));
  }
  return {
    success: true,
    count: resolved.length,
    sample,
    excludedApplied: parseExcludeSegmentIds(excludeSegmentIds).length > 0
      || (excludeUserIds || []).length > 0,
  };
}

function initialCampaignStatus({ startsAt = null } = {}) {
  if (startsAt) {
    const start = new Date(startsAt);
    if (!Number.isNaN(start.getTime()) && start.getTime() > Date.now()) {
      return 'SCHEDULED';
    }
  }
  return 'DRAFT';
}

function assignmentId() {
  return `dfbu_${crypto.randomBytes(10).toString('hex')}`;
}

/**
 * Create a TARGETED deposit free-bet campaign (selected users / segment / VIP filter).
 * Starts DRAFT or SCHEDULED — grants only when status becomes ACTIVE.
 */
export async function createTargetedDepositFreebetCampaign(raw = {}, { adminId } = {}) {
  await ensureTargetedSchema();
  const conf = clampConfig({
    ...raw,
    enabled: false,
    eligibility: 'ALL',
    onePerUser: raw.onePerUser !== false,
  });
  const description = String(raw.description || '').trim().slice(0, 2000) || null;
  const emailSubject = String(raw.emailSubject || '').trim().slice(0, 255) || null;
  const emailBody = String(raw.emailBody || '').trim().slice(0, 8000) || null;
  const audienceSegmentId = String(raw.segmentId || raw.audienceSegmentId || '').trim() || null;
  const audienceVipTiers = parseVipTiers(raw.vipTiers || raw.audienceVipTiers || []);
  const audienceExcludeSegmentIds = parseExcludeSegmentIds(
    raw.excludeSegmentIds || raw.audienceExcludeSegmentIds || [],
  );
  const extraSegmentIds = Array.isArray(raw.segmentIds)
    ? raw.segmentIds.map((s) => String(s || '').trim()).filter(Boolean)
    : [];
  const requestedCode = String(raw.code || raw.promoCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 32);
  const codeBase = requestedCode || `TDFB_${Date.now().toString(36).toUpperCase()}`;
  if (codeBase.length < 3) {
    throw Object.assign(new Error('Promo code must be at least 3 characters'), {
      status: 400,
      code: 'INVALID_CODE',
    });
  }
  const existing = await query(`SELECT id FROM promotions WHERE code = $1 LIMIT 1`, [codeBase]);
  if (existing.rows[0]) {
    throw Object.assign(new Error(`Promo code ${codeBase} is already in use`), {
      status: 409,
      code: 'CODE_TAKEN',
    });
  }
  const id = `promo_tdfb_${crypto.randomBytes(6).toString('hex')}`;
  const status = initialCampaignStatus({ startsAt: conf.startsAt });

  const res = await query(
    `INSERT INTO promotions (
       id, name, code, type, status, budget, used_budget, max_reward, per_user_limit,
       min_odds, min_stake, wagering_multiplier, match_percent, expires_at, starts_at,
       reward_bucket, auto_grant_on_deposit, eligibility, email_on_grant,
       freebet_expiry_days, max_eligible_deposit, is_targeted, description,
       email_subject, email_body, audience_segment_id, audience_vip_tiers,
       audience_exclude_segment_ids, split_parts, split_each, updated_at
     ) VALUES (
       $1, $2, $3, 'FREE_BET', $16, 10000000.00, 0.00, $4, $5,
       1.00, $6, 0.00, $7, $8, $9,
       'freebet', true, 'ALL', $10,
       $11, $12, true, $13,
       $14, $15, $17, $18::jsonb,
       $19::jsonb, $20, $21, NOW()
     ) RETURNING *`,
    [
      id,
      conf.name,
      codeBase,
      conf.maxFreeBet,
      conf.onePerUser ? 1 : 0,
      conf.minDeposit,
      conf.matchPercent,
      conf.endsAt,
      conf.startsAt,
      conf.emailOnGrant,
      conf.freebetExpiryDays,
      conf.maxEligibleDeposit,
      description,
      emailSubject,
      emailBody,
      status,
      audienceSegmentId,
      JSON.stringify(audienceVipTiers),
      JSON.stringify(audienceExcludeSegmentIds),
      conf.splitParts,
      conf.splitEach,
    ],
  ).catch(async () => {
    // Pre-069 fallback without exclude column
    return query(
      `INSERT INTO promotions (
         id, name, code, type, status, budget, used_budget, max_reward, per_user_limit,
         min_odds, min_stake, wagering_multiplier, match_percent, expires_at, starts_at,
         reward_bucket, auto_grant_on_deposit, eligibility, email_on_grant,
         freebet_expiry_days, max_eligible_deposit, is_targeted, description,
         email_subject, email_body, audience_segment_id, audience_vip_tiers, updated_at
       ) VALUES (
         $1, $2, $3, 'FREE_BET', $16, 10000000.00, 0.00, $4, $5,
         1.00, $6, 0.00, $7, $8, $9,
         'freebet', true, 'ALL', $10,
         $11, $12, true, $13,
         $14, $15, $17, $18::jsonb, NOW()
       ) RETURNING *`,
      [
        id,
        conf.name,
        codeBase,
        conf.maxFreeBet,
        conf.onePerUser ? 1 : 0,
        conf.minDeposit,
        conf.matchPercent,
        conf.endsAt,
        conf.startsAt,
        conf.emailOnGrant,
        conf.freebetExpiryDays,
        conf.maxEligibleDeposit,
        description,
        emailSubject,
        emailBody,
        status,
        audienceSegmentId,
        JSON.stringify(audienceVipTiers),
      ],
    );
  });

  const resolvedIds = await resolveAudienceUserIds({
    userIds: Array.isArray(raw.userIds) ? raw.userIds : [],
    segmentId: audienceSegmentId,
    segmentIds: extraSegmentIds,
    excludeSegmentIds: audienceExcludeSegmentIds,
    excludeUserIds: Array.isArray(raw.excludeUserIds) ? raw.excludeUserIds : [],
    vipTiers: audienceVipTiers,
    refreshSegment: true,
  });
  if (resolvedIds.length) {
    await assignUsersToDepositFreebetCampaign({
      promotionId: id,
      userIds: resolvedIds,
      adminId,
    });
  }

  return mapCampaignRow({ ...res.rows[0], is_targeted: true });
}

export async function assignUsersToDepositFreebetCampaign({
  promotionId,
  userIds = [],
  adminId = null,
} = {}) {
  await ensureTargetedSchema();
  const promo = await query(
    `SELECT id, is_targeted FROM promotions WHERE id = $1`,
    [promotionId],
  );
  if (!promo.rows[0]) {
    throw Object.assign(new Error('Campaign not found'), { status: 404, code: 'NOT_FOUND' });
  }
  if (!promo.rows[0].is_targeted) {
    throw Object.assign(new Error('Only targeted campaigns accept user assignment'), {
      status: 400,
      code: 'NOT_TARGETED',
    });
  }

  const unique = [...new Set((userIds || []).map((u) => String(u || '').trim()).filter(Boolean))].slice(0, 5000);
  let assigned = 0;
  for (const userId of unique) {
    const exists = await query(`SELECT user_id FROM users WHERE user_id = $1`, [userId]);
    if (!exists.rows[0]) continue;
    await query(
      `INSERT INTO deposit_freebet_campaign_users (
         assignment_id, promotion_id, user_id, assigned_by, offer_email_status
       ) VALUES ($1, $2, $3, $4, 'NONE')
       ON CONFLICT (promotion_id, user_id) DO NOTHING`,
      [assignmentId(), promotionId, userId, adminId],
    );
    assigned += 1;
  }
  return { promotionId, requested: unique.length, assigned };
}

export async function removeUserFromDepositFreebetCampaign({ promotionId, userId } = {}) {
  await query(
    `DELETE FROM deposit_freebet_campaign_users WHERE promotion_id = $1 AND user_id = $2`,
    [promotionId, userId],
  );
  return { success: true };
}

export async function listTargetedDepositFreebetCampaigns({ limit = 100 } = {}) {
  await ensureTargetedSchema();
  const res = await query(
    `SELECT p.*,
            (SELECT COUNT(*)::int FROM deposit_freebet_campaign_users u WHERE u.promotion_id = p.id) AS selected_users,
            (SELECT COUNT(*)::int FROM deposit_freebet_campaign_users u WHERE u.promotion_id = p.id AND u.offer_email_status = 'SENT') AS emails_sent,
            (SELECT COUNT(*)::int FROM deposit_freebet_campaign_users u WHERE u.promotion_id = p.id AND u.offer_email_status = 'FAILED') AS emails_failed,
            (SELECT COUNT(*)::int FROM deposit_freebet_grants g WHERE g.promotion_id = p.id) AS claims,
            (SELECT COALESCE(SUM(g.freebet_amount),0)::float FROM deposit_freebet_grants g WHERE g.promotion_id = p.id) AS freebet_issued
     FROM promotions p
     WHERE COALESCE(p.is_targeted, false) = true
       AND COALESCE(p.reward_bucket, 'bonus') = 'freebet'
       AND UPPER(COALESCE(p.status, '')) <> 'DELETED'
     ORDER BY p.created_at DESC
     LIMIT $1`,
    [Math.min(200, Math.max(1, Number(limit) || 100))],
  );
  return res.rows.map((row) => ({
    ...mapCampaignRow(row),
    description: row.description || null,
    emailSubject: row.email_subject || null,
    selectedUsers: Number(row.selected_users || 0),
    emailsSent: Number(row.emails_sent || 0),
    emailsFailed: Number(row.emails_failed || 0),
    claims: Number(row.claims || 0),
    freebetIssued: asNum(row.freebet_issued),
  }));
}

export async function getTargetedDepositFreebetCampaign(promotionId) {
  await ensureTargetedSchema();
  const res = await query(`SELECT * FROM promotions WHERE id = $1 AND COALESCE(is_targeted,false) = true`, [promotionId]);
  if (!res.rows[0]) return null;
  const users = await query(
    `SELECT u.assignment_id, u.user_id, u.offer_email_status, u.offer_email_sent_at, u.assigned_at,
            LEFT(SPLIT_PART(COALESCE(usr.email,''), '@', 1), 3) || '***' AS user_mask,
            usr.email, usr.first_name
     FROM deposit_freebet_campaign_users u
     JOIN users usr ON usr.user_id = u.user_id
     WHERE u.promotion_id = $1
     ORDER BY u.assigned_at DESC
     LIMIT 2000`,
    [promotionId],
  );
  const grantRows = await query(
    `SELECT g.*, LEFT(SPLIT_PART(COALESCE(usr.email,''), '@', 1), 3) || '***' AS user_mask
     FROM deposit_freebet_grants g
     LEFT JOIN users usr ON usr.user_id = g.user_id
     WHERE g.promotion_id = $1
     ORDER BY g.created_at DESC
     LIMIT 200`,
    [promotionId],
  );
  return {
    campaign: {
      ...mapCampaignRow(res.rows[0]),
      description: res.rows[0].description || null,
      emailSubject: res.rows[0].email_subject || null,
      emailBody: res.rows[0].email_body || null,
    },
    users: users.rows.map((u) => ({
      assignmentId: u.assignment_id,
      userId: u.user_id,
      userMask: u.user_mask,
      email: u.email,
      firstName: u.first_name,
      offerEmailStatus: u.offer_email_status,
      offerEmailSentAt: u.offer_email_sent_at,
      assignedAt: u.assigned_at,
    })),
    claims: grantRows.rows.map((g) => ({
      id: g.grant_id,
      userId: g.user_id,
      userMask: g.user_mask,
      depositId: g.deposit_id,
      depositAmount: asNum(g.deposit_amount),
      freebetAmount: asNum(g.freebet_amount),
      status: g.status,
      createdAt: g.created_at,
    })),
  };
}

export async function setTargetedDepositFreebetStatus(promotionId, status, { adminId } = {}) {
  // Grant-safe: only ACTIVE unlocks deposit grants. Other statuses never grant.
  const allowed = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'EXPIRED', 'COMPLETED', 'CLOSED'];
  const nextRaw = String(status || '').toUpperCase();
  if (!allowed.includes(nextRaw)) {
    throw Object.assign(new Error('Invalid status'), { status: 400, code: 'INVALID_STATUS' });
  }
  const next = nextRaw === 'CLOSED' ? 'COMPLETED' : nextRaw;
  const current = await query(
    `SELECT status FROM promotions WHERE id = $1 AND COALESCE(is_targeted,false) = true`,
    [promotionId],
  );
  if (!current.rows[0]) {
    throw Object.assign(new Error('Campaign not found'), { status: 404, code: 'NOT_FOUND' });
  }
  if (String(current.rows[0].status || '').toUpperCase() === 'DELETED') {
    throw Object.assign(new Error('Deleted campaigns cannot be changed'), {
      status: 400,
      code: 'CAMPAIGN_DELETED',
    });
  }
  const res = await query(
    `UPDATE promotions SET status = $1, updated_at = NOW()
     WHERE id = $2 AND COALESCE(is_targeted,false) = true
     RETURNING *`,
    [next, promotionId],
  );
  if (!res.rows[0]) {
    throw Object.assign(new Error('Campaign not found'), { status: 404, code: 'NOT_FOUND' });
  }
  return mapCampaignRow(res.rows[0]);
}

/**
 * Sync audience from saved segment / VIP filters onto an existing campaign.
 */
export async function syncTargetedDepositFreebetAudience(promotionId, {
  segmentId = null,
  segmentIds = null,
  excludeSegmentIds = null,
  excludeUserIds = [],
  vipTiers = null,
  userIds = [],
  replace = false,
  adminId = null,
} = {}) {
  await ensureTargetedSchema();
  const promo = await query(
    `SELECT * FROM promotions WHERE id = $1 AND COALESCE(is_targeted,false) = true`,
    [promotionId],
  );
  if (!promo.rows[0]) {
    throw Object.assign(new Error('Campaign not found'), { status: 404, code: 'NOT_FOUND' });
  }
  if (String(promo.rows[0].status || '').toUpperCase() === 'DELETED') {
    throw Object.assign(new Error('Deleted campaigns cannot be updated'), {
      status: 400,
      code: 'CAMPAIGN_DELETED',
    });
  }

  const nextSegment = segmentId !== null && segmentId !== undefined
    ? (String(segmentId).trim() || null)
    : promo.rows[0].audience_segment_id;
  const nextVip = vipTiers !== null && vipTiers !== undefined
    ? parseVipTiers(vipTiers)
    : parseVipTiers(promo.rows[0].audience_vip_tiers);
  const nextExclude = excludeSegmentIds !== null && excludeSegmentIds !== undefined
    ? parseExcludeSegmentIds(excludeSegmentIds)
    : parseExcludeSegmentIds(promo.rows[0].audience_exclude_segment_ids);
  const extraSegmentIds = Array.isArray(segmentIds)
    ? segmentIds.map((s) => String(s || '').trim()).filter(Boolean)
    : [];

  await query(
    `UPDATE promotions SET
       audience_segment_id = $1,
       audience_vip_tiers = $2::jsonb,
       audience_exclude_segment_ids = $3::jsonb,
       updated_at = NOW()
     WHERE id = $4`,
    [nextSegment, JSON.stringify(nextVip), JSON.stringify(nextExclude), promotionId],
  ).catch(async () => query(
    `UPDATE promotions SET
       audience_segment_id = $1,
       audience_vip_tiers = $2::jsonb,
       updated_at = NOW()
     WHERE id = $3`,
    [nextSegment, JSON.stringify(nextVip), promotionId],
  ));

  if (replace) {
    await query(`DELETE FROM deposit_freebet_campaign_users WHERE promotion_id = $1`, [promotionId]);
  }

  const resolvedIds = await resolveAudienceUserIds({
    userIds,
    segmentId: nextSegment,
    segmentIds: extraSegmentIds,
    excludeSegmentIds: nextExclude,
    excludeUserIds,
    vipTiers: nextVip,
    refreshSegment: Boolean(nextSegment) || extraSegmentIds.length > 0 || nextExclude.length > 0,
  });
  const assigned = await assignUsersToDepositFreebetCampaign({
    promotionId,
    userIds: resolvedIds,
    adminId,
  });
  return {
    promotionId,
    audienceSegmentId: nextSegment,
    audienceVipTiers: nextVip,
    audienceExcludeSegmentIds: nextExclude,
    ...assigned,
  };
}

/**
 * Soft-delete a targeted campaign. Stops new grants (status != ACTIVE)
 * and retires the promo code so it cannot be reused.
 */
export async function deleteTargetedDepositFreebetCampaign(promotionId, { adminId = null } = {}) {
  await ensureTargetedSchema();
  const existing = await query(
    `SELECT * FROM promotions WHERE id = $1 AND COALESCE(is_targeted,false) = true`,
    [promotionId],
  );
  const promo = existing.rows[0];
  if (!promo) {
    throw Object.assign(new Error('Campaign not found'), { status: 404, code: 'NOT_FOUND' });
  }
  if (String(promo.status || '').toUpperCase() === 'DELETED') {
    return mapCampaignRow(promo);
  }

  const oldCode = String(promo.code || 'TDFB');
  const retiredCode = `${oldCode}__DEL_${Date.now().toString(36).toUpperCase()}`.slice(0, 64);
  const res = await query(
    `UPDATE promotions SET
       status = 'DELETED',
       code = $1,
       auto_grant_on_deposit = false,
       updated_at = NOW()
     WHERE id = $2 AND COALESCE(is_targeted,false) = true
     RETURNING *`,
    [retiredCode, promotionId],
  );
  return {
    ...mapCampaignRow(res.rows[0]),
    retiredCode,
    previousCode: oldCode,
    deletedBy: adminId,
  };
}

/**
 * Dispatch offer emails to assigned users from promos@oddsyra.com.
 * Does NOT grant free bets. Optionally activates the campaign.
 */
export async function dispatchTargetedDepositFreebetEmails({
  promotionId,
  activate = true,
  adminId = null,
} = {}) {
  await ensureTargetedSchema();
  const promoRes = await query(
    `SELECT * FROM promotions WHERE id = $1 AND COALESCE(is_targeted,false) = true`,
    [promotionId],
  );
  const promo = promoRes.rows[0];
  if (!promo) {
    throw Object.assign(new Error('Campaign not found'), { status: 404, code: 'NOT_FOUND' });
  }
  if (String(promo.status || '').toUpperCase() === 'DELETED') {
    throw Object.assign(new Error('Cannot send a deleted campaign'), {
      status: 400,
      code: 'CAMPAIGN_DELETED',
    });
  }

  const users = await query(
    `SELECT u.user_id, u.assignment_id, usr.email, usr.first_name
     FROM deposit_freebet_campaign_users u
     JOIN users usr ON usr.user_id = u.user_id
     WHERE u.promotion_id = $1`,
    [promotionId],
  );
  if (!users.rows.length) {
    throw Object.assign(new Error('Assign at least one user before sending'), {
      status: 400,
      code: 'NO_USERS',
    });
  }

  const { sendTargetedDepositOfferEmail } = await import('../server/auth/emailService.js');
  const { canSendPromotionalEmail } = await import('./notificationPreferencesEngine.mjs');
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of users.rows) {
    if (!row.email) {
      failed += 1;
      await query(
        `UPDATE deposit_freebet_campaign_users
         SET offer_email_status = 'FAILED', offer_email_error = 'missing_email'
         WHERE assignment_id = $1`,
        [row.assignment_id],
      );
      continue;
    }

    let allowed = true;
    try {
      allowed = await canSendPromotionalEmail(row.user_id);
    } catch {
      allowed = true;
    }
    if (!allowed) {
      skipped += 1;
      await query(
        `UPDATE deposit_freebet_campaign_users
         SET offer_email_status = 'SKIPPED', offer_email_error = 'marketing_opt_out'
         WHERE assignment_id = $1`,
        [row.assignment_id],
      ).catch(() => null);
      continue;
    }

    let result = { success: false, error: 'send_failed' };
    const sendStamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const baseSubject = promo.email_subject || promo.name || 'Exclusive deposit offer';
    // Unique subject per dispatch — Gmail often suppresses identical promo re-sends.
    const subject = `${baseSubject} · ${promo.code || 'OFFER'} · ${sendStamp}`;
    try {
      result = await sendTargetedDepositOfferEmail({
        email: row.email,
        name: row.first_name,
        campaignName: promo.name,
        promoCode: promo.code,
        minimumDeposit: promo.min_stake,
        freeBetPercentage: promo.match_percent,
        maximumFreeBet: promo.max_reward,
        expiryDate: promo.expires_at,
        subject,
        customBodyHtml: promo.email_body,
      });
    } catch (err) {
      result = { success: false, error: err.message || 'send_failed' };
    }
    console.info('[targeted-dispatch]', {
      promotionId,
      userId: row.user_id,
      email: row.email,
      subject,
      success: Boolean(result.success),
      provider: result.provider || null,
      messageId: result.messageId || null,
      error: result.error || null,
    });
    const emailStatus = result.success ? 'SENT' : 'FAILED';
    await query(
      `UPDATE deposit_freebet_campaign_users SET
         offer_email_status = $1::varchar(16),
         offer_email_sent_at = $2::timestamptz,
         offer_email_message_id = $3::varchar(128),
         offer_email_error = $4::text
       WHERE assignment_id = $5`,
      [
        emailStatus,
        result.success ? new Date().toISOString() : null,
        result.messageId || null,
        result.error || null,
        row.assignment_id,
      ],
    );
    if (result.success) sent += 1;
    else failed += 1;
  }

  if (activate) {
    await query(
      `UPDATE promotions SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1`,
      [promotionId],
    );
  }

  return {
    promotionId,
    selectedUsers: users.rows.length,
    sent,
    failed,
    skipped,
    activated: Boolean(activate),
    adminId,
  };
}
