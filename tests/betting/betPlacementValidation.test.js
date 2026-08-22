import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../lib/oddsQuoteService.mjs', () => ({
  resolveServerOdds: vi.fn(async ({ clientOdds }) => {
    const serverOdds = 1.85;
    const changed = clientOdds != null && Math.abs(Number(clientOdds) - serverOdds) / serverOdds > 0.02;
    return { odds: serverOdds, changed, previousOdds: clientOdds != null ? Number(clientOdds) : null };
  }),
  unwrapServerOddsQuote: (quote) => (quote?.odds != null ? Number(quote.odds) : Number(quote)),
}));

import { betPlacementEngine } from '../../lib/betPlacementEngine.mjs';
import { query } from '../../db/pg.js';
import { marketSuspensionEngine } from '../../lib/marketSuspensionEngine.mjs';

describe('Phase 5 Bet Placement Validation Tests', () => {
  const testUserId = 'usr_val_test_101';
  const walletId = 'w_val_test_101';
  const matchId = 'm_val_101';
  const marketId = 'mkt_val_101';
  const selectionId = 'sel_val_101';

  beforeEach(async () => {
    await marketSuspensionEngine.clearSuspensionCause(marketId, 'STALE_ODDS');
    await marketSuspensionEngine.clearSuspensionCause(marketId, 'MANUAL_ADMIN');
    await query(`ALTER TABLE bets ADD COLUMN IF NOT EXISTS vip_boost_pct NUMERIC(5,2) DEFAULT 0`);
    // Setup test user and wallet in DB
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [testUserId, `${testUserId}@example.com`]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, currency) VALUES ($1, $2, 1000.00, 'INR') ON CONFLICT (wallet_id) DO UPDATE SET balance = 1000.00;`, [walletId, testUserId]);
    await query(`INSERT INTO matches (match_id, status) VALUES ($1, 'LIVE') ON CONFLICT (match_id) DO NOTHING;`, [matchId]);
    await query(`INSERT INTO markets (market_id, match_id, name, status) VALUES ($1, $2, 'Winner', 'OPEN') ON CONFLICT (market_id) DO UPDATE SET status = 'OPEN';`, [marketId, matchId]);
    await query(`INSERT INTO selections (selection_id, market_id, name, odds, status) VALUES ($1, $2, 'Team A', 1.85, 'OPEN') ON CONFLICT (selection_id) DO UPDATE SET odds = 1.85, status = 'OPEN';`, [selectionId, marketId]);
  });

  it('should place a valid single bet server-authoritatively', async () => {
    const res = await betPlacementEngine.placeBet({
      userId: testUserId,
      matchId,
      marketId,
      selectionId,
      stake: 200.00,
      clientOdds: 1.85,
    });

    expect(res.success).toBe(true);
    expect(res.status).toBe('ACCEPTED');
    expect(res.stake).toBe(200.00);
    expect(res.acceptedOdds).toBe(1.85);
    expect(res.potentialPayout).toBe(370.00);
    expect(res.remainingBalance).toBe(800.00);
  });

  it('CRITICAL: suspended market must REJECT bet placement', async () => {
    await marketSuspensionEngine.addSuspensionCause(marketId, 'STALE_ODDS', 'SYSTEM');

    await expect(betPlacementEngine.placeBet({
      userId: testUserId,
      matchId,
      marketId,
      selectionId,
      stake: 100.00,
      clientOdds: 1.85,
    })).rejects.toThrow('MARKET_SUSPENDED');

    await marketSuspensionEngine.clearSuspensionCause(marketId, 'STALE_ODDS');
  });

  it('CRITICAL: restricted account state must REJECT bet placement', async () => {
    await query(`INSERT INTO user_account_controls (control_id, user_id, account_state) VALUES ('c_rest', $1, 'SUSPENDED') ON CONFLICT (user_id) DO UPDATE SET account_state = 'SUSPENDED';`, [testUserId]);

    await expect(betPlacementEngine.placeBet({
      userId: testUserId,
      matchId,
      marketId,
      selectionId,
      stake: 100.00,
      clientOdds: 1.85,
    })).rejects.toThrow('ACCOUNT_SUSPENDED');

    await query(`UPDATE user_account_controls SET account_state = 'ACTIVE' WHERE user_id = $1;`, [testUserId]);
  });

  it('accepts placement at server odds when client odds drift', async () => {
    const res = await betPlacementEngine.placeBet({
      userId: testUserId,
      matchId,
      marketId,
      selectionId,
      stake: 100.00,
      clientOdds: 2.50,
    });

    expect(res.success).toBe(true);
    expect(res.acceptedOdds).toBe(1.85);
    expect(res.oddsChanged).toBe(true);
    expect(res.oddsUpdates?.[0]?.previousOdds).toBe(2.5);
  });

  it('CRITICAL: invalid stake (<= 0 or > maxLimit) must REJECT bet placement', async () => {
    await expect(betPlacementEngine.placeBet({
      userId: testUserId,
      matchId,
      marketId,
      selectionId,
      stake: -50.00,
      clientOdds: 1.85,
    })).rejects.toThrow('INVALID_STAKE');
  });
});
