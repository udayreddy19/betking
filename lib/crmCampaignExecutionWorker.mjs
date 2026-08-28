import { query } from '../db/pg.js';
import { claimPromotionBonus } from './promotionsEngine.mjs';
import { canSendPromotionalEmail } from './notificationPreferencesEngine.mjs';

/**
 * Automated CRM Campaign Execution Worker
 * Evaluates target segments and allocates campaign promotions with idempotency protection.
 * Respects marketing opt-out before any promotional grant.
 */
export async function executeCrmCampaign({ campaignId, segmentName, rewardPromoCode }) {
  if (!campaignId || !rewardPromoCode) {
    throw new Error('Campaign ID and reward promotion code are required');
  }

  const campRes = await query(`SELECT * FROM crm_campaigns WHERE id = $1`, [campaignId]);
  if (campRes.rows.length === 0) {
    await query(
      `INSERT INTO crm_campaigns (id, name, segment, message, status, created_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', NOW())
       ON CONFLICT (id) DO NOTHING`,
      [campaignId, `Campaign ${campaignId}`, segmentName || 'NEW_USER', 'Claim your exclusive reward bonus now!'],
    );
  }

  const segRes = await query(
    `SELECT usm.user_id
     FROM user_segment_memberships usm
     JOIN customer_segments cs ON cs.id = usm.segment_id
     JOIN user_profiles up ON up.user_id = usm.user_id
     WHERE cs.name = $1 AND up.account_status = 'ACTIVE'`,
    [segmentName],
  );

  let executedCount = 0;
  let skippedOptOut = 0;
  const results = [];

  for (const row of segRes.rows) {
    try {
      const allowPromo = await canSendPromotionalEmail(row.user_id);
      if (!allowPromo) {
        skippedOptOut += 1;
        results.push({ userId: row.user_id, success: false, reason: 'marketing_opt_out', skipped: true });
        continue;
      }
      const claimResult = await claimPromotionBonus({
        userId: row.user_id,
        promoCode: rewardPromoCode,
        depositAmount: 1000.00,
      });
      executedCount += 1;
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
    skippedOptOut,
    totalTargeted: segRes.rows.length,
    results,
  };
}
