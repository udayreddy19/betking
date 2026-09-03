import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeAdminOutcome,
  adminDeclareBetOutcome,
} from '../../lib/adminBetRedeclare.mjs';
import { query } from '../../db/pg.js';

describe('adminBetRedeclare helpers', () => {
  it('normalizes win/lose/void aliases', () => {
    expect(normalizeAdminOutcome('win')).toBe('WON');
    expect(normalizeAdminOutcome('LOSE')).toBe('LOST');
    expect(normalizeAdminOutcome('push')).toBe('VOID');
    expect(normalizeAdminOutcome('nope')).toBe(null);
  });
});

describe('adminDeclareBetOutcome redeclare money flow', () => {
  const userId = 'usr_admin_redeclare';
  const walletId = 'wal_admin_redeclare';
  const matchId = 'm_admin_redeclare';
  const betId = 'bet_admin_redeclare_1';
  const STAKE = 500;

  beforeEach(async () => {
    await query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS winnings_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00`);
    await query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS locked_deposit_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00`);
    await query(`ALTER TABLE bets ADD COLUMN IF NOT EXISTS winnings_credited NUMERIC(14,2)`);
    await query(`ALTER TABLE bets ADD COLUMN IF NOT EXISTS settlement_version INTEGER DEFAULT 0`);
    await query(`ALTER TABLE bets ADD COLUMN IF NOT EXISTS settlement_reason TEXT`);
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT DO NOTHING`, [userId, `${userId}@test.com`]);
    await query(`DELETE FROM ledger_entries WHERE wallet_id = $1`, [walletId]);
    await query(`DELETE FROM transactions WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM bet_selections WHERE bet_id = $1`, [betId]);
    await query(`DELETE FROM bets WHERE bet_id = $1 OR user_id = $2`, [betId, userId]);
    await query(`DELETE FROM wallets WHERE user_id = $1`, [userId]);
    await query(
      `INSERT INTO wallets (wallet_id, user_id, balance, winnings_balance, currency)
       VALUES ($1, $2, 1500, 0, 'INR')`,
      [walletId, userId],
    );
    // Pre-placed: stake already debited (2000→1500), bet open
    await query(
      `INSERT INTO bets (
         bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds,
         potential_payout, status, fund_source, settlement_version
       ) VALUES ($1, $2, $3, 'match_winner', 'sel_home', $4, 2, 2, 1000, 'ACCEPTED', 'cash', 0)`,
      [betId, userId, matchId, STAKE],
    );
  });

  it('redeclarates WON → LOST and claws back payout', async () => {
    const won = await adminDeclareBetOutcome({
      betId,
      outcome: 'WON',
      adminId: 'test_admin',
      reason: 'test first declare',
    });
    expect(won.outcome).toBe('WON');
    expect(won.redeclared).toBe(false);

    let w = await query(`SELECT balance, winnings_balance FROM wallets WHERE wallet_id = $1`, [walletId]);
    expect(parseFloat(w.rows[0].balance)).toBe(2500);

    const lost = await adminDeclareBetOutcome({
      betId,
      outcome: 'LOST',
      adminId: 'test_admin',
      reason: 'test redeclare to lost',
    });
    expect(lost.redeclared).toBe(true);
    expect(lost.outcome).toBe('LOST');

    const bet = await query(`SELECT status FROM bets WHERE bet_id = $1`, [betId]);
    expect(String(bet.rows[0].status).toUpperCase()).toBe('LOST');

    w = await query(`SELECT balance FROM wallets WHERE wallet_id = $1`, [walletId]);
    expect(parseFloat(w.rows[0].balance)).toBe(1500);

    // Same outcome again is a no-op
    const again = await adminDeclareBetOutcome({
      betId,
      outcome: 'LOST',
      adminId: 'test_admin',
    });
    expect(again.status).toBe('ALREADY_SETTLED');
    expect(again.redeclared).toBe(false);
  });

  it('rejects cashed-out redeclarations', async () => {
    await query(`UPDATE bets SET status = 'CASHED_OUT', settled_at = NOW(), actual_payout = 400 WHERE bet_id = $1`, [betId]);
    await expect(adminDeclareBetOutcome({
      betId,
      outcome: 'WON',
      adminId: 'test_admin',
    })).rejects.toThrow(/CASHED_OUT/);
  });
});
