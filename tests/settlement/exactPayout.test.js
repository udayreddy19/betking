import { describe, it, expect, beforeEach } from 'vitest';
import { betSettlementEngine } from '../../lib/betSettlementEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 7 Exact Payout Acceptance Tests', () => {
  const userId = 'usr_pay_101';
  const walletId = 'w_pay_101';
  const matchId = 'm_pay_101';
  const marketId = 'mkt_pay_101';

  beforeEach(async () => {
    await query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS winnings_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00`);
    await query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS locked_deposit_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00`);
    await query(`ALTER TABLE bets ADD COLUMN IF NOT EXISTS stake_from_locked NUMERIC(14,2) NOT NULL DEFAULT 0.00`);
    await query(`ALTER TABLE bets ADD COLUMN IF NOT EXISTS stake_from_winnings NUMERIC(14,2) NOT NULL DEFAULT 0.00`);
    await query(`ALTER TABLE bets ADD COLUMN IF NOT EXISTS stake_from_cash NUMERIC(14,2) NOT NULL DEFAULT 0.00`);
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userId, `${userId}@example.com`]);
    await query(`DELETE FROM ledger_entries WHERE wallet_id IN (SELECT wallet_id FROM wallets WHERE user_id = $1);`, [userId]);
    await query(`DELETE FROM bets WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM transactions WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM wallets WHERE user_id = $1;`, [userId]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, currency) VALUES ($1, $2, 0.00, 'INR');`, [walletId, userId]);
    await query(`INSERT INTO matches (match_id, status) VALUES ($1, 'COMPLETED') ON CONFLICT (match_id) DO UPDATE SET status = 'COMPLETED';`, [matchId]);
    await query(`INSERT INTO markets (market_id, match_id, name, status) VALUES ($1, $2, 'Winner', 'OPEN') ON CONFLICT (market_id) DO UPDATE SET status = 'OPEN';`, [marketId, matchId]);
  });

  const testCases = [
    { stake: 10.00, odds: 1.10, expectedPayout: 11.00 },
    { stake: 100.00, odds: 1.50, expectedPayout: 150.00 },
    { stake: 100.00, odds: 2.00, expectedPayout: 200.00 },
    { stake: 100.00, odds: 2.50, expectedPayout: 250.00 },
    { stake: 1000.00, odds: 10.00, expectedPayout: 10000.00 },
  ];

  for (const tc of testCases) {
    it(`EXACT PAYOUT: Stake ₹${tc.stake} x Odds ${tc.odds} -> Exactly ₹${tc.expectedPayout} credited`, async () => {
      const betId = `bet_tc_${tc.stake}_${tc.odds}_${Date.now()}`;
      const selectionId = `sel_home_${Date.now()}`;
      await query(`INSERT INTO selections (selection_id, market_id, name, odds, status) VALUES ($1, $2, 'Home', $3, 'OPEN') ON CONFLICT DO NOTHING;`, [selectionId, marketId, tc.odds]);
      await query(`INSERT INTO bets (bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds, potential_payout, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, 'ACCEPTED');`, [betId, userId, matchId, marketId, selectionId, tc.stake, tc.odds, tc.expectedPayout]);

      const matchState = {
        matchId,
        status: 'COMPLETED',
        winnerId: selectionId,
        homeTeam: { teamId: selectionId },
        awayTeam: { teamId: 'away_team' },
      };

      const result = await betSettlementEngine.settleSingleBet({ betId, matchState });

      expect(result.status).toBe('SETTLED');
      expect(result.outcome).toBe('WON');
      expect(result.payout).toBe(tc.expectedPayout);

      const wRes = await query('SELECT balance, COALESCE(winnings_balance, 0) AS winnings_balance FROM wallets WHERE wallet_id = $1', [walletId]);
      expect(parseFloat(wRes.rows[0].balance)).toBe(tc.expectedPayout);
      expect(parseFloat(wRes.rows[0].winnings_balance)).toBe(parseFloat((tc.expectedPayout - tc.stake).toFixed(2)));

      await query('UPDATE wallets SET balance = 0.00, winnings_balance = 0.00 WHERE wallet_id = $1', [walletId]);
    });
  }

  it('LOST bet -> Exactly ₹0.00 payout and wallet balance remains ₹0.00', async () => {
    const betId = `bet_lost_${Date.now()}`;
    const selectionId = `sel_away_${Date.now()}`;
    await query(`INSERT INTO selections (selection_id, market_id, name, odds, status) VALUES ($1, $2, 'Away', 2.00, 'OPEN') ON CONFLICT DO NOTHING;`, [selectionId, marketId]);
    await query(`INSERT INTO bets (bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds, potential_payout, status) VALUES ($1, $2, $3, $4, $5, 100.00, 2.00, 2.00, 200.00, 'ACCEPTED');`, [betId, userId, matchId, marketId, selectionId]);

    const matchState = {
      matchId,
      status: 'COMPLETED',
      winnerId: 'other_team',
      homeTeam: { teamId: 'other_team' },
      awayTeam: { teamId: selectionId },
    };

    const result = await betSettlementEngine.settleSingleBet({ betId, matchState });

    expect(result.status).toBe('SETTLED');
    expect(result.outcome).toBe('LOST');
    expect(result.payout).toBe(0.00);

    const wRes = await query('SELECT balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(0.00);
  });

  it('VOID bet -> Exactly ₹100.00 stake refunded to wallet', async () => {
    const betId = `bet_void_${Date.now()}`;
    const selectionId = `sel_void_${Date.now()}`;
    await query(`INSERT INTO selections (selection_id, market_id, name, odds, status) VALUES ($1, $2, 'Home', 1.80, 'OPEN') ON CONFLICT DO NOTHING;`, [selectionId, marketId]);
    await query(`INSERT INTO bets (bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds, potential_payout, status) VALUES ($1, $2, $3, $4, $5, 100.00, 1.80, 1.80, 180.00, 'ACCEPTED');`, [betId, userId, matchId, marketId, selectionId]);

    const matchState = {
      matchId,
      status: 'ABANDONED',
      winnerId: 'NO_RESULT',
    };

    const result = await betSettlementEngine.settleSingleBet({ betId, matchState });

    expect(result.status).toBe('SETTLED');
    expect(result.outcome).toBe('VOID');
    expect(result.payout).toBe(100.00);

    const wRes = await query('SELECT balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(100.00);
  });
});
