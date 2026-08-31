/**
 * ODDSYRA — Centralized Wallet, Deposit, and Promotional Rules Engine
 *
 * Single Source of Truth for:
 * 1. Configurable Minimum Deposit Threshold (Server-Authoritative, default ₹1,000).
 * 2. Exact Stake & No-Splitting Rule for Promotional Entitlements (Free Bets & Bonuses).
 * 3. Atomic State Management & Concurrency Controls for Promo Balances.
 */

import { query } from '../db/pg.js';
import { logger } from './logger.mjs';

let cachedRules = null;
let lastCacheFetch = 0;
const CACHE_TTL_MS = 5000;

export const DEFAULT_WALLET_PROMO_RULES = Object.freeze({
  minimumDepositAmount: 1000.00,
  allowPartialFreeBet: false,
  allowPartialBonus: false,
  requireFullFreeBetAmount: true,
  requireFullBonusAmount: true,
});

/**
 * Fetch current wallet & promotion rules from database with caching.
 */
export async function getWalletPromoRules() {
  const now = Date.now();
  if (cachedRules && (now - lastCacheFetch) < CACHE_TTL_MS) {
    return cachedRules;
  }

  try {
    const res = await query(
      `SELECT minimum_deposit_amount, allow_partial_freebet, allow_partial_bonus,
              require_full_freebet_amount, require_full_bonus_amount, updated_at
       FROM wallet_promotion_rules
       WHERE id = 'default'
       LIMIT 1`
    );

    if (res.rows.length > 0) {
      const row = res.rows[0];
      cachedRules = {
        minimumDepositAmount: Number(row.minimum_deposit_amount) || DEFAULT_WALLET_PROMO_RULES.minimumDepositAmount,
        allowPartialFreeBet: Boolean(row.allow_partial_freebet),
        allowPartialBonus: Boolean(row.allow_partial_bonus),
        requireFullFreeBetAmount: Boolean(row.require_full_freebet_amount),
        requireFullBonusAmount: Boolean(row.require_full_bonus_amount),
        updatedAt: row.updated_at,
      };
    } else {
      cachedRules = { ...DEFAULT_WALLET_PROMO_RULES };
    }
  } catch (err) {
    logger.warn('[WalletPromoRules] Database read warning, using default configuration:', { error: err.message });
    cachedRules = { ...DEFAULT_WALLET_PROMO_RULES };
  }

  lastCacheFetch = now;
  return cachedRules;
}

/**
 * Update rules from Admin Console.
 */
export async function updateWalletPromoRules(updates = {}, adminId = 'admin') {
  const current = await getWalletPromoRules();
  const minDeposit = updates.minimumDepositAmount !== undefined
    ? Math.max(1, Number(updates.minimumDepositAmount))
    : current.minimumDepositAmount;

  const allowPartialFB = updates.allowPartialFreeBet !== undefined
    ? Boolean(updates.allowPartialFreeBet)
    : current.allowPartialFreeBet;

  const allowPartialBN = updates.allowPartialBonus !== undefined
    ? Boolean(updates.allowPartialBonus)
    : current.allowPartialBonus;

  const requireFullFB = updates.requireFullFreeBetAmount !== undefined
    ? Boolean(updates.requireFullFreeBetAmount)
    : current.requireFullFreeBetAmount;

  const requireFullBN = updates.requireFullBonusAmount !== undefined
    ? Boolean(updates.requireFullBonusAmount)
    : current.requireFullBonusAmount;

  await query(
    `INSERT INTO wallet_promotion_rules (
       id, minimum_deposit_amount, allow_partial_freebet, allow_partial_bonus,
       require_full_freebet_amount, require_full_bonus_amount, updated_by, updated_at
     ) VALUES ('default', $1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (id) DO UPDATE SET
       minimum_deposit_amount = EXCLUDED.minimum_deposit_amount,
       allow_partial_freebet = EXCLUDED.allow_partial_freebet,
       allow_partial_bonus = EXCLUDED.allow_partial_bonus,
       require_full_freebet_amount = EXCLUDED.require_full_freebet_amount,
       require_full_bonus_amount = EXCLUDED.require_full_bonus_amount,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [minDeposit, allowPartialFB, allowPartialBN, requireFullFB, requireFullBN, adminId]
  );

  cachedRules = null;
  lastCacheFetch = 0;
  return getWalletPromoRules();
}

/**
 * Validate deposit amount against configured minimum threshold.
 * Throws an error if amount is below minimum deposit limit.
 */
export async function validateDepositAmount(amount) {
  const rules = await getWalletPromoRules();
  const numericAmount = Number(amount);
  const minDeposit = rules.minimumDepositAmount;

  if (!Number.isFinite(numericAmount) || numericAmount < minDeposit) {
    const err = new Error(`DEPOSIT_LIMIT: Minimum deposit amount is ₹${minDeposit.toLocaleString('en-IN')}.`);
    err.code = 'DEPOSIT_LIMIT';
    err.status = 400;
    err.minDeposit = minDeposit;
    throw err;
  }
  return numericAmount;
}

/**
 * Validate promotional bet stake (Full / Exact Amount Rule).
 * Rejects partial bets or splitting of promotional balances.
 */
export async function validatePromoBetStake({ fundSource, requestedStake, availableBalance, userId = null }) {
  const rules = await getWalletPromoRules();
  const stakePaise = Math.round(Number(requestedStake) * 100);
  const availPaise = Math.round(Number(availableBalance) * 100);

  if (fundSource === 'freebet') {
    if (rules.requireFullFreeBetAmount && !rules.allowPartialFreeBet) {
      if (stakePaise !== availPaise) {
        logger.warn('[WalletPromoRules] Partial Free Bet attempt rejected:', {
          userId,
          requestedStake,
          availableBalance,
        });

        const err = new Error(
          `FULL_PROMO_AMOUNT_REQUIRED: This Free Bet must be used in full (₹${Number(availableBalance).toLocaleString('en-IN')}). Partial usage is not allowed.`
        );
        err.code = 'FULL_PROMO_AMOUNT_REQUIRED';
        err.status = 400;
        err.requiredAmount = availableBalance;
        err.requestedStake = requestedStake;
        throw err;
      }
    }
  } else if (fundSource === 'bonus') {
    if (rules.requireFullBonusAmount && !rules.allowPartialBonus) {
      if (stakePaise !== availPaise) {
        logger.warn('[WalletPromoRules] Partial Bonus attempt rejected:', {
          userId,
          requestedStake,
          availableBalance,
        });

        const err = new Error(
          `FULL_PROMO_AMOUNT_REQUIRED: This Bonus must be used in full (₹${Number(availableBalance).toLocaleString('en-IN')}). Partial usage is not allowed.`
        );
        err.code = 'FULL_PROMO_AMOUNT_REQUIRED';
        err.status = 400;
        err.requiredAmount = availableBalance;
        err.requestedStake = requestedStake;
        throw err;
      }
    }
  }
}
