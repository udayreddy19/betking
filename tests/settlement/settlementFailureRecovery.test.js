import { describe, it, expect, beforeEach } from 'vitest';
import { betSettlementEngine } from '../../lib/betSettlementEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 7 Failure Recovery & Intermediate Score Protection Tests', () => {
  const userId = 'usr_sfail_101';
  const walletId = 'w_sfail_101';
  const matchId = 'm_sfail_101';
  const marketId = 'mkt_sfail_101';
  const selectionId = 'sel_sfail_101';

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userId, `${userId}@example.com`]);
    await query(`DELETE FROM ledger_entries WHERE wallet_id IN (SELECT wallet_id FROM wallets WHERE user_id = $1);`, [userId]);
    await query(`DELETE FROM bets WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM transactions WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM wallets WHERE user_id = $1;`, [userId]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, currency) VALUES ($1, $2, 0.00, 'INR');`, [walletId, userId]);
    await query(`INSERT INTO matches (match_id, status) VALUES ($1, 'LIVE') ON CONFLICT (match_id) DO UPDATE SET status = 'LIVE';`, [matchId]);
    await query(`INSERT INTO markets (market_id, match_id, name, status) VALUES ($1, $2, 'Winner', 'OPEN') ON CONFLICT (market_id) DO UPDATE SET status = 'OPEN';`, [marketId, matchId]);
    await query(`INSERT INTO selections (selection_id, market_id, name, odds, status) VALUES ($1, $2, 'Team A', 2.00, 'OPEN') ON CONFLICT DO NOTHING;`, [selectionId, marketId]);
  });

  it('CRITICAL: intermediate LIVE match status must REJECT settlement and leave wallet untouched', async () => {
    const betId = `b_live_${Date.now()}`;
    await query(`INSERT INTO bets (bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds, potential_payout, status) VALUES ($1, $2, $3, $4, $5, 100.00, 2.00, 2.00, 200.00, 'ACCEPTED');`, [betId, userId, matchId, marketId, selectionId]);

    const liveMatchState = {
      matchId,
      status: 'LIVE', // In-play score
      winnerId: selectionId,
    };

    await expect(betSettlementEngine.settleSingleBet({ betId, matchState: liveMatchState }))
      .rejects.toThrow('MATCH_NOT_FINAL');

    // Verify wallet balance remains ₹0.00
    const wRes = await query('SELECT balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(0.00);

    // Verify bet status remains ACCEPTED
    const bRes = await query('SELECT status FROM bets WHERE bet_id = $1', [betId]);
    expect(bRes.rows[0].status).toBe('ACCEPTED');
  });
});
