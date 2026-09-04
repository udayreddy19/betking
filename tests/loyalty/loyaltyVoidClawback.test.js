import { describe, it, expect, beforeEach } from 'vitest';
import { query } from '../../db/pg.js';
import { earnLoyaltyPoints, clawbackLoyaltyForBet } from '../../lib/loyaltyPointsStore.mjs';

describe('loyalty void clawback', () => {
  const userId = `usr_loyalty_claw_${Date.now()}`;
  const betId = `bet_claw_${Date.now()}`;

  beforeEach(async () => {
    await query(
      `INSERT INTO users (user_id, email, password_hash)
       VALUES ($1, $2, 'hash')
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, `${userId}@example.com`],
    );
    await query(`DELETE FROM loyalty_ledger WHERE user_id = $1`, [userId]).catch(() => null);
    await query(`DELETE FROM user_loyalty WHERE user_id = $1`, [userId]);
  });

  it('reverses stake-earned points and vip_points for a voided bet', async () => {
    await earnLoyaltyPoints(query, userId, 40, { source: 'bet_stake', referenceId: betId });
    const before = await query(
      `SELECT points, COALESCE(vip_points, points) AS vip_points FROM user_loyalty WHERE user_id = $1`,
      [userId],
    );
    expect(Number(before.rows[0].points)).toBe(40);
    expect(Number(before.rows[0].vip_points)).toBe(40);

    const result = await clawbackLoyaltyForBet(query, { userId, betId, stake: 2000 });
    expect(result.clawed).toBe(40);
    expect(result.vipPoints).toBe(0);

    const after = await query(
      `SELECT points, COALESCE(vip_points, points) AS vip_points, tier FROM user_loyalty WHERE user_id = $1`,
      [userId],
    );
    expect(Number(after.rows[0].points)).toBe(0);
    expect(Number(after.rows[0].vip_points)).toBe(0);

    const again = await clawbackLoyaltyForBet(query, { userId, betId, stake: 2000 });
    expect(again.alreadyClawed || again.clawed === 0).toBe(true);
  });
});
