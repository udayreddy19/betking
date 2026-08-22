import { describe, it, expect, beforeEach } from 'vitest';
import { betSettlementEngine } from '../../lib/betSettlementEngine.mjs';
import { executeBetCashout } from '../../lib/cashoutEngine.mjs';
import { query } from '../../db/pg.js';

describe('cashout vs settlement race', () => {
  const userId = 'usr_cashrace_1';
  const walletId = 'wal_cashrace_1';
  const matchId = 'm_cashrace_1';
  const marketId = 'match_winner';
  const selectionId = '1';

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING`, [userId, `${userId}@test.com`]);
    await query(`DELETE FROM ledger_entries WHERE wallet_id = $1`, [walletId]);
    await query(`DELETE FROM bets WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM transactions WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM wallets WHERE user_id = $1`, [userId]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, currency) VALUES ($1, $2, 500.00, 'INR')`, [walletId, userId]);
    await query(`INSERT INTO matches (match_id, status) VALUES ($1, 'IN_PLAY') ON CONFLICT (match_id) DO UPDATE SET status = 'IN_PLAY'`, [matchId]);
    await query(`INSERT INTO markets (market_id, match_id, name, status) VALUES ($1, $2, 'Winner', 'OPEN') ON CONFLICT (market_id) DO UPDATE SET status = 'OPEN'`, [marketId, matchId]);
    await query(`INSERT INTO selections (selection_id, market_id, name, odds, status) VALUES ($1, $2, 'Home', 2.00, 'OPEN') ON CONFLICT DO NOTHING`, [selectionId, marketId]);
  });

  it('settlement + cashout concurrently → exactly one terminal outcome', async () => {
    const betId = `b_cashrace_${Date.now()}`;
    await query(
      `INSERT INTO bets (bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds, potential_payout, status, fund_source)
       VALUES ($1, $2, $3, $4, $5, 100.00, 2.00, 2.00, 200.00, 'ACCEPTED', 'cash')`,
      [betId, userId, matchId, marketId, selectionId],
    );

    const matchState = {
      matchId,
      status: 'COMPLETED',
      __forcedOutcome: 'WON',
      __settlementReason: 'race_test',
    };

    const results = await Promise.allSettled([
      betSettlementEngine.settleSingleBet({ betId, matchState }),
      executeBetCashout({ betId, userId, idempotencyKey: `cashout_race_${betId}` }).catch((e) => ({ error: e.message })),
    ]);

    const betRes = await query('SELECT status FROM bets WHERE bet_id = $1', [betId]);
    const status = String(betRes.rows[0]?.status || '').toUpperCase();

    expect(['WON', 'CASHED_OUT']).toContain(status);
    expect(status).not.toBe('ACCEPTED');

    const payoutTx = await query(
      `SELECT COUNT(*) FROM transactions WHERE user_id = $1 AND transaction_id IN ($2, $3)`,
      [userId, `tx_payout_${betId}`, `tx_cashout_${betId}`],
    );
    expect(Number(payoutTx.rows[0].count)).toBeLessThanOrEqual(1);

    const credits = await query(
      `SELECT COUNT(*) FROM ledger_entries WHERE wallet_id = $1 AND type = 'CREDIT' AND description LIKE $2`,
      [walletId, `%${betId}%`],
    );
    expect(Number(credits.rows[0].count)).toBeLessThanOrEqual(1);
  });

  it('duplicate settlement attempts → one payout only', async () => {
    const betId = `b_dupsettle_${Date.now()}`;
    await query(
      `INSERT INTO bets (bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds, potential_payout, status)
       VALUES ($1, $2, $3, $4, $5, 50.00, 2.00, 2.00, 100.00, 'ACCEPTED')`,
      [betId, userId, matchId, marketId, selectionId],
    );

    const matchState = { matchId, status: 'COMPLETED', __forcedOutcome: 'WON' };
    const [a, b] = await Promise.all([
      betSettlementEngine.settleSingleBet({ betId, matchState }),
      betSettlementEngine.settleSingleBet({ betId, matchState }),
    ]);

    const settled = [a, b].filter((r) => r.status === 'SETTLED').length;
    const already = [a, b].filter((r) => r.status === 'ALREADY_SETTLED').length;
    expect(settled).toBe(1);
    expect(already).toBe(1);

    const wRes = await query('SELECT balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(600.00);
  });
});
