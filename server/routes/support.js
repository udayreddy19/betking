/**
 * User-Facing Customer Support, Tickets & Live Chat Routes
 * Mounted at /api/support and /api/v1/support
 */

import { Router } from 'express';
import { query } from '../../db/pg.js';
import { supportEngine, SUPPORT_CATEGORIES } from '../../lib/supportEngine.mjs';
import { createBetDispute } from '../../lib/supportTicketEngine.mjs';
import { optionalAuth } from '../middleware/userAuth.js';
import { consumeRateLimitSlot, rateLimitClientKey } from '../middleware/rateLimiter.js';

const router = Router();

async function consumeSupportLimit(req, { prefix, maxRequests, windowSeconds }) {
  const userId = getUserId(req);
  return consumeRateLimitSlot({
    key: userId || rateLimitClientKey(req),
    prefix,
    maxRequests,
    windowSeconds,
  });
}

function getUserId(req) {
  return req.user?.userId || req.user?.id || req.headers['x-user-id'] || req.query?.userId || null;
}

function requireUser(req, res, next) {
  const userId = getUserId(req);
  if (!userId || userId === 'guest' || userId === 'null') {
    return res.status(401).json({ success: false, error: 'Authentication required to access support.' });
  }
  req.resolvedUserId = userId;
  return next();
}

// ── Rate limiter middleware for ticket creation ──
async function ticketCreateRateLimit(req, res, next) {
  const result = await consumeSupportLimit(req, {
    prefix: 'rl:support_ticket',
    maxRequests: 5,
    windowSeconds: 60,
  });
  if (!result.allowed) {
    res.setHeader('Retry-After', result.retryAfterSeconds);
    return res.status(429).json({ success: false, error: 'Too many tickets created. Please wait a minute before trying again.' });
  }
  next();
}

// ── Rate limiter middleware for messages ──
async function messageRateLimit(req, res, next) {
  const result = await consumeSupportLimit(req, {
    prefix: 'rl:support_msg',
    maxRequests: 20,
    windowSeconds: 60,
  });
  if (!result.allowed) {
    res.setHeader('Retry-After', result.retryAfterSeconds);
    return res.status(429).json({ success: false, error: 'Too many messages sent. Please slow down.' });
  }
  next();
}

// ── Support Home Overview ──
router.get(['/api/support/overview', '/api/v1/support/overview'], optionalAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.json({
        success: true,
        authenticated: false,
        activeTicketsCount: 0,
        activeLiveChat: null,
      });
    }

    const { tickets } = await supportEngine.getUserConversations(userId, { supportType: 'TICKET' });
    const activeTickets = tickets.filter((t) => ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER', 'REOPENED'].includes(t.status));
    const activeChat = Array.from(supportEngine.conversations.values()).find(
      (c) => c.userId === userId && c.supportType === 'LIVE_CHAT' && ['WAITING', 'ACTIVE'].includes(c.status)
    );

    res.json({
      success: true,
      authenticated: true,
      activeTicketsCount: activeTickets.length,
      activeTickets,
      activeLiveChat: activeChat || null,
      categories: [
        'DEPOSIT',
        'WITHDRAWAL',
        'BET',
        'BET_SETTLEMENT',
        'ACCOUNT',
        'KYC',
        'BONUS',
        'PROMOTION',
        'REFERRAL',
        'SECURITY',
        'TECHNICAL',
        'OTHER',
      ],
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── User Ticket List ──
router.get(['/api/support/tickets', '/api/v1/support/tickets'], optionalAuth, requireUser, async (req, res) => {
  try {
    const userId = req.resolvedUserId;
    const { category, status, search, limit = 50, offset = 0 } = req.query;

    const result = await supportEngine.getUserConversations(userId, {
      supportType: 'TICKET',
      category: category || null,
      status: status || null,
      search: search || null,
      limit: Number(limit),
      offset: Number(offset),
    });

    const tickets = Array.isArray(result?.tickets) ? result.tickets : (Array.isArray(result) ? result : []);
    const total = Number(result?.total ?? tickets.length);

    res.json({
      success: true,
      tickets,
      conversations: tickets,
      data: { tickets },
      total,
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Create Support Ticket ──
router.post(
  ['/api/support/tickets', '/api/v1/support/tickets'],
  optionalAuth,
  requireUser,
  ticketCreateRateLimit,
  async (req, res) => {
    try {
      const userId = req.resolvedUserId;
      const {
        category,
        subject,
        description,
        message,
        priority = 'NORMAL',
        relatedEntityType,
        relatedEntityId,
        attachments = [],
        idempotencyKey,
      } = req.body || {};

      if (!subject || !subject.trim()) {
        return res.status(400).json({ success: false, error: 'Subject is required.' });
      }

      const files = Array.isArray(attachments) ? attachments : [];
      const initialText = (description || message || '').trim();
      if (!initialText && files.length === 0) {
        return res.status(400).json({ success: false, error: 'Description or attachment is required.' });
      }

      const normCategory = String(category || 'OTHER').toUpperCase();

      // Verify related entity if supplied
      if (relatedEntityType && relatedEntityId) {
        const verifyRes = await supportEngine.verifyRelatedEntity(userId, relatedEntityType, relatedEntityId);
        if (!verifyRes.valid) {
          return res.status(400).json({ success: false, error: verifyRes.error || 'Invalid related record.' });
        }
      }

      const ticket = await supportEngine.startConversation({
        userId,
        subject: subject.trim(),
        category: normCategory,
        priority,
        initialMessage: initialText || (files.length ? 'Sent an attachment' : ''),
        attachments: files,
        idempotencyKey,
        relatedEntityType: relatedEntityType || null,
        relatedEntityId: relatedEntityId || null,
        supportType: 'TICKET',
      });

      try {
        const firstMsg = ticket?.messages?.[0] || ticket?.initialMessage;
        const { linkAttachmentsToMessage } = await import('../../lib/supportAttachments.mjs');
        await linkAttachmentsToMessage({
          attachmentIds: files.map((f) => f.attachmentId).filter(Boolean),
          messageId: firstMsg?.messageId || firstMsg?.id || ticket?.lastMessageId,
          conversationId: ticket?.conversationId || ticket?.id,
        });
      } catch { /* best-effort */ }

      if (ticket.isDuplicate) {
        const existing = ticket.activeTicket || {};
        const publicTicket = {
          id: existing.conversationId,
          conversationId: existing.conversationId,
          ticketReference: existing.ticketReference || existing.ticketNumber || existing.conversationNumber,
          ticketNumber: existing.ticketNumber || existing.ticketReference || existing.conversationNumber,
          subject: existing.subject,
          category: existing.category,
          status: existing.status,
          createdAt: existing.createdAt,
        };
        return res.status(409).json({
          success: false,
          isDuplicate: true,
          error: ticket.message,
          ticketReference: publicTicket.ticketReference,
          activeTicket: publicTicket,
          data: { tickets: [publicTicket], activeTicket: publicTicket },
        });
      }

      res.status(201).json({
        success: true,
        ticket,
        ticketReference: ticket.ticketReference || ticket.ticketNumber,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ── Get Specific Ticket (IDOR Protected & Internal Notes Isolated) ──
router.get(['/api/support/tickets/:ticketReference', '/api/v1/support/tickets/:ticketReference'], optionalAuth, requireUser, async (req, res) => {
  try {
    const userId = req.resolvedUserId;
    const { ticketReference } = req.params;

    const ticket = await supportEngine.getConversationById(ticketReference, 'user');
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Support ticket not found.' });
    }

    // Strict IDOR Check
    if (ticket.userId !== userId) {
      return res.status(403).json({ success: false, error: 'You do not have permission to view this support ticket.' });
    }

    res.json({
      success: true,
      ticket,
      conversation: ticket,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Reply to Ticket ──
router.post(
  ['/api/support/tickets/:ticketReference/messages', '/api/v1/support/tickets/:ticketReference/messages'],
  optionalAuth,
  requireUser,
  messageRateLimit,
  async (req, res) => {
    try {
      const userId = req.resolvedUserId;
      const { ticketReference } = req.params;
      const { text, attachments = [], idempotencyKey } = req.body || {};
      const trimmed = String(text || '').trim();
      const files = Array.isArray(attachments) ? attachments : [];
      if (!trimmed && files.length === 0) {
        return res.status(400).json({ success: false, error: 'Message text or attachment is required.' });
      }

      const ticket = await supportEngine.getConversationById(ticketReference, 'user');
      if (!ticket) {
        return res.status(404).json({ success: false, error: 'Support ticket not found.' });
      }

      // IDOR Check
      if (ticket.userId !== userId) {
        return res.status(403).json({ success: false, error: 'You do not have permission to reply to this ticket.' });
      }

      const message = await supportEngine.addMessage(ticket.conversationId, {
        senderId: userId,
        senderType: 'user',
        messageType: 'USER_MESSAGE',
        text: trimmed || (files.length ? 'Sent an attachment' : ''),
        attachments: files,
        idempotencyKey,
      });

      try {
        const { linkAttachmentsToMessage } = await import('../../lib/supportAttachments.mjs');
        await linkAttachmentsToMessage({
          attachmentIds: files.map((f) => f.attachmentId).filter(Boolean),
          messageId: message?.messageId || message?.id,
          conversationId: ticket.conversationId,
        });
      } catch { /* best-effort link */ }

      res.status(201).json({
        success: true,
        message,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ── Reopen Resolved Ticket ──
router.post(
  ['/api/support/tickets/:ticketReference/reopen', '/api/v1/support/tickets/:ticketReference/reopen'],
  optionalAuth,
  requireUser,
  async (req, res) => {
    try {
      const userId = req.resolvedUserId;
      const { ticketReference } = req.params;
      const { reason = 'User requested reopening' } = req.body || {};

      const ticket = await supportEngine.getConversationById(ticketReference, 'user');
      if (!ticket) {
        return res.status(404).json({ success: false, error: 'Support ticket not found.' });
      }

      if (ticket.userId !== userId) {
        return res.status(403).json({ success: false, error: 'Permission denied.' });
      }

      const updated = await supportEngine.updateStatus(ticket.conversationId, {
        status: 'OPEN',
        actorId: userId,
        reason,
      });

      res.json({
        success: true,
        ticket: updated,
      });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
);

// ── Live Chat: Start Session ──
router.post(
  ['/api/support/live-chat/start', '/api/v1/support/live-chat/start'],
  optionalAuth,
  requireUser,
  messageRateLimit,
  async (req, res) => {
    try {
      const userId = req.resolvedUserId;
      const { initialMessage = 'User started live chat', subject } = req.body || {};

      const chat = await supportEngine.startLiveChat({
        userId,
        initialMessage: String(initialMessage).trim(),
        subject: subject || 'Live Chat Session',
      });

      res.status(201).json({
        success: true,
        chat,
        conversationId: chat.conversationId,
        status: chat.status,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ── Live Chat: Get Active Session ──
router.get(['/api/support/live-chat/active', '/api/v1/support/live-chat/active'], optionalAuth, requireUser, async (req, res) => {
  try {
    const userId = req.resolvedUserId;
    const activeChat = Array.from(supportEngine.conversations.values()).find(
      (c) => c.userId === userId && c.supportType === 'LIVE_CHAT' && ['WAITING', 'ACTIVE'].includes(c.status)
    );

    if (!activeChat) {
      return res.json({ success: true, activeChat: null });
    }

    res.json({
      success: true,
      activeChat: {
        ...activeChat,
        messages: (activeChat.messages || []).filter((m) => m.messageType !== 'INTERNAL_NOTE'),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Live Chat: Get Specific Session (IDOR Protected) ──
router.get(
  ['/api/support/live-chat/:conversationId', '/api/v1/support/live-chat/:conversationId'],
  optionalAuth,
  requireUser,
  async (req, res) => {
    try {
      const userId = req.resolvedUserId;
      const { conversationId } = req.params;

      const chat = await supportEngine.getConversationById(conversationId, 'user');
      if (!chat) {
        return res.status(404).json({ success: false, error: 'Live chat session not found.' });
      }

      if (chat.userId !== userId) {
        return res.status(403).json({ success: false, error: 'You do not have permission to access this chat.' });
      }

      res.json({
        success: true,
        chat,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ── Live Chat: Send Message ──
router.post(
  ['/api/support/live-chat/:conversationId/messages', '/api/v1/support/live-chat/:conversationId/messages'],
  optionalAuth,
  requireUser,
  messageRateLimit,
  async (req, res) => {
    try {
      const userId = req.resolvedUserId;
      const { conversationId } = req.params;
      const { text, attachments = [], idempotencyKey } = req.body || {};
      const trimmed = String(text || '').trim();
      const files = Array.isArray(attachments) ? attachments : [];
      if (!trimmed && files.length === 0) {
        return res.status(400).json({ success: false, error: 'Message text or attachment is required.' });
      }

      const chat = await supportEngine.getConversationById(conversationId, 'user');
      if (!chat) {
        return res.status(404).json({ success: false, error: 'Live chat session not found.' });
      }

      if (chat.userId !== userId) {
        return res.status(403).json({ success: false, error: 'Permission denied.' });
      }

      if (chat.status === 'ENDED' || chat.status === 'ESCALATED_TO_TICKET') {
        return res.status(400).json({ success: false, error: `Cannot send messages to a chat that has ${chat.status}.` });
      }

      const message = await supportEngine.addMessage(chat.conversationId, {
        senderId: userId,
        senderType: 'user',
        messageType: 'USER_MESSAGE',
        text: trimmed || (files.length ? 'Sent an attachment' : ''),
        attachments: files,
        idempotencyKey,
      });

      try {
        const { linkAttachmentsToMessage } = await import('../../lib/supportAttachments.mjs');
        await linkAttachmentsToMessage({
          attachmentIds: files.map((f) => f.attachmentId).filter(Boolean),
          messageId: message?.messageId || message?.id,
          conversationId: chat.conversationId,
        });
      } catch { /* best-effort */ }

      res.status(201).json({
        success: true,
        message,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ── Live Chat: End Session ──
router.post(
  ['/api/support/live-chat/:conversationId/end', '/api/v1/support/live-chat/:conversationId/end'],
  optionalAuth,
  requireUser,
  async (req, res) => {
    try {
      const userId = req.resolvedUserId;
      const { conversationId } = req.params;

      const chat = await supportEngine.getConversationById(conversationId, 'user');
      if (!chat) {
        return res.status(404).json({ success: false, error: 'Live chat session not found.' });
      }

      if (chat.userId !== userId) {
        return res.status(403).json({ success: false, error: 'Permission denied.' });
      }

      const ended = await supportEngine.endLiveChat(conversationId, { endedBy: userId, actorType: 'user' });

      res.json({
        success: true,
        chat: ended,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ── Attachment Upload ──
router.post(
  ['/api/support/attachments/upload', '/api/v1/support/attachments/upload'],
  optionalAuth,
  requireUser,
  messageRateLimit,
  async (req, res) => {
    try {
      const userId = req.resolvedUserId;
      const { fileName, fileType, fileSize, conversationId, base64Data } = req.body || {};
      const { saveSupportAttachment } = await import('../../lib/supportAttachments.mjs');
      const attachment = await saveSupportAttachment({
        fileName,
        fileType,
        fileSize,
        base64Data,
        uploadedBy: userId,
        conversationId: conversationId || null,
        uploadedByRole: 'user',
      });
      res.status(201).json({ success: true, attachment });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  }
);

// ── Secure Attachment Download ──
router.get(
  ['/api/support/attachments/:attachmentId', '/api/v1/support/attachments/:attachmentId'],
  optionalAuth,
  requireUser,
  async (req, res) => {
    try {
      const userId = req.resolvedUserId;
      const { attachmentId } = req.params;
      const {
        getSupportAttachmentRecord,
        readSupportAttachmentFile,
        userCanAccessAttachment,
      } = await import('../../lib/supportAttachments.mjs');

      const record = await getSupportAttachmentRecord(attachmentId);
      if (!record) return res.status(404).json({ success: false, error: 'Attachment not found' });

      const allowed = await userCanAccessAttachment(record, userId);
      if (!allowed) return res.status(403).json({ success: false, error: 'Not authorized' });

      const buf = await readSupportAttachmentFile(record);
      if (!buf) return res.status(404).json({ success: false, error: 'File missing' });

      res.setHeader('Content-Type', record.file_type || 'application/octet-stream');
      res.setHeader('Content-Length', buf.length);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${String(record.file_name || 'attachment').replace(/"/g, '')}"`,
      );
      res.setHeader('Cache-Control', 'private, max-age=300');
      return res.send(buf);
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  }
);

// ── POST /api/support/disputes — User opens a dispute for a settled bet ──
router.post('/api/support/disputes', optionalAuth, requireUser, async (req, res) => {
  try {
    const userId = req.resolvedUserId;
    const { betId, reason } = req.body || {};
    if (!betId) return res.status(400).json({ error: 'betId is required' });

    const result = await createBetDispute(userId, betId, reason);
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/support/disputes — List user disputes ──
router.get('/api/support/disputes', optionalAuth, requireUser, async (req, res) => {
  try {
    const userId = req.resolvedUserId;
    const result = await query(
      `SELECT * FROM bet_disputes WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    res.json({ success: true, disputes: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
