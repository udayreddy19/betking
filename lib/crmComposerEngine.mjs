/**
 * Minimal safe CRM campaign composer (preview / dry-run).
 * Server finalizes recipients. Frontend cannot bypass opt-out or inject recipient lists.
 * Uses existing notificationPreferencesEngine + emailService — no new preference tables.
 */

import { query } from '../db/pg.js';
import { canSendPromotionalEmail } from './notificationPreferencesEngine.mjs';

const MAX_PREVIEW = 200;
const MAX_RESOLVE = 2000;

/**
 * Preview recipients for segment include/exclude with marketing opt-out filtering.
 */
export async function previewCrmComposerAudience({
  includeSegmentIds = [],
  excludeSegmentIds = [],
  limit = 50,
} = {}) {
  const include = (Array.isArray(includeSegmentIds) ? includeSegmentIds : [])
    .map(String)
    .filter(Boolean)
    .slice(0, 20);
  if (include.length === 0) {
    const err = new Error('At least one include segment is required');
    err.status = 400;
    err.code = 'SEGMENT_REQUIRED';
    throw err;
  }
  const exclude = (Array.isArray(excludeSegmentIds) ? excludeSegmentIds : [])
    .map(String)
    .filter(Boolean)
    .slice(0, 20);
  const lim = Math.min(MAX_PREVIEW, Math.max(1, Number(limit) || 50));

  const params = [include];
  let sql = `
    SELECT DISTINCT usm.user_id
    FROM user_segment_memberships usm
    WHERE usm.segment_id = ANY($1::text[])
  `;
  if (exclude.length) {
    params.push(exclude);
    sql += ` AND usm.user_id NOT IN (
      SELECT user_id FROM user_segment_memberships WHERE segment_id = ANY($${params.length}::text[])
    )`;
  }
  sql += ` LIMIT ${Math.min(MAX_RESOLVE, 2000)}`;

  const res = await query(sql, params);
  const eligible = [];
  const optedOut = [];
  for (const row of res.rows) {
    // Cap preference checks
    if (eligible.length + optedOut.length >= lim + 50) break;
    const ok = await canSendPromotionalEmail(row.user_id);
    if (ok) eligible.push(row.user_id);
    else optedOut.push(row.user_id);
  }

  return {
    success: true,
    dryRun: true,
    includeSegmentIds: include,
    excludeSegmentIds: exclude,
    resolvedSample: eligible.slice(0, lim),
    eligibleCountSample: eligible.length,
    optedOutCountSample: optedOut.length,
    capped: true,
    maxResolve: MAX_RESOLVE,
    note: 'Server-side audience only. Opted-out users excluded. No wallet mutations. Dispatch uses existing emailService.',
  };
}

/**
 * Dry-run compose — records audit-ready payload without sending unless explicitly confirmed elsewhere.
 */
export async function dryRunCrmComposer({
  adminId,
  includeSegmentIds,
  excludeSegmentIds,
  templateSubject,
  templateBody,
}) {
  const audience = await previewCrmComposerAudience({ includeSegmentIds, excludeSegmentIds, limit: 25 });
  return {
    success: true,
    dryRun: true,
    adminId: adminId || null,
    templateSubject: templateSubject ? String(templateSubject).slice(0, 200) : null,
    templateBodyPreview: templateBody ? String(templateBody).slice(0, 500) : null,
    audience,
    dispatchStatus: 'DRY_RUN',
    failureCount: 0,
    mailer: 'server/auth/emailService.js',
    from: 'promos@oddsyra.com',
  };
}

export async function sendCrmComposer({
  adminId,
  includeSegmentIds,
  excludeSegmentIds,
  templateSubject,
  templateBody,
}) {
  if (!templateSubject || !templateBody) {
    const err = new Error('subject and body are required to send');
    err.status = 400;
    throw err;
  }
  const audience = await previewCrmComposerAudience({ includeSegmentIds, excludeSegmentIds, limit: 200 });
  const { sendPromotionalCampaignEmail } = await import('../server/auth/emailService.js');
  let sent = 0;
  let failed = 0;
  for (const userId of audience.resolvedSample) {
    try {
      const userRes = await query(`SELECT email, name FROM users WHERE user_id = $1`, [userId]);
      const email = userRes.rows[0]?.email;
      if (!email) {
        failed += 1;
        continue;
      }
      const ok = await canSendPromotionalEmail(userId);
      if (!ok) continue;
      await sendPromotionalCampaignEmail({
        email,
        name: userRes.rows[0]?.name,
        title: String(templateSubject).slice(0, 200),
        offerBody: String(templateBody).slice(0, 4000),
      });
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  return {
    success: true,
    dryRun: false,
    adminId: adminId || null,
    sent,
    failed,
    skippedOptOut: audience.optedOutCountSample,
    dispatchStatus: 'SENT',
    audience,
  };
}
