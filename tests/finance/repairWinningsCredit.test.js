import { describe, it, expect, beforeEach } from 'vitest';
import { query } from '../../db/pg.js';
import { repairUnderCreditedWinningsForBet } from '../../lib/walletSettlement.mjs';

describe('repair cumulative winnings', () => {
  const userId = 'usr_repair_win';
  const walletId = 'wal_repair_win';

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT DO NOTHING`, [userId, `${userId}@test.com`]);
    await query(`DELETE FROM wallets WHERE user_id = $1`, [userId]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, winnings_balance, currency) VALUES ($1, $2, 1030.00, 530.00, 'INR')`, [walletId, userId]);
  });

  it('reduces cumulative winnings when legacy settlement stored full payout as profit', async () => {
    const betId = 'bet_repair_legacy';
    await query(`DELETE FROM bets WHERE bet_id = $1`, [betId]);
    await query(
      `INSERT INTO bets (bet_id, user_id, stake, odds, accepted_odds, potential_payout, actual_payout, fund_source, status, winnings_credited)
       VALUES ($1, $2, 500, 1.06, 1.06, 530, 530, 'cash', 'WON', 530)`,
      [betId, userId],
    );

    const res = await repairUnderCreditedWinningsForBet(betId);
    expect(res.adjusted).toBe(-500);

    const w = await query('SELECT winnings_balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(w.rows[0].winnings_balance)).toBe(30);
  });
});
