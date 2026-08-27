import { Router } from 'express';
import { requireAuth } from '../middleware/userAuth.js';

const router = Router();

router.get('/api/v1/user/notifications', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  try {
    const { query } = await import('../../db/pg.js');
    const notifsRes = await query(`
      SELECT id, event_type, category, channel, subject, body, status, is_read, created_at
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 100;
    `, [userId]);
    res.json({ success: true, count: notifsRes.rows.length, notifications: notifsRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/v1/user/notifications/read', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const { notificationId } = req.body;
  try {
    const { query } = await import('../../db/pg.js');
    await query(`UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2;`, [notificationId, userId]);
    res.json({ success: true, notificationId, isRead: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/v1/user/notifications/read-all', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  try {
    const { query } = await import('../../db/pg.js');
    const result = await query(
      `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE;`,
      [userId],
    );
    res.json({ success: true, marked: result.rowCount || 0 });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/v1/user/notifications/clear', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const { notificationId } = req.body || {};
  try {
    const { query } = await import('../../db/pg.js');
    if (notificationId) {
      const result = await query(
        `DELETE FROM notifications WHERE id = $1 AND user_id = $2;`,
        [notificationId, userId],
      );
      return res.json({ success: true, cleared: result.rowCount || 0, notificationId });
    }
    const result = await query(`DELETE FROM notifications WHERE user_id = $1;`, [userId]);
    res.json({ success: true, cleared: result.rowCount || 0 });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/v1/user/notifications/preferences', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  try {
    const { query } = await import('../../db/pg.js');
    const prefRes = await query(`SELECT marketing_email, marketing_sms, marketing_push, transactional_email FROM user_notification_preferences WHERE user_id = $1;`, [userId]);
    const pref = prefRes.rows[0] || { marketing_email: true, marketing_sms: true, marketing_push: true, transactional_email: true };
    res.json({ success: true, userId, preferences: pref });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/api/v1/user/notifications/preferences', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const { marketingEmail, marketingSms, marketingPush, source } = req.body;
  try {
    const { upsertUserMarketingPreferences } = await import('../../lib/notificationPreferencesEngine.mjs');
    const preferences = await upsertUserMarketingPreferences(userId, {
      marketingEmail,
      marketingSms,
      marketingPush,
      source: source || 'profile',
      actorId: userId,
    });
    res.json({
      success: true,
      userId,
      status: 'UPDATED',
      preferences: {
        marketing_email: preferences.marketingEmail,
        marketing_sms: preferences.marketingSms,
        marketing_push: preferences.marketingPush,
        transactional_email: preferences.transactionalEmail,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get(['/api/support/conversations', '/api/v1/support/tickets'], requireAuth, async (req, res) => {
  const userId = req.user.userId;
  try {
    const { supportEngine } = await import('../../lib/supportEngine.mjs');
    const conversations = await supportEngine.getUserConversations(userId);
    res.json({ success: true, conversations, tickets: conversations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get(['/api/support/conversations/:id', '/api/v1/support/tickets/:id'], requireAuth, async (req, res) => {
  try {
    const { supportEngine } = await import('../../lib/supportEngine.mjs');
    const conversation = await supportEngine.getConversationById(req.params.id, 'user');
    if (!conversation) return res.status(404).json({ error: 'Support Ticket not found' });
    if (String(conversation.userId) !== String(req.user.userId)) {
      return res.status(403).json({ error: 'Forbidden', code: 'TICKET_FORBIDDEN' });
    }
    res.json({ success: true, conversation, ticket: conversation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post(['/api/support/conversations', '/api/v1/support/tickets'], requireAuth, async (req, res) => {
  const { subject, category, priority, initialMessage, attachments, idempotencyKey, relatedEntityType, relatedEntityId, bypassDuplicateCheck } = req.body;
  try {
    const { supportEngine } = await import('../../lib/supportEngine.mjs');
    const result = await supportEngine.startConversation({
      userId: req.user.userId,
      subject: subject || 'Support Request',
      category: category || 'General',
      priority: priority || 'NORMAL',
      initialMessage: initialMessage || 'New inquiry',
      attachments: attachments || [],
      idempotencyKey: idempotencyKey || req.headers['x-idempotency-key'],
      relatedEntityType,
      relatedEntityId,
      bypassDuplicateCheck: bypassDuplicateCheck === true,
    });

    if (result.isDuplicate) {
      return res.status(409).json({
        success: false,
        isDuplicate: true,
        error: result.message,
        message: result.message,
        activeTicket: result.activeTicket,
        conversationId: result.conversationId,
        ticketNumber: result.ticketNumber,
      });
    }

    res.json({ success: true, conversation: result, ticket: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post(['/api/support/conversations/:id/messages', '/api/v1/support/tickets/:id/messages'], requireAuth, async (req, res) => {
  const { messageType, text, attachments, idempotencyKey } = req.body;
  try {
    const { supportEngine } = await import('../../lib/supportEngine.mjs');
    const conversation = await supportEngine.getConversationById(req.params.id, 'user');
    if (!conversation || String(conversation.userId) !== String(req.user.userId)) {
      return res.status(404).json({ error: 'Support Ticket not found' });
    }
    const msg = await supportEngine.addMessage(req.params.id, {
      senderId: req.user.userId,
      senderType: 'user',
      messageType: messageType || 'USER_MESSAGE',
      text: text || '',
      attachments: attachments || [],
      idempotencyKey: idempotencyKey || req.headers['x-idempotency-key'],
    });
    if (!msg) return res.status(404).json({ error: 'Support Ticket not found' });
    res.json({ success: true, message: msg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post(['/api/support/conversations/:id/read', '/api/v1/support/tickets/:id/read'], requireAuth, async (req, res) => {
  try {
    const { supportEngine } = await import('../../lib/supportEngine.mjs');
    const conversation = await supportEngine.getConversationById(req.params.id, 'user');
    if (!conversation || String(conversation.userId) !== String(req.user.userId)) {
      return res.status(404).json({ error: 'Support Ticket not found' });
    }
    const updated = await supportEngine.markAsRead(req.params.id, 'user');
    if (!updated) return res.status(404).json({ error: 'Support Ticket not found' });
    res.json({ success: true, conversation: updated, ticket: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post(['/api/support/conversations/:id/close', '/api/v1/support/tickets/:id/close'], requireAuth, async (req, res) => {
  const { resolutionCode } = req.body;
  try {
    const { supportEngine } = await import('../../lib/supportEngine.mjs');
    const conversation = await supportEngine.getConversationById(req.params.id, 'user');
    if (!conversation || String(conversation.userId) !== String(req.user.userId)) {
      return res.status(404).json({ error: 'Support Ticket not found' });
    }
    const closed = await supportEngine.closeTicket(req.params.id, { closedBy: req.user.userId, resolutionCode });
    if (!closed) return res.status(404).json({ error: 'Support Ticket not found' });
    res.json({ success: true, conversation: closed, ticket: closed });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post(['/api/support/conversations/:id/reopen', '/api/v1/support/tickets/:id/reopen'], requireAuth, async (req, res) => {
  const { reason } = req.body;
  try {
    const { supportEngine } = await import('../../lib/supportEngine.mjs');
    const conversation = await supportEngine.getConversationById(req.params.id, 'user');
    if (!conversation || String(conversation.userId) !== String(req.user.userId)) {
      return res.status(404).json({ error: 'Support Ticket not found' });
    }
    const reopened = await supportEngine.reopenConversation(req.params.id, { actorId: req.user.userId, reason });
    if (!reopened) return res.status(404).json({ error: 'Support Ticket not found' });
    res.json({ success: true, conversation: reopened, ticket: reopened });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post(['/api/support/conversations/:id/feedback', '/api/v1/support/tickets/:id/feedback'], requireAuth, async (req, res) => {
  const { rating, comment } = req.body;
  try {
    const { supportEngine } = await import('../../lib/supportEngine.mjs');
    const conversation = await supportEngine.getConversationById(req.params.id, 'user');
    if (!conversation || String(conversation.userId) !== String(req.user.userId)) {
      return res.status(404).json({ error: 'Support Ticket not found' });
    }
    const fb = supportEngine.submitFeedback ? supportEngine.submitFeedback(req.params.id, { rating, comment }) : { rating, comment };
    res.json({ success: true, feedback: fb });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
