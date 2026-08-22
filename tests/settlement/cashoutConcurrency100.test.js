import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../lib/oddsQuoteService.mjs', () => ({
  resolveServerOdds: vi.fn(async () => ({ odds: 1.5, changed: false })),
  unwrapServerOddsQuote: (q) => (q?.odds != null ? Number(q.odds) : Number(q)),
}));

vi.mock('../../lib/cashoutPricing.mjs', () => ({
  priceCashoutFromV3Snapshot: vi.fn(async ({ stake }) => ({
    available: true,
    cashoutValue: Number((Number(stake) * 0.9).toFixed(2)),
    fairCashout: Number((Number(stake) * 0.94).toFixed(2)),
    currentLegs: [],
  })),
}));

import { executeBetCashout } from '../../lib/cashoutEngine.mjs';
import { query } from '../../db/pg.js';

describe('cashout concurrency — exactly one success', () => {
  const userId = 'usr_cash_100';
  const walletId = 'wal_cash_100';
  const matchId = 'm_cash_100';
  const marketId = 'match_winner';
  const selectionId = 'home_cash_100';

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT DO NOTHING`, [userId, `${userId}@t.com`]);
    await query(`DELETE FROM ledger_entries WHERE wallet_id = $1`, [walletId]);
    await query(`DELETE FROM bets WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM transactions WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM wallets WHERE user_id = $1`, [userId]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, currency) VALUES ($1, $2, 1000, 'INR')`, [walletId, userId]);
    await query(`INSERT INTO matches (match_id, status) VALUES ($1, 'IN_PLAY') ON CONFLICT (match_id) DO UPDATE SET status = 'IN_PLAY'`, [matchId]);
    await query(`INSERT INTO markets (market_id, match_id, name, status) VALUES ($1, $2, 'Winner', 'OPEN') ON CONFLICT (market_id) DO UPDATE SET status = 'OPEN'`, [marketId, matchId]);
    await query(
      `INSERT INTO selections (selection_id, market_id, name, odds, status) VALUES ($1, $2, 'Home', 2.00, 'OPEN') ON CONFLICT DO NOTHING`,
      [selectionId, marketId],
    );
  });

  it('10 simultaneous cashout requests → exactly 1 credit, 1 CASHED_OUT', async () => {
    const betId = `b_cash100_${Date.now()}`;
    await query(
      `INSERT INTO bets (bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds, potential_payout, status, fund_source)
       VALUES ($1, $2, $3, $4, $5, 100.00, 2.00, 2.00, 200.00, 'ACCEPTED', 'cash')`,
      [betId, userId, matchId, marketId, selectionId],
    );

    const attempts = Array.from({ length: 10 }, (_, i) =>
      executeBetCashout({
        betId,
        userId,
        idempotencyKey: `cashout_burst_${betId}_${i}`,
      }).then((r) => ({ ok: true, r })).catch((e) => ({ ok: false, error: e.message })),
    );

    const results = await Promise.all(attempts);
    const successes = results.filter((x) => x.ok && x.r?.status === 'CASHED_OUT');
    expect(successes.length).toBe(1);

    const bet = await query(`SELECT status, actual_payout FROM bets WHERE bet_id = $1`, [betId]);
    expect(String(bet.rows[0].status).toUpperCase()).toBe('CASHED_OUT');

    const credits = await query(
      `SELECT COUNT(*)::int AS c FROM ledger_entries WHERE wallet_id = $1 AND type = 'CREDIT' AND description LIKE $2`,
      [walletId, `%${betId}%`],
    );
    expect(credits.rows[0].c).toBe(1);

    const tx = await query(`SELECT COUNT(*)::int AS c FROM transactions WHERE transaction_id = $1`, [`tx_cashout_${betId}`]);
    expect(tx.rows[0].c).toBe(1);

    const w = await query(`SELECT balance FROM wallets WHERE wallet_id = $1`, [walletId]);
    expect(parseFloat(w.rows[0].balance)).toBe(1090); // 1000 + 90 cashout
  }, 60000);
});
