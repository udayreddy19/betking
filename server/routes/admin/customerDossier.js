/**
 * Customer dossier actions — ticket create, unrestrict, wallet adjust request,
 * notification broadcast, PII view audit, ops observability.
 */
import { Router } from 'express';
import { logAdminAction } from '../../middleware/auditLogger.js';

const router = Router();

const PII_ROLES = new Set([
  'SUPER_ADMIN',
  'SUPPORT_AGENT',
  'RISK_ANALYST',
  'OPERATIONS_ADMIN',
]);

export function adminCanViewFullPii(admin) {
  const role = String(admin?.role || admin?.activeRole || '').toUpperCase();
  return !role || role === 'SUPER_ADMIN' || PII_ROLES.has(role);
}

router.post('/customers/:id/unrestrict', async (req, res) => {
  const { id } = req.params;
  const reason = String(req.body?.reason || 'Admin unrestrict').slice(0, 500);
  try {
    const { releaseAccount } = await import('../../../lib/accountRestrictionEngine.mjs');
    await releaseAccount({
      userId: id,
      actorId: req.admin?.id || 'admin',
      reason,
    });
    await logAdminAction({
      actorId: req.admin?.id || 'admin',
      targetId: id,
      action: 'ACCOUNT_UNRESTRICTED',
      details: { reason },
    });
    res.json({ success: true, userId: id, status: 'ACTIVE' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/support/conversations', async (req, res) => {
  const userId = String(req.body?.userId || '').trim();
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  const subject = String(req.body?.subject || 'Admin outreach').slice(0, 200);
  const category = String(req.body?.category || 'General').slice(0, 64);
  const initialMessage = String(
    req.body?.message
      || `Ticket opened by admin ${req.admin?.email || req.admin?.id || 'admin'} regarding your account.`,
  ).slice(0, 4000);
  try {
    const { supportEngine } = await import('../../../lib/supportEngine.mjs');
    const result = await supportEngine.startConversation({
      userId,
      subject,
      category,
      priority: req.body?.priority || 'HIGH',
      initialMessage,
      bypassDuplicateCheck: true,
      relatedEntityType: 'admin_user',
      relatedEntityId: req.admin?.id || null,
    });
    await logAdminAction({
      actorId: req.admin?.id || 'admin',
      targetId: userId,
      action: 'SUPPORT_TICKET_CREATED',
      details: {
        conversationId: result.conversationId || result.conversation?.conversationId,
        subject,
        category,
      },
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/customers/:id/wallet-adjust-request', async (req, res) => {
  const userId = req.params.id;
  const amount = Number(req.body?.amount);
  const direction = String(req.body?.direction || 'CREDIT').toUpperCase() === 'DEBIT' ? 'DEBIT' : 'CREDIT';
  const reason = String(req.body?.reason || '').trim();
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  if (!reason) return res.status(400).json({ error: 'reason is required' });
  try {
    const { makerCheckerEngine } = await import('../../../lib/makerCheckerEngine.mjs');
    const actionType = direction === 'DEBIT' ? 'MANUAL_DEBIT' : 'MANUAL_CREDIT';
    const result = await makerCheckerEngine.submitRequest({
      actionType,
      targetEntityType: 'user',
      targetEntityId: userId,
      requestPayload: { userId, amount, direction: direction.toLowerCase(), reason },
      makerId: req.admin?.id || 'admin',
    });
    await logAdminAction({
      actorId: req.admin?.id || 'admin',
      targetId: userId,
      action: 'WALLET_ADJUST_REQUESTED',
      details: { amount, direction, reason, requestId: result.requestId },
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/users/:userId/pii-view', async (req, res) => {
  const { userId } = req.params;
  if (!adminCanViewFullPii(req.admin)) {
    return res.status(403).json({ error: 'Insufficient role to view full PII' });
  }
  try {
    await logAdminAction({
      actorId: req.admin?.id || 'admin',
      targetId: userId,
      action: 'PII_VIEWED',
      details: { fields: req.body?.fields || ['pan', 'aadhaar'], role: req.admin?.role },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/communications/broadcast', async (req, res) => {
  const role = String(req.admin?.role || '').toUpperCase();
  if (role && role !== 'SUPER_ADMIN' && role !== 'MARKETING_ADMIN' && role !== 'OPERATIONS_ADMIN') {
    return res.status(403).json({ error: 'Broadcast requires marketing or super admin' });
  }
  const title = String(req.body?.title || 'Announcement').slice(0, 200);
  const message = String(req.body?.message || '').trim().slice(0, 4000);
  if (!message) return res.status(400).json({ error: 'message is required' });
  const category = String(req.body?.category || 'TRANSACTIONAL').toUpperCase() === 'PROMOTIONAL'
    ? 'PROMOTIONAL'
    : 'TRANSACTIONAL';
  const limit = Math.min(Number(req.body?.limit) || 500, 2000);
  try {
    const { query } = await import('../../../db/pg.js');
    const { dispatchNotificationEvent } = await import('../../../lib/notificationEngine.mjs');
    const users = await query(
      `SELECT user_id FROM users ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    const eventId = `broadcast_${Date.now()}`;
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const row of users.rows) {
      try {
        const r = await dispatchNotificationEvent({
          eventId: `${eventId}_${row.user_id}`,
          eventType: 'ADMIN_BROADCAST',
          userId: row.user_id,
          category,
          channel: 'IN_APP',
          data: { title, message },
        });
        if (r?.skipped) skipped += 1;
        else sent += 1;
      } catch {
        failed += 1;
      }
    }
    await logAdminAction({
      actorId: req.admin?.id || 'admin',
      targetId: 'broadcast',
      action: 'NOTIFICATION_BROADCAST',
      details: { title, category, sent, skipped, failed, limit },
    });
    res.json({ success: true, sent, skipped, failed, total: users.rows.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/ops/observability', async (req, res) => {
  try {
    const { query } = await import('../../../db/pg.js');
    const [settlement, deposits, placement, outbox] = await Promise.all([
      query(
        `SELECT
           COUNT(*) FILTER (WHERE UPPER(status) IN ('PENDING','RETRY','AWAITING_EVIDENCE','PROCESSING'))::int AS open_jobs,
           COUNT(*) FILTER (WHERE UPPER(status) IN ('FAILED','DEAD_LETTER'))::int AS failed_jobs,
           COUNT(*) FILTER (WHERE UPPER(status) = 'COMPLETED' AND updated_at > NOW() - INTERVAL '15 minutes')::int AS completed_15m
         FROM settlement_jobs`,
      ).catch(() => ({ rows: [{}] })),
      query(
        `SELECT
           COUNT(*) FILTER (WHERE UPPER(status) IN ('CREATED','PENDING','INITIATED') AND created_at > NOW() - INTERVAL '1 hour')::int AS pending_1h,
           COUNT(*) FILTER (WHERE UPPER(status) IN ('CAPTURED','SUCCESS','COMPLETED') AND updated_at > NOW() - INTERVAL '15 minutes')::int AS captured_15m
         FROM deposits`,
      ).catch(() => ({ rows: [{}] })),
      query(
        `SELECT COUNT(*)::int AS open_bets
         FROM bets WHERE UPPER(status) IN ('PENDING','ACCEPTED','OPEN')`,
      ).catch(() => ({ rows: [{}] })),
      query(
        `SELECT
           COUNT(*) FILTER (WHERE UPPER(status) = 'PENDING')::int AS pending,
           COUNT(*) FILTER (WHERE UPPER(status) IN ('FAILED','DEAD_LETTER'))::int AS failed
         FROM outbox_events`,
      ).catch(() => ({ rows: [{}] })),
    ]);

    const s = settlement.rows[0] || {};
    const d = deposits.rows[0] || {};
    const alerts = [];
    if (Number(s.failed_jobs || 0) > 0) {
      alerts.push({ severity: 'high', code: 'SETTLEMENT_FAILED', message: `${s.failed_jobs} failed/dead-letter settlement jobs` });
    }
    if (Number(s.open_jobs || 0) > 20) {
      alerts.push({ severity: 'medium', code: 'SETTLEMENT_BACKLOG', message: `${s.open_jobs} open settlement jobs` });
    }
    if (Number(s.completed_15m || 0) === 0 && Number(s.open_jobs || 0) > 0) {
      alerts.push({ severity: 'high', code: 'SETTLEMENT_STALLED', message: 'Open settlement jobs but none completed in 15 minutes' });
    }
    if (Number(d.pending_1h || 0) > 10) {
      alerts.push({ severity: 'medium', code: 'DEPOSIT_PENDING', message: `${d.pending_1h} deposits pending in last hour` });
    }

    res.json({
      success: true,
      settlement: s,
      deposits: d,
      betting: placement.rows[0] || {},
      outbox: outbox.rows[0] || {},
      alerts,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
export { PII_ROLES };
