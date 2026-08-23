import { describe, it, expect, beforeEach } from 'vitest';
import { query } from '../../db/pg.js';
import { earnLoyaltyPoints } from '../../lib/loyaltyPointsStore.mjs';
import { redeemLoyaltyPoints } from '../../lib/loyaltyEngine.mjs';

describe('loyalty redeem preserves VIP tier', () => {
  const userId = `usr_loyalty_redeem_${Date.now()}`;

  beforeEach(async () => {
    await query(
      `INSERT INTO users (user_id, email, password_hash)
       VALUES ($1, $2, 'hash')
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, `${userId}@example.com`],
    );
    await query(
      `INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, currency)
       VALUES ($1, $2, 1000, 0, 'INR')
       ON CONFLICT (wallet_id) DO NOTHING`,
      [`wal_${userId}`, userId],
    );
    await query(`DELETE FROM user_loyalty WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM ledger_entries WHERE wallet_id = $1`, [`wal_${userId}`]);
    await query(`DELETE FROM transactions WHERE user_id = $1`, [userId]);
  });

  it('does not downgrade VIP tier when redeemable loyalty points are spent', async () => {
    await earnLoyaltyPoints(query, userId, 12000);
    const before = await query(
      `SELECT points, COALESCE(vip_points, points) AS vip_points, tier
       FROM user_loyalty WHERE user_id = $1`,
      [userId],
    );
    expect(before.rows[0].tier).toBe('GOLD');
    expect(Number(before.rows[0].points)).toBe(12000);

    const result = await redeemLoyaltyPoints(userId, 2000);
    expect(result.success).toBe(true);
    expect(result.remainingPoints).toBe(10000);
    expect(result.vipPoints).toBe(12000);
    expect(result.loyaltyTier).toBe('GOLD');

    const after = await query(
      `SELECT points, COALESCE(vip_points, points) AS vip_points, tier
       FROM user_loyalty WHERE user_id = $1`,
      [userId],
    );
    expect(Number(after.rows[0].points)).toBe(10000);
    expect(Number(after.rows[0].vip_points)).toBe(12000);
    expect(after.rows[0].tier).toBe('GOLD');
  });
});
