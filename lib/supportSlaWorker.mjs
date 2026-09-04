/**
 * Support SLA reminder — emails support inbox when tickets approach/breach SLA.
 * Dedupes alerts in PostgreSQL so cooldown survives restart / multi-instance.
 */

import { query } from '../db/pg.js';

const ALERT_COOLDOWN_MINUTES = 30; // one email per ticket+status per 30m

/**
 * Atomically claim an alert slot. Returns true if this process should send.
 * Cooldown is durable via support_sla_alert_log.
 */
async function tryClaimAlert(conversationId, slaStatus) {
  try {
    const res = await query(
      `INSERT INTO support_sla_alert_log (conversation_id, sla_status, alerted_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (conversation_id, sla_status) DO UPDATE
         SET alerted_at = NOW()
         WHERE support_sla_alert_log.alerted_at < NOW() - ($3::text || ' minutes')::interval
       RETURNING conversation_id`,
      [conversationId, slaStatus, String(ALERT_COOLDOWN_MINUTES)],
    );
    return (res.rows || []).length > 0;
  } catch (err) {
    console.error('[SupportSla] claim', err.message);
    // Fail closed: do not spam if claim store is unavailable
    return false;
  }
}

export async function runSupportSlaReminderSweep({ limit = 40 } = {}) {
  let rows = [];
  try {
    const res = await query(
      `SELECT c.conversation_id, c.conversation_number, c.user_id, c.subject, c.category,
              c.priority, c.status, c.sla_due_at, u.email AS user_email
       FROM support_conversations c
       LEFT JOIN users u ON u.user_id = c.user_id
       WHERE UPPER(c.status) IN ('OPEN','ASSIGNED','IN_PROGRESS','PENDING_USER','PENDING_INTERNAL','ESCALATED','REOPENED')
         AND c.sla_due_at IS NOT NULL
         AND c.sla_due_at < NOW() + INTERVAL '15 minutes'
       ORDER BY c.sla_due_at ASC
       LIMIT $1`,
      [limit],
    );
    rows = res.rows || [];
  } catch (err) {
    console.error('[SupportSla] query', err.message);
    return { checked: 0, emailed: 0, errors: 1 };
  }

  let emailed = 0;
  let errors = 0;
  const now = Date.now();

  for (const row of rows) {
    const due = row.sla_due_at ? new Date(row.sla_due_at).getTime() : 0;
    if (!due) continue;
    const minsLeft = (due - now) / 60000;
    let slaStatus = null;
    if (minsLeft < 0) slaStatus = 'SLA_BREACHED';
    else if (minsLeft <= 15) slaStatus = 'APPROACHING_SLA';
    else continue;

    const id = row.conversation_id;
    const claimed = await tryClaimAlert(id, slaStatus);
    if (!claimed) continue;

    try {
      const { sendSupportSlaReminderEmail } = await import('../server/auth/emailService.js');
      const { notifyAdminSupportEvent } = await import('./supportNotify.mjs');
      await sendSupportSlaReminderEmail({
        ticketNumber: row.conversation_number,
        conversationId: id,
        userEmail: row.user_email,
        subject: row.subject,
        category: row.category,
        slaStatus,
        slaDueAt: row.sla_due_at ? new Date(row.sla_due_at).toISOString() : null,
      });
      await notifyAdminSupportEvent({
        title: `${slaStatus === 'SLA_BREACHED' ? 'SLA breached' : 'SLA soon'}: ${row.conversation_number || id}`,
        message: row.subject || 'Support ticket needs a reply',
        conversationId: id,
        priority: slaStatus === 'SLA_BREACHED' ? 'URGENT' : 'HIGH',
      });
      emailed += 1;
    } catch (err) {
      errors += 1;
      console.error('[SupportSla] alert', err.message);
    }
  }

  return { checked: rows.length, emailed, errors };
}
