import { Router } from 'express';
import { requirePermission } from '../../middleware/adminAuth.js';
import { query } from '../../../db/pg.js';

const router = Router();

// Ensure admin_notifications table exists
async function ensureAdminNotificationTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS admin_notifications (
        notification_id VARCHAR(64) PRIMARY KEY,
        admin_id VARCHAR(64) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        category VARCHAR(64) DEFAULT 'INFO',
        priority VARCHAR(16) DEFAULT 'NORMAL',
        action_type VARCHAR(64),
        action_target_type VARCHAR(64),
        action_target_id VARCHAR(128),
        action_label VARCHAR(64),
        is_read BOOLEAN DEFAULT FALSE,
        is_actioned BOOLEAN DEFAULT FALSE,
        action_note TEXT,
        tenant_id VARCHAR(64) DEFAULT 'oddsyra_in',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS action_note TEXT`).catch(() => {});
  } catch (ignored) {}
}

async function markNotificationActioned(notifId, adminId, action, note) {
  const actionNote = note
    || `${action} by ${adminId || 'admin'} at ${new Date().toISOString()}`;
  const result = await query(
    `UPDATE admin_notifications
     SET is_read = TRUE,
         is_actioned = TRUE,
         action_note = COALESCE($3, action_note)
     WHERE notification_id = $1 AND (admin_id = $2 OR admin_id = 'admin')
     RETURNING notification_id, is_read, is_actioned, action_note`,
    [notifId, adminId, actionNote],
  );
  const unreadRes = await query(
    `SELECT COUNT(*) FROM admin_notifications
     WHERE (admin_id = $1 OR admin_id = 'admin') AND is_read = FALSE AND COALESCE(is_actioned, FALSE) = FALSE`,
    [adminId],
  );
  return {
    row: result.rows[0] || null,
    unreadCount: parseInt(unreadRes.rows[0]?.count || 0, 10),
  };
}

// GET /api/admin/v2/notifications — Paginated list of admin notifications with unread count
router.get('/v2/notifications', requirePermission('admin'), async (req, res) => {
  try {
    await ensureAdminNotificationTable();
    const { unreadOnly, category, priority, page = 1, limit = 25 } = req.query;
    const adminId = req.admin?.id || 'admin';

    const conds = ['(admin_id = $1 OR admin_id = \'admin\')'];
    const params = [adminId];
    let i = 2;

    if (unreadOnly === 'true') {
      conds.push('is_read = FALSE');
      conds.push('COALESCE(is_actioned, FALSE) = FALSE');
    }
    if (category) {
      conds.push(`category = $${i++}`);
      params.push(category);
    }
    if (priority) {
      conds.push(`priority = $${i++}`);
      params.push(priority);
    }

    const where = `WHERE ${conds.join(' AND ')}`;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const result = await query(
      `SELECT * FROM admin_notifications ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...params, parseInt(limit), offset]
    );

    const unreadRes = await query(
      `SELECT COUNT(*) FROM admin_notifications WHERE (admin_id = $1 OR admin_id = 'admin') AND is_read = FALSE`,
      [adminId]
    );

    const totalRes = await query(`SELECT COUNT(*) FROM admin_notifications ${where}`, params);

    res.json({
      notifications: result.rows,
      unreadCount: parseInt(unreadRes.rows[0]?.count || 0),
      total: parseInt(totalRes.rows[0]?.count || 0),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/v2/notifications/:id/read — Mark admin notification read
router.post('/v2/notifications/:id/read', requirePermission('admin'), async (req, res) => {
  try {
    await ensureAdminNotificationTable();
    const adminId = req.admin?.id || 'admin';
    const notifId = req.params.id;

    await query(
      `UPDATE admin_notifications SET is_read = TRUE WHERE notification_id = $1 AND (admin_id = $2 OR admin_id = 'admin')`,
      [notifId, adminId]
    );

    const unreadRes = await query(
      `SELECT COUNT(*) FROM admin_notifications WHERE (admin_id = $1 OR admin_id = 'admin') AND is_read = FALSE`,
      [adminId]
    );

    res.json({
      success: true,
      notificationId: notifId,
      isRead: true,
      unreadCount: parseInt(unreadRes.rows[0]?.count || 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/v2/notifications/read-all — Mark all admin notifications read
router.post('/v2/notifications/read-all', requirePermission('admin'), async (req, res) => {
  try {
    await ensureAdminNotificationTable();
    const adminId = req.admin?.id || 'admin';

    await query(
      `UPDATE admin_notifications SET is_read = TRUE WHERE (admin_id = $1 OR admin_id = 'admin')`,
      [adminId]
    );

    res.json({ success: true, unreadCount: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/v2/notifications/:id/ack — Acknowledge alert
router.post('/v2/notifications/:id/ack', requirePermission('admin'), async (req, res) => {
  try {
    await ensureAdminNotificationTable();
    const adminId = req.admin?.id || 'admin';
    const { row, unreadCount } = await markNotificationActioned(
      req.params.id,
      adminId,
      'ACK',
      req.body?.note || null,
    );
    if (!row) return res.status(404).json({ error: 'Notification not found' });
    res.json({
      success: true,
      notificationId: row.notification_id,
      action: 'ACK',
      isRead: true,
      isActioned: true,
      actionNote: row.action_note,
      unreadCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/v2/notifications/:id/resolve — Resolve / action alert
router.post('/v2/notifications/:id/resolve', requirePermission('admin'), async (req, res) => {
  try {
    await ensureAdminNotificationTable();
    const adminId = req.admin?.id || 'admin';
    const { row, unreadCount } = await markNotificationActioned(
      req.params.id,
      adminId,
      'RESOLVE',
      req.body?.note || null,
    );
    if (!row) return res.status(404).json({ error: 'Notification not found' });
    res.json({
      success: true,
      notificationId: row.notification_id,
      action: 'RESOLVE',
      isRead: true,
      isActioned: true,
      actionNote: row.action_note,
      unreadCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Outgoing Webhook Configuration Endpoints ──
router.get('/v2/notifications/webhooks', requirePermission('admin', 'security'), async (req, res) => {
  try {
    const { listAlertWebhooks } = await import('../../../lib/alertWebhookEngine.mjs');
    res.json({ success: true, webhooks: listAlertWebhooks() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/v2/notifications/webhooks', requirePermission('admin', 'security'), async (req, res) => {
  try {
    const { registerAlertWebhook } = await import('../../../lib/alertWebhookEngine.mjs');
    const created = registerAlertWebhook(req.body);
    res.status(201).json({ success: true, webhook: created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/v2/notifications/webhooks/:id', requirePermission('admin', 'security'), async (req, res) => {
  try {
    const { deleteAlertWebhook } = await import('../../../lib/alertWebhookEngine.mjs');
    deleteAlertWebhook(req.params.id);
    res.json({ success: true, deletedId: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
