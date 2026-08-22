import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../lib/oddsQuoteService.mjs', () => ({
  resolveServerOdds: vi.fn(async ({ clientOdds }) => Number(clientOdds) || 2.0),
  unwrapServerOddsQuote: (quote) => (quote?.odds != null ? Number(quote.odds) : Number(quote)),
  loadLiveOddsSnapshot: vi.fn(async () => ({ status: 'OK', markets: [] })),
}));

import { betPlacementEngine } from '../../lib/betPlacementEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 5 Financial Concurrency & Wallet Locking Tests', () => {
  const userId500 = 'usr_conc_500';
  const walletId500 = 'w_conc_500';
  const matchId = 'm_conc_101';
  const marketId = 'mkt_conc_101';
  const selectionId = 'sel_conc_101';

  beforeEach(async () => {
    await query(`ALTER TABLE bets ADD COLUMN IF NOT EXISTS vip_boost_pct NUMERIC(5,2) DEFAULT 0`);
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userId500, `${userId500}@example.com`]);
    await query(`INSERT INTO matches (match_id, status) VALUES ($1, 'LIVE') ON CONFLICT (match_id) DO NOTHING;`, [matchId]);
    await query(`INSERT INTO markets (market_id, match_id, name, status) VALUES ($1, $2, 'Winner', 'OPEN') ON CONFLICT (market_id) DO UPDATE SET status = 'OPEN';`, [marketId, matchId]);
    await query(`INSERT INTO selections (selection_id, market_id, name, odds, status) VALUES ($1, $2, 'Team A', 2.00, 'OPEN') ON CONFLICT (selection_id) DO UPDATE SET odds = 2.00, status = 'OPEN';`, [selectionId, marketId]);
  });

  it('CRITICAL CONCURRENCY: ₹500 balance with 2 concurrent ₹400 bets -> ONE succeeds, ONE fails, balance = ₹100', async () => {
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, currency) VALUES ($1, $2, 500.00, 'INR') ON CONFLICT (wallet_id) DO UPDATE SET balance = 500.00;`, [walletId500, userId500]);

    // Submit two simultaneous ₹400 bet placement requests
    const results = await Promise.allSettled([
      betPlacementEngine.placeBet({ userId: userId500, matchId, marketId, selectionId, stake: 400.00, clientOdds: 2.00 }),
      betPlacementEngine.placeBet({ userId: userId500, matchId, marketId, selectionId, stake: 400.00, clientOdds: 2.00 }),
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(rejected[0].reason.message).toContain('INSUFFICIENT_BALANCE');

    // Verify database wallet balance is EXACTLY ₹100.00
    const wRes = await query('SELECT balance FROM wallets WHERE wallet_id = $1', [walletId500]);
    const finalBalance = parseFloat(wRes.rows[0].balance);
    expect(finalBalance).toBe(100.00);
  });

  it('CONCURRENCY: ₹800 balance with 2 concurrent ₹400 bets -> BOTH succeed, balance = ₹0', async () => {
    const userId800 = 'usr_conc_800';
    const walletId800 = 'w_conc_800';
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userId800, `${userId800}@example.com`]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, currency) VALUES ($1, $2, 800.00, 'INR') ON CONFLICT (wallet_id) DO UPDATE SET balance = 800.00;`, [walletId800, userId800]);

    const results = await Promise.allSettled([
      betPlacementEngine.placeBet({ userId: userId800, matchId, marketId, selectionId, stake: 400.00, clientOdds: 2.00 }),
      betPlacementEngine.placeBet({ userId: userId800, matchId, marketId, selectionId, stake: 400.00, clientOdds: 2.00 }),
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    expect(fulfilled.length).toBe(2);

    const wRes = await query('SELECT balance FROM wallets WHERE wallet_id = $1', [walletId800]);
    const finalBalance = parseFloat(wRes.rows[0].balance);
    expect(finalBalance).toBe(0.00);
  });
});
