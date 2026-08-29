import { Router } from 'express';
import { requireAuth } from '../middleware/userAuth.js';
import { query } from '../../db/pg.js';
import {
  getUserPreferences,
  updateUserPreferences,
} from '../../lib/notificationPreferencesEngine.mjs';

const router = Router();

/**
 * GET /api/v1/user/notifications
 * Fetch paginated in-app notifications for authenticated user.
 */
router.get('/api/v1/user/notifications', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const offset = Math.max(0, parseInt(req.query.offset || '0', 10));
    const category = req.query.category ? String(req.query.category).toUpperCase() : null;

    let q = `
      SELECT id, user_id, event_type, category, channel, subject, body, is_read, created_at, delivered_at
      FROM notifications
      WHERE user_id = $1
    `;
    const params = [userId];

    if (category && category !== 'ALL') {
      q += ` AND category = $${params.length + 1}`;
      params.push(category);
    }

    q += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const [rowsRes, countRes] = await Promise.all([
      query(q, params),
      query(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE is_read = FALSE)::int AS unread
         FROM notifications
         WHERE user_id = $1`,
        [userId],
      ),
    ]);

    const stats = countRes.rows[0] || { total: 0, unread: 0 };

    res.json({
      success: true,
      notifications: rowsRes.rows,
      total: stats.total,
      unreadCount: stats.unread,
      limit,
      offset,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, notifications: [], unreadCount: 0 });
  }
});

/**
 * POST /api/v1/user/notifications/read
 * Mark a single notification as read (Strict IDOR protection).
 */
router.post('/api/v1/user/notifications/read', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { notificationId } = req.body || {};

    if (!notificationId) {
      return res.status(400).json({ success: false, error: 'notificationId is required' });
    }

    const updateRes = await query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [notificationId, userId],
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Notification not found or unauthorized' });
    }

    res.json({ success: true, notificationId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/v1/user/notifications/read-all
 * Mark all notifications as read for the authenticated user.
 */
router.post('/api/v1/user/notifications/read-all', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const updateRes = await query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE user_id = $1 AND is_read = FALSE`,
      [userId],
    );

    res.json({ success: true, updatedCount: updateRes.rowCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/v1/user/notifications/clear
 * Clear single notification or all notifications for the authenticated user.
 */
router.post('/api/v1/user/notifications/clear', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { notificationId } = req.body || {};

    if (notificationId) {
      const delRes = await query(
        `DELETE FROM notifications
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [notificationId, userId],
      );
      return res.json({ success: true, deletedCount: delRes.rowCount });
    }

    const delAllRes = await query(
      `DELETE FROM notifications
       WHERE user_id = $1`,
      [userId],
    );
    res.json({ success: true, deletedCount: delAllRes.rowCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/v1/user/notifications/preferences
 * Fetch user notification preferences.
 */
router.get('/api/v1/user/notifications/preferences', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const prefs = await getUserPreferences(userId);
    res.json({ success: true, preferences: prefs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/v1/user/notifications/preferences
 * Update user notification preferences.
 */
router.post('/api/v1/user/notifications/preferences', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const updated = await updateUserPreferences(userId, req.body || {});
    res.json({ success: true, preferences: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
