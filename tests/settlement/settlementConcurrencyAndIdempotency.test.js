import { describe, it, expect, beforeEach } from 'vitest';
import { betSettlementEngine } from '../../lib/betSettlementEngine.mjs';
import { massSettlementWorker } from '../../lib/massSettlementWorker.mjs';
import { query } from '../../db/pg.js';

describe('Phase 7 Settlement Concurrency & Idempotency Tests', () => {
  const userId = 'usr_sconc_101';
  const walletId = 'w_sconc_101';
  const matchId = 'm_sconc_101';
  const marketId = 'mkt_sconc_101';
  const selectionId = 'sel_sconc_101';

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userId, `${userId}@example.com`]);
    await query(`DELETE FROM ledger_entries WHERE wallet_id IN (SELECT wallet_id FROM wallets WHERE user_id = $1);`, [userId]);
    await query(`DELETE FROM bets WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM transactions WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM wallets WHERE user_id = $1;`, [userId]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, currency) VALUES ($1, $2, 0.00, 'INR');`, [walletId, userId]);
    await query(`INSERT INTO matches (match_id, status) VALUES ($1, 'COMPLETED') ON CONFLICT (match_id) DO UPDATE SET status = 'COMPLETED';`, [matchId]);
    await query(`INSERT INTO markets (market_id, match_id, name, status) VALUES ($1, $2, 'Winner', 'OPEN') ON CONFLICT (market_id) DO UPDATE SET status = 'OPEN';`, [marketId, matchId]);
    await query(`INSERT INTO selections (selection_id, market_id, name, odds, status) VALUES ($1, $2, 'Team A', 2.00, 'OPEN') ON CONFLICT DO NOTHING;`, [selectionId, marketId]);
  });

  it('CRITICAL CONCURRENCY: simultaneous settlement workers on same match -> exactly ONE credits payout, 0 double payout', async () => {
    const betId = `b_sconc_${Date.now()}`;
    await query(`INSERT INTO bets (bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds, potential_payout, status) VALUES ($1, $2, $3, $4, $5, 200.00, 2.00, 2.00, 400.00, 'ACCEPTED');`, [betId, userId, matchId, marketId, selectionId]);

    const matchState = {
      matchId,
      status: 'COMPLETED',
      winnerId: selectionId,
      homeTeam: { teamId: selectionId },
      awayTeam: { teamId: 'other' },
    };

    // Run two simultaneous settlement calls
    const results = await Promise.all([
      betSettlementEngine.settleSingleBet({ betId, matchState }),
      betSettlementEngine.settleSingleBet({ betId, matchState }),
    ]);

    const settledResults = results.filter(r => r.status === 'SETTLED');
    const alreadySettledResults = results.filter(r => r.status === 'ALREADY_SETTLED');

    expect(settledResults.length).toBe(1);
    expect(alreadySettledResults.length).toBe(1);

    // Verify wallet balance is credited ONCE (₹400.00)
    const wRes = await query('SELECT balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(400.00);

    // Verify only ONE CREDIT ledger entry created
    const lRes = await query('SELECT COUNT(*) FROM ledger_entries WHERE wallet_id = $1', [walletId]);
    expect(parseInt(lRes.rows[0].count)).toBe(1);
  });

  it('IDEMPOTENCY: running mass settlement twice on completed match is completely safe', async () => {
    const betId = `b_idem_${Date.now()}`;
    await query(`INSERT INTO bets (bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds, potential_payout, status) VALUES ($1, $2, $3, $4, $5, 100.00, 2.00, 2.00, 200.00, 'ACCEPTED');`, [betId, userId, matchId, marketId, selectionId]);

    const matchState = {
      matchId,
      status: 'COMPLETED',
      winnerId: selectionId,
      homeTeam: { teamId: selectionId },
      awayTeam: { teamId: 'other' },
    };

    const res1 = await massSettlementWorker.settleCompletedMatch(matchId, matchState);
    expect(res1.betsSettled).toBe(1);

    const res2 = await massSettlementWorker.settleCompletedMatch(matchId, matchState);
    expect(res2.betsSettled).toBe(0); // Second run settles 0 bets!

    const wRes = await query('SELECT balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(200.00);
  }, 120000);
});
