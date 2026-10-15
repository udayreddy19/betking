import { query } from '../db/pg.js';
import { claimPromotionBonus } from './promotionsEngine.mjs';
import { canSendPromotionalEmail } from './notificationPreferencesEngine.mjs';

/**
 * Automated CRM Campaign Execution Worker
 * Evaluates target segments and allocates campaign promotions with idempotency protection.
 * Respects marketing opt-out before any promotional grant.
 * Requires a real crm_campaigns row — never invents campaigns or fake deposit amounts.
 */
export async function executeCrmCampaign({ campaignId, segmentName, rewardPromoCode, depositAmount = null }) {
  if (!campaignId || !rewardPromoCode) {
    throw new Error('Campaign ID and reward promotion code are required');
  }

  const campRes = await query(`SELECT * FROM crm_campaigns WHERE id = $1`, [campaignId]);
  if (campRes.rows.length === 0) {
    throw new Error(`CRM campaign ${campaignId} not found — create the campaign before execution`);
  }

  const campaign = campRes.rows[0];
  const resolvedSegment = segmentName || campaign.segment;
  if (!resolvedSegment) {
    throw new Error('Campaign segment is required');
  }

  const stakeHint = depositAmount != null ? Number(depositAmount) : Number(campaign.deposit_amount);
  const claimDeposit = Number.isFinite(stakeHint) && stakeHint > 0 ? stakeHint : null;

  const segRes = await query(
    `SELECT usm.user_id
     FROM user_segment_memberships usm
     JOIN customer_segments cs ON cs.id = usm.segment_id
     JOIN user_profiles up ON up.user_id = usm.user_id
     WHERE cs.name = $1 AND up.account_status = 'ACTIVE'`,
    [resolvedSegment],
  );

  let executedCount = 0;
  let skippedOptOut = 0;
  let failedCount = 0;
  const results = [];

  for (const row of segRes.rows) {
    try {
      const allowPromo = await canSendPromotionalEmail(row.user_id);
      if (!allowPromo) {
        skippedOptOut += 1;
        results.push({ userId: row.user_id, success: false, reason: 'marketing_opt_out', skipped: true });
        continue;
      }
      const claimArgs = {
        userId: row.user_id,
        promoCode: rewardPromoCode,
      };
      if (claimDeposit != null) claimArgs.depositAmount = claimDeposit;
      const claimResult = await claimPromotionBonus(claimArgs);
      executedCount += 1;
      results.push({ userId: row.user_id, success: true, bonusId: claimResult.bonusId });
    } catch (err) {
      failedCount += 1;
      results.push({ userId: row.user_id, success: false, reason: err.message });
    }
  }

  await query(
    `UPDATE crm_campaigns
     SET status = 'EXECUTED',
         executed_at = NOW(),
         execution_metrics = $2::jsonb
     WHERE id = $1`,
    [campaignId, JSON.stringify({
      executedCount,
      skippedOptOut,
      failedCount,
      totalTargeted: segRes.rows.length,
      at: new Date().toISOString(),
    })],
  ).catch(async () => {
    await query(`UPDATE crm_campaigns SET status = 'EXECUTED' WHERE id = $1`, [campaignId]);
  });

  return {
    success: true,
    campaignId,
    segmentName: resolvedSegment,
    executedCount,
    skippedOptOut,
    failedCount,
    totalTargeted: segRes.rows.length,
    results,
  };
}
