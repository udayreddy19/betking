import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../lib/oddsQuoteService.mjs', () => ({
  resolveServerOdds: vi.fn(async ({ clientOdds }) => Number(clientOdds) || 1.8),
}));

import { betPlacementEngine } from '../../lib/betPlacementEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 5 Concurrency Stress & Load Tests', () => {
  const stressUserId = 'usr_stress_100';
  const stressWalletId = 'w_stress_100';
  const matchId = 'm_stress_101';
  const marketId = 'mkt_stress_101';
  const selectionId = 'sel_stress_101';

  beforeEach(async () => {
    await query(`ALTER TABLE bets ADD COLUMN IF NOT EXISTS vip_boost_pct NUMERIC(5,2) DEFAULT 0`);
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [stressUserId, `${stressUserId}@example.com`]);
    await query(`DELETE FROM ledger_entries WHERE wallet_id IN (SELECT wallet_id FROM wallets WHERE user_id = $1);`, [stressUserId]);
    await query(`DELETE FROM bets WHERE user_id = $1;`, [stressUserId]);
    await query(`DELETE FROM wallets WHERE user_id = $1;`, [stressUserId]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, currency) VALUES ($1, $2, 10000.00, 'INR');`, [stressWalletId, stressUserId]);
    await query(`INSERT INTO matches (match_id, status) VALUES ($1, 'LIVE') ON CONFLICT (match_id) DO NOTHING;`, [matchId]);
    await query(`INSERT INTO markets (market_id, match_id, name, status) VALUES ($1, $2, 'Winner', 'OPEN') ON CONFLICT (market_id) DO UPDATE SET status = 'OPEN';`, [marketId, matchId]);
    await query(`INSERT INTO selections (selection_id, market_id, name, odds, status) VALUES ($1, $2, 'Team A', 1.80, 'OPEN') ON CONFLICT (selection_id) DO UPDATE SET odds = 1.80, status = 'OPEN';`, [selectionId, marketId]);
  });

  it('STRESS LOAD: 100 concurrent ₹150.00 bet placement requests on ₹10,000 balance -> exact balance consistency & zero negative balance', async () => {
    // 100 requests of ₹150.00 each = ₹15,000 total requested stake on ₹10,000 balance
    // Exactly 66 bets should succeed (₹9,900.00 total debited), leaving ₹100.00 balance, and 34 bets rejected with INSUFFICIENT_BALANCE!

    const runTag = Date.now();
    const reqPromises = [];
    for (let i = 0; i < 100; i++) {
      reqPromises.push(
        betPlacementEngine.placeBet({
          userId: stressUserId,
          matchId,
          marketId,
          selectionId,
          stake: 150.00,
          clientOdds: 1.80,
          idempotencyKey: `stress_key_${runTag}_${i}`,
        })
      );
    }

    const results = await Promise.allSettled(reqPromises);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    const debugWRes = await query('SELECT balance FROM wallets WHERE user_id = $1', [stressUserId]);

    expect(fulfilled.length).toBe(66);
    expect(rejected.length).toBe(34);

    const wRes = await query('SELECT balance FROM wallets WHERE wallet_id = $1', [stressWalletId]);
    const finalBalance = parseFloat(wRes.rows[0].balance);
    expect(finalBalance).toBe(100.00);

    // Verify exactly 66 bet records created
    const bRes = await query('SELECT COUNT(*) FROM bets WHERE user_id = $1 AND status = \'ACCEPTED\'', [stressUserId]);
    expect(parseInt(bRes.rows[0].count)).toBe(66);
  });
});
