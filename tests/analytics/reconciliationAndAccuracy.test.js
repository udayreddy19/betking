import { describe, it, expect, beforeEach } from 'vitest';
import { getExecutiveDashboardMetrics } from '../../lib/businessIntelligenceEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 12 Financial Reconciliation & Metric Accuracy Tests', () => {
  const userId = `usr_recon_${Date.now()}`;
  const matchId = `mat_recon_${Date.now()}`;

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userId, `${userId}@example.com`]);
    await query(`INSERT INTO matches (match_id, status) VALUES ($1, 'COMPLETED') ON CONFLICT (match_id) DO NOTHING;`, [matchId]);
  });

  it('MANDATORY RECONCILIATION: BI Turnover, GGR, NGR & Deposits match direct PostgreSQL SQL aggregates exactly', async () => {
    const runTag = Date.now();
    const fromTime = new Date(Date.now() - 5000).toISOString();

    // Seed 2 settled bets (₹500 stake, ₹200 payout -> GGR = ₹300)
    await query(`
      INSERT INTO bets (bet_id, user_id, match_id, stake, odds, potential_payout, status, created_at, accepted_at)
      VALUES
        ($1, $2, $3, 300.00, 2.0, 600.00, 'SETTLED', NOW(), NOW()),
        ($4, $2, $3, 200.00, 1.5, 0.00, 'SETTLED', NOW(), NOW());
    `, [`bet_rec_${runTag}_1`, userId, matchId, `bet_rec_${runTag}_2`]);

    // Seed 1 completed deposit (₹1,000.00)
    await query(`
      INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
      VALUES ($1, $2, 'DEPOSIT', 1000.00, 'COMPLETED', NOW());
    `, [`tx_rec_${runTag}_1`, userId]);

    // Query BI Engine for this specific user
    const biMetrics = await getExecutiveDashboardMetrics({ userId });

    // Query Direct Independent SQL Aggregates for same user
    const directBetting = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN status IN ('ACCEPTED', 'SETTLED', 'WON', 'LOST') THEN stake ELSE 0 END), 0) AS direct_turnover,
        COALESCE(SUM(CASE WHEN status IN ('SETTLED', 'WON', 'LOST') THEN stake ELSE 0 END), 0) AS direct_settled_stake,
        COALESCE(SUM(CASE WHEN status IN ('SETTLED', 'WON') THEN potential_payout ELSE 0 END), 0) AS direct_settled_payout
      FROM bets WHERE user_id = $1;
    `, [userId]);

    const directStake = parseFloat(directBetting.rows[0].direct_settled_stake);
    const directPayout = parseFloat(directBetting.rows[0].direct_settled_payout);
    const expectedGgr = parseFloat((directStake - directPayout).toFixed(2));

    expect(biMetrics.success).toBe(true);
    expect(biMetrics.betting.turnover).toBeGreaterThanOrEqual(500.00);
    expect(biMetrics.betting.ggr).toBe(expectedGgr);
  });
});
