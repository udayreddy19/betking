import { describe, it, expect, beforeEach } from 'vitest';
import { query } from '../../db/pg.js';
import { claimDailySpin, getDailySpinStatus } from '../../lib/dailySpinEngine.mjs';
import {
  createSpinGrant,
  expireSpinGrants,
  consumeSpinGrants,
  ensureSpinGrantSchema,
  getActiveSpinGrantSummary,
  SPIN_PRIZE_TTL_MS,
} from '../../lib/spinGrantEngine.mjs';
import { spinDateInKolkata } from '../../lib/dailySpinPrizes.mjs';

describe('daily spin prize 24h expiry', () => {
  const userId = `usr_spin_exp_${Date.now()}`;
  const walletId = `wal_${userId}`;

  beforeEach(async () => {
    await ensureSpinGrantSchema(query);
    await query(
      `INSERT INTO users (user_id, email, password_hash)
       VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING`,
      [userId, `${userId}@example.com`],
    );
    await query(
      `INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, freebet_balance, currency)
       VALUES ($1, $2, 1000, 0, 0, 'INR')
       ON CONFLICT (wallet_id) DO NOTHING`,
      [walletId, userId],
    );
    await query(`DELETE FROM spin_wallet_grants WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM daily_spins WHERE user_id = $1`, [userId]);
  });

  it('creates a 24h grant when a bonus/freebet spin prize is won', async () => {
    const spinDate = spinDateInKolkata();
    const spinId = `spin_${userId}_${spinDate}`;
    const expiresAt = new Date(Date.now() + SPIN_PRIZE_TTL_MS);

    await query(
      `INSERT INTO daily_spins (spin_id, user_id, spin_date, prize_type, prize_value, prize_index, prize_expires_at)
       VALUES ($1, $2, $3, 'bonus', 500, 0, $4)`,
      [spinId, userId, spinDate, expiresAt],
    );
    await query(`UPDATE wallets SET bonus_balance = 500 WHERE wallet_id = $1`, [walletId]);
    await createSpinGrant(query, {
      userId,
      spinId,
      grantType: 'bonus',
      amount: 500,
      expiresAt,
    });

    const status = await getDailySpinStatus(userId);
    expect(status.hasSpunToday).toBe(true);
    expect(status.prize.type).toBe('bonus');
    expect(status.prize.useWithinHours).toBe(24);
    expect(status.prize.expiresAt).toBeTruthy();
    expect(status.spinGrants.bonusRemaining).toBe(500);
  });

  it('expires unused spin bonus after 24 hours', async () => {
    const spinDate = spinDateInKolkata();
    const spinId = `spin_${userId}_${spinDate}`;
    const expiredAt = new Date(Date.now() - 60_000);

    await query(
      `INSERT INTO daily_spins (spin_id, user_id, spin_date, prize_type, prize_value, prize_index, prize_expires_at)
       VALUES ($1, $2, $3, 'freebet', 200, 1, $4)`,
      [spinId, userId, spinDate, expiredAt],
    );
    await query(`UPDATE wallets SET freebet_balance = 200 WHERE wallet_id = $1`, [walletId]);
    await createSpinGrant(query, {
      userId,
      spinId,
      grantType: 'freebet',
      amount: 200,
      expiresAt: expiredAt,
    });

    const result = await expireSpinGrants(query, userId);
    expect(result.expiredFreebet).toBe(200);

    const wallet = await query(`SELECT freebet_balance FROM wallets WHERE wallet_id = $1`, [walletId]);
    expect(Number(wallet.rows[0].freebet_balance)).toBe(0);

    const status = await getDailySpinStatus(userId);
    expect(status.prize.expired).toBe(true);
  });

  it('consumes spin grants when bonus bets are placed', async () => {
    const spinDate = spinDateInKolkata();
    const spinId = `spin_${userId}_${spinDate}`;
    const expiresAt = new Date(Date.now() + SPIN_PRIZE_TTL_MS);

    await query(
      `INSERT INTO daily_spins (spin_id, user_id, spin_date, prize_type, prize_value, prize_index, prize_expires_at)
       VALUES ($1, $2, $3, 'bonus', 300, 0, $4)`,
      [spinId, userId, spinDate, expiresAt],
    );
    await query(`UPDATE wallets SET bonus_balance = 300 WHERE wallet_id = $1`, [walletId]);
    await createSpinGrant(query, {
      userId,
      spinId,
      grantType: 'bonus',
      amount: 300,
      expiresAt,
    });

    const consumed = await consumeSpinGrants(query, userId, 'bonus', 100);
    expect(consumed).toBe(100);

    const grants = await query(
      `SELECT remaining_amount, status FROM spin_wallet_grants WHERE user_id = $1`,
      [userId],
    );
    expect(Number(grants.rows[0].remaining_amount)).toBe(200);
    expect(grants.rows[0].status).toBe('ACTIVE');
  });

  it('reads grant summary without expiring unused prizes', async () => {
    const spinDate = spinDateInKolkata();
    const spinId = `spin_${userId}_${spinDate}_ro`;
    const expiredAt = new Date(Date.now() - 60_000);

    await query(
      `INSERT INTO daily_spins (spin_id, user_id, spin_date, prize_type, prize_value, prize_index, prize_expires_at)
       VALUES ($1, $2, $3, 'bonus', 150, 0, $4)`,
      [spinId, userId, spinDate, expiredAt],
    );
    await query(`UPDATE wallets SET bonus_balance = 150 WHERE wallet_id = $1`, [walletId]);
    await createSpinGrant(query, {
      userId,
      spinId,
      grantType: 'bonus',
      amount: 150,
      expiresAt: expiredAt,
    });

    const summary = await getActiveSpinGrantSummary(query, userId);
    expect(summary.bonusRemaining).toBe(0);

    const grant = await query(
      `SELECT status, remaining_amount FROM spin_wallet_grants WHERE user_id = $1 AND spin_id = $2`,
      [userId, spinId],
    );
    expect(grant.rows[0].status).toBe('ACTIVE');
    expect(Number(grant.rows[0].remaining_amount)).toBe(150);

    const expired = await expireSpinGrants(query, userId);
    expect(expired.expiredBonus).toBe(150);
    const after = await query(
      `SELECT status, remaining_amount FROM spin_wallet_grants WHERE user_id = $1 AND spin_id = $2`,
      [userId, spinId],
    );
    expect(after.rows[0].status).toBe('EXPIRED');
  });
});
