/**
 * Enterprise Loyalty Engine — OddsYra Enterprise Platform (lib/loyaltyEngine.mjs)
 * 
 * PG-backed loyalty points, tier auto-calculation, and badge management.
 */

import crypto from 'crypto';
import { query, withTransaction } from '../db/pg.js';
import { loyaltyTierFromPoints } from './dailySpinPrizes.mjs';

const USER_LOYALTY_STORE = new Map();

/**
 * Add loyalty points and auto-calculate tier.
 */
export async function addLoyaltyPoints(userId, pointsToAdd = 0) {
  let record = USER_LOYALTY_STORE.get(userId) || {
    userId,
    points: 0,
    level: 1,
    badges: [],
  };

  record.points += Math.max(0, pointsToAdd);
  record.level = Math.floor(record.points / 1000) + 1;

  // Calculate tier
  let tier = 'BRONZE';
  if (record.points >= 10000) tier = 'PLATINUM';
  else if (record.points >= 2000) tier = 'GOLD';
  else if (record.points >= 500) tier = 'SILVER';

  record.tier = tier;

  USER_LOYALTY_STORE.set(userId, record);

  // Persist to PostgreSQL
  try {
    await query(`
      INSERT INTO user_loyalty (user_id, points, tier, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO UPDATE SET
        points = EXCLUDED.points,
        tier = EXCLUDED.tier,
        updated_at = CURRENT_TIMESTAMP;
    `, [userId, record.points, tier]);
  } catch (err) {
    // Tolerable — PG is a durability layer, in-memory is authoritative at runtime
  }

  return record;
}

/**
 * Get loyalty status for a user.
 */
export async function getLoyaltyStatus(userId) {
  // Check in-memory first
  if (USER_LOYALTY_STORE.has(userId)) {
    return { success: true, ...USER_LOYALTY_STORE.get(userId) };
  }

  // Fall back to PostgreSQL
  try {
    const res = await query(`SELECT points, tier, updated_at FROM user_loyalty WHERE user_id = $1;`, [userId]);
    if (res.rows.length > 0) {
      const row = res.rows[0];
      const record = {
        userId,
        points: parseFloat(row.points),
        tier: row.tier,
        level: Math.floor(parseFloat(row.points) / 1000) + 1,
        badges: [],
      };
      USER_LOYALTY_STORE.set(userId, record);
      return { success: true, ...record };
    }
  } catch (err) {
    // Tolerable
  }

  return { success: true, userId, points: 0, tier: 'BRONZE', level: 1, badges: [] };
}

const POINTS_PER_RUPEE = 5;
const MIN_REDEEM_POINTS = 50;

function pointsToRupees(points) {
  return (Number(points) || 0) / POINTS_PER_RUPEE;
}

/**
 * Redeem loyalty points for cash wallet credit. Persists points and balance.
 */
export async function redeemLoyaltyPoints(userId, requestedPoints) {
  if (!userId) {
    throw Object.assign(new Error('Please log in to redeem points.'), {
      code: 'AUTH_REQUIRED',
      status: 401,
    });
  }

  return withTransaction(async (client) => {
    const loyaltyRes = await client.query(
      `SELECT points FROM user_loyalty WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    const availablePoints = Number(loyaltyRes.rows[0]?.points || 0);
    const requested = requestedPoints == null || requestedPoints === ''
      ? availablePoints
      : Number(requestedPoints);
    const targetPoints = Number.isFinite(requested) ? requested : availablePoints;
    const pointsToRedeem = Math.floor(Math.min(availablePoints, Math.max(targetPoints, 0)));

    if (availablePoints < MIN_REDEEM_POINTS || pointsToRedeem < MIN_REDEEM_POINTS) {
      throw Object.assign(
        new Error(`You need at least ${MIN_REDEEM_POINTS} points to redeem.`),
        { code: 'LOYALTY_MIN_NOT_MET', status: 400 },
      );
    }

    const walletRes = await client.query(
      `SELECT wallet_id, balance, bonus_balance, COALESCE(freebet_balance, 0) AS freebet_balance
       FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    if (walletRes.rows.length === 0) {
      throw Object.assign(new Error('Wallet not found.'), {
        code: 'WALLET_NOT_FOUND',
        status: 400,
      });
    }

    const wallet = walletRes.rows[0];
    const rupees = Number(pointsToRupees(pointsToRedeem).toFixed(2));
    const remainingPoints = Number((availablePoints - pointsToRedeem).toFixed(2));
    const nextBalance = Number((Number(wallet.balance || 0) + rupees).toFixed(2));
    const tier = loyaltyTierFromPoints(remainingPoints);
    const txId = `tx_lr_${crypto.randomBytes(16).toString('hex')}`;

    await client.query(
      `INSERT INTO transactions (transaction_id, user_id, type, method, amount, status)
       VALUES ($1, $2, 'BONUS_CLAIM', 'LOYALTY_REDEEM', $3, 'COMPLETED')`,
      [txId, userId, rupees],
    );
    await client.query(
      `UPDATE wallets SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
      [nextBalance, wallet.wallet_id],
    );
    await client.query(
      `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'CREDIT', $3, $4, $5)`,
      [wallet.wallet_id, txId, rupees, nextBalance, `Loyalty redeem · ${pointsToRedeem} pts`],
    );
    await client.query(
      `INSERT INTO user_loyalty (user_id, points, tier, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         points = EXCLUDED.points,
         tier = EXCLUDED.tier,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, remainingPoints, tier],
    );

    USER_LOYALTY_STORE.set(userId, {
      userId,
      points: remainingPoints,
      tier,
      level: Math.floor(remainingPoints / 1000) + 1,
      badges: [],
    });

    return {
      success: true,
      pointsRedeemed: pointsToRedeem,
      rupeesCredited: rupees,
      remainingPoints,
      wallet: {
        balance: nextBalance,
        bonusBalance: Number(wallet.bonus_balance || 0),
        freebetBalance: Number(wallet.freebet_balance || 0),
        loyaltyPoints: remainingPoints,
      },
    };
  });
}
