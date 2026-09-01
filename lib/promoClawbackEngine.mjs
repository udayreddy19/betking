/**
 * Pause campaigns and request bonus clawback via maker-checker.
 * Never silently edits the ledger.
 */

import { query } from '../db/pg.js';
import { makerCheckerEngine } from './makerCheckerEngine.mjs';

export async function pausePromotionCampaign({ campaignId, adminId, reason }) {
  if (!campaignId) throw new Error('campaignId required');
  const note = String(reason || 'Paused by operator').slice(0, 500);
  const updated = await query(
    `UPDATE deposit_freebet_campaigns
     SET status = 'PAUSED', updated_at = NOW()
     WHERE id = $1
     RETURNING id, status`,
    [campaignId],
  ).catch(() => ({ rows: [] }));
  if (!updated.rows.length) {
    await query(
      `UPDATE promotions SET status = 'PAUSED', updated_at = NOW() WHERE id = $1 OR promo_code = $1`,
      [campaignId],
    ).catch(() => null);
  }
  return { success: true, campaignId, status: 'PAUSED', adminId, reason: note };
}

export async function requestPromoClawback({
  userId,
  amount,
  promoCode,
  adminId,
  reason,
}) {
  if (!userId || !(Number(amount) > 0)) {
    const err = new Error('userId and positive amount required');
    err.status = 400;
    throw err;
  }
  return makerCheckerEngine.submitRequest({
    actionType: 'BONUS_ADJUSTMENT',
    targetEntityType: 'user',
    targetEntityId: userId,
    makerId: adminId || 'admin',
    requestPayload: {
      direction: 'debit',
      amount: Number(amount),
      promoCode: promoCode || null,
      reason: String(reason || 'Promo clawback').slice(0, 500),
      policy: 'bonus_only_never_cash',
    },
  });
}
