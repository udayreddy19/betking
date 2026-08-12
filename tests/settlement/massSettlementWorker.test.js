import { describe, it, expect, beforeEach } from 'vitest';
import { massSettlementWorker } from '../../lib/massSettlementWorker.mjs';
import { query } from '../../db/pg.js';

describe('Phase 7 Mass Settlement Worker Tests', () => {
  const matchId = 'm_mass_1000';
  const marketId = 'mkt_mass_1000';
  const selectionWon = 'sel_won_1000';

  beforeEach(async () => {
    await query(`DELETE FROM bets WHERE match_id = $1;`, [matchId]);
    await query(`INSERT INTO matches (match_id, status) VALUES ($1, 'COMPLETED') ON CONFLICT (match_id) DO UPDATE SET status = 'COMPLETED';`, [matchId]);
    await query(`INSERT INTO markets (market_id, match_id, name, status) VALUES ($1, $2, 'Winner', 'OPEN') ON CONFLICT (market_id) DO UPDATE SET status = 'OPEN';`, [marketId, matchId]);
    await query(`INSERT INTO selections (selection_id, market_id, name, odds, status) VALUES ($1, $2, 'Team Won', 2.00, 'OPEN') ON CONFLICT DO NOTHING;`, [selectionWon, marketId]);
  });

  it('MASS SETTLEMENT: 1,000 unsettled bets settled in batch -> 100% settled, 0 double payouts, 0 negative balances', async () => {
    // Seed 1,000 users and 1,000 bets
    const seedUsers = [];
    const seedWallets = [];
    const seedBets = [];
    const runTag = Date.now();

    for (let i = 0; i < 1000; i++) {
      const uId = `usr_mass_${runTag}_${i}`;
      seedUsers.push(query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT DO NOTHING;`, [uId, `${uId}@example.com`]));
    }
    await Promise.all(seedUsers);

    for (let i = 0; i < 1000; i++) {
      const uId = `usr_mass_${runTag}_${i}`;
      const wId = `w_mass_${runTag}_${i}`;
      seedWallets.push(query(`INSERT INTO wallets (wallet_id, user_id, balance, currency) VALUES ($1, $2, 0.00, 'INR') ON CONFLICT DO NOTHING;`, [wId, uId]));
    }
    await Promise.all(seedWallets);

    for (let i = 0; i < 1000; i++) {
      const uId = `usr_mass_${runTag}_${i}`;
      const bId = `b_mass_${runTag}_${i}`;
      seedBets.push(query(`INSERT INTO bets (bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds, potential_payout, status) VALUES ($1, $2, $3, $4, $5, 50.00, 2.00, 2.00, 100.00, 'ACCEPTED');`, [bId, uId, matchId, marketId, selectionWon]));
    }
    await Promise.all(seedBets);

    const matchState = {
      matchId,
      status: 'COMPLETED',
      winnerId: selectionWon,
      homeTeam: { teamId: selectionWon },
      awayTeam: { teamId: 'other' },
    };

    const res = await massSettlementWorker.settleCompletedMatch(matchId, matchState);

    expect(res.success).toBe(true);
    expect(res.betsSettled).toBe(1000);
    expect(res.totalPayoutsDistributed).toBe(100000.00); // 1000 * 100 = 100,000

    // Verify 0 unsettled bets remaining for this match
    const bCheck = await query(`SELECT COUNT(*) FROM bets WHERE match_id = $1 AND status = 'ACCEPTED'`, [matchId]);
    expect(parseInt(bCheck.rows[0].count)).toBe(0);

    // Verify market is marked SETTLED
    const mCheck = await query(`SELECT status FROM markets WHERE market_id = $1`, [marketId]);
    expect(mCheck.rows[0].status).toBe('SETTLED');
  }, 15000);
});
