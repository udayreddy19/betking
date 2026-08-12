import { query } from '../db/pg.js';
import { claimPromotionBonus } from './promotionsEngine.mjs';

/**
 * Automated CRM Campaign Execution Worker
 * Evaluates target segments and allocates campaign promotions with idempotency protection.
 */
export async function executeCrmCampaign({ campaignId, segmentName, rewardPromoCode }) {
  if (!campaignId || !rewardPromoCode) {
    throw new Error('Campaign ID and reward promotion code are required');
  }

  // Fetch campaign definition
  const campRes = await query(`SELECT * FROM crm_campaigns WHERE id = $1`, [campaignId]);
  if (campRes.rows.length === 0) {
    // Insert if campaign doesn't exist
    await query(
      `INSERT INTO crm_campaigns (id, name, segment, message, status, created_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', NOW())
       ON CONFLICT (id) DO NOTHING`,
      [campaignId, `Campaign ${campaignId}`, segmentName || 'NEW_USER', 'Claim your exclusive reward bonus now!']
    );
  }

  // Get eligible users from segment
  const segRes = await query(
    `SELECT usm.user_id
     FROM user_segment_memberships usm
     JOIN customer_segments cs ON cs.id = usm.segment_id
     JOIN user_profiles up ON up.user_id = usm.user_id
     WHERE cs.name = $1 AND up.account_status = 'ACTIVE'`,
    [segmentName]
  );

  let executedCount = 0;
  const results = [];

  for (const row of segRes.rows) {
    try {
      const claimResult = await claimPromotionBonus({
        userId: row.user_id,
        promoCode: rewardPromoCode,
        depositAmount: 1000.00,
      });
      executedCount++;
      results.push({ userId: row.user_id, success: true, bonusId: claimResult.bonusId });
    } catch (err) {
      results.push({ userId: row.user_id, success: false, reason: err.message });
    }
  }

  await query(`UPDATE crm_campaigns SET status = 'EXECUTED' WHERE id = $1`, [campaignId]);

  return {
    success: true,
    campaignId,
    segmentName,
    executedCount,
    totalTargeted: segRes.rows.length,
    results,
  };
}
