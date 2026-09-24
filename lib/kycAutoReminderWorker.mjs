/**
 * Auto-queue KYC reminders for players who deposited but have not completed KYC.
 */

import { query } from '../db/pg.js';
import { logger } from './logger.mjs';
import { SUCCESSFUL_DEPOSIT_STATUS_SQL } from './depositStatuses.mjs';

const ENABLED = String(process.env.KYC_AUTO_REMINDER_ENABLED || 'true').toLowerCase() !== 'false';
const LOOKBACK_DAYS = Math.max(1, parseInt(process.env.KYC_AUTO_REMINDER_LOOKBACK_DAYS || '14', 10) || 14);

export async function enqueueAutoKycReminders({ limit = 20 } = {}) {
  if (!ENABLED) return { queued: 0, disabled: true };

  const lim = Math.min(50, Math.max(1, Number(limit) || 20));
  const res = await query(
    `SELECT DISTINCT u.user_id
     FROM users u
     JOIN deposits d ON d.user_id = u.user_id
       AND UPPER(COALESCE(d.status, '')) IN (${SUCCESSFUL_DEPOSIT_STATUS_SQL})
       AND d.created_at >= NOW() - ($1::text || ' days')::interval
     LEFT JOIN user_profiles p ON p.user_id = u.user_id
     WHERE COALESCE(UPPER(p.kyc_status), 'NOT_STARTED') NOT IN ('APPROVED', 'VERIFIED', 'COMPLETED')
       AND u.email IS NOT NULL AND u.email <> ''
     ORDER BY u.user_id
     LIMIT $2`,
    [String(LOOKBACK_DAYS), lim],
  );

  const { queueKycReminderForUser } = await import('./kycReminder.mjs');
  let queued = 0;
  let skipped = 0;
  for (const row of res.rows || []) {
    try {
      await queueKycReminderForUser({
        userId: row.user_id,
        adminId: 'system_auto_kyc',
        idempotencyKey: `auto_kyc_${row.user_id}_${new Date().toISOString().slice(0, 10)}`,
      });
      queued += 1;
    } catch (err) {
      skipped += 1;
      if (!['KYC_ALREADY_COMPLETED', 'KYC_REMINDER_COOLDOWN', 'EMAIL_MISSING'].includes(err.code)) {
        logger.warn('auto_kyc_queue_failed', { userId: row.user_id, error: err.message });
      }
    }
  }
  return { queued, skipped, candidates: res.rows.length };
}
