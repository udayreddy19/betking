import { describe, it, expect, beforeEach } from 'vitest';
import { addLoyaltyPoints, getLoyaltyStatus } from '../../lib/loyaltyEngine.mjs';
import { createCustomerSegment, addUserToSegment, evaluateUserSegments } from '../../lib/crmEngine.mjs';
import { executeCrmCampaign } from '../../lib/crmCampaignExecutionWorker.mjs';
import { createPromotion } from '../../lib/promotionsEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 10 Loyalty Points & CRM Campaign Execution Tests', () => {
  const userId = 'usr_loyalty_crm_101';
  let promoCode = `PROMO_CRM_${Date.now()}`;

  beforeEach(async () => {
    promoCode = `PROMO_CRM_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userId, `${userId}@example.com`]);
    await query(`INSERT INTO user_profiles (user_id, account_status, kyc_status) VALUES ($1, 'ACTIVE', 'VERIFIED') ON CONFLICT (user_id) DO NOTHING;`, [userId]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, currency) VALUES ($1, $2, 5000.00, 0.00, 'INR') ON CONFLICT (wallet_id) DO NOTHING;`, [`wal_${userId}`, userId]);

    await query(`DELETE FROM user_loyalty WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM user_segment_memberships WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM user_bonuses WHERE user_id = $1;`, [userId]);

    await createPromotion({
      name: 'CRM Campaign Promo',
      code: promoCode,
      type: 'DEPOSIT_BONUS',
      budget: 50000.00,
      maxReward: 100.00,
    });
  });

  it('Loyalty Points & Tier Progression -> awards points and progresses tier to SILVER/GOLD/PLATINUM', async () => {
    const res1 = await addLoyaltyPoints(userId, 600); // 600 points -> SILVER
    expect(res1.tier).toBe('SILVER');

    const res2 = await addLoyaltyPoints(userId, 10000); // 10,600 points -> PLATINUM
    expect(res2.tier).toBe('PLATINUM');

    const status = await getLoyaltyStatus(userId);
    expect(status.points).toBe(10600);
    expect(status.tier).toBe('PLATINUM');
  });

  it('CRM Campaign Execution -> evaluates segment and allocates campaign promo bonus', async () => {
    const segRes = await createCustomerSegment({ name: 'ACTIVE_BETTOR_TEST', description: 'Active bettors' });
    await addUserToSegment(userId, segRes.segmentId);

    const execRes = await executeCrmCampaign({
      campaignId: `camp_${Date.now()}`,
      segmentName: 'ACTIVE_BETTOR_TEST',
      rewardPromoCode: promoCode,
    });

    expect(execRes.success).toBe(true);
    expect(execRes.executedCount).toBe(1);

    const dbBonuses = await query('SELECT * FROM user_bonuses WHERE user_id = $1', [userId]);
    expect(dbBonuses.rows.length).toBe(1);
    expect(dbBonuses.rows[0].status).toBe('ACTIVE');
  });
});
