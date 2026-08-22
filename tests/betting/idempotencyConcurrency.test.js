import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../lib/oddsQuoteService.mjs', () => ({
  resolveServerOdds: vi.fn(async ({ clientOdds }) => ({
    odds: Number(clientOdds) || 1.9,
    changed: false,
    previousOdds: clientOdds != null ? Number(clientOdds) : null,
  })),
  unwrapServerOddsQuote: (quote) => (quote?.odds != null ? Number(quote.odds) : Number(quote)),
  loadLiveOddsSnapshot: vi.fn(async () => ({ status: 'OK', markets: [] })),
}));

import { betPlacementEngine } from '../../lib/betPlacementEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 5 Idempotency & Duplicate Request Tests', () => {
  const userId = 'usr_idem_101';
  const walletId = 'w_idem_101';
  const matchId = 'm_idem_101';
  const marketId = 'mkt_idem_101';
  const selectionId = 'sel_idem_101';

  beforeEach(async () => {
    await query(`ALTER TABLE bets ADD COLUMN IF NOT EXISTS vip_boost_pct NUMERIC(5,2) DEFAULT 0`);
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userId, `${userId}@example.com`]);
    await query(`DELETE FROM bets WHERE user_id = $1;`, [userId]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, currency) VALUES ($1, $2, 1000.00, 'INR') ON CONFLICT (wallet_id) DO UPDATE SET balance = 1000.00;`, [walletId, userId]);
    await query(`INSERT INTO matches (match_id, status) VALUES ($1, 'LIVE') ON CONFLICT (match_id) DO NOTHING;`, [matchId]);
    await query(`INSERT INTO markets (market_id, match_id, name, status) VALUES ($1, $2, 'Winner', 'OPEN') ON CONFLICT (market_id) DO UPDATE SET status = 'OPEN';`, [marketId, matchId]);
    await query(`INSERT INTO selections (selection_id, market_id, name, odds, status) VALUES ($1, $2, 'Team A', 1.90, 'OPEN') ON CONFLICT (selection_id) DO UPDATE SET odds = 1.90, status = 'OPEN';`, [selectionId, marketId]);
  });

  it('CRITICAL: simultaneous requests with same Idempotency-Key must produce ONE bet and ONE wallet debit', async () => {
    const key = `KEY_CONC_BET_${Date.now()}`;

    const results = await Promise.all([
      betPlacementEngine.placeBet({ userId, matchId, marketId, selectionId, stake: 300.00, clientOdds: 1.90, idempotencyKey: key }),
      betPlacementEngine.placeBet({ userId, matchId, marketId, selectionId, stake: 300.00, clientOdds: 1.90, idempotencyKey: key }),
    ]);

    // Check one is actual result, second is duplicate result
    const betsRes = await query('SELECT COUNT(*) FROM bets WHERE user_id = $1', [userId]);
    expect(parseInt(betsRes.rows[0].count)).toBe(1);

    const wRes = await query('SELECT balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(700.00); // Only ONE ₹300 debit
  });
});
