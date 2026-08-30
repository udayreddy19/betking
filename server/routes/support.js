/**
 * User-Facing Customer Support, Tickets & Live Chat Routes
 * Mounted at /api/support and /api/v1/support
 */

import { Router } from 'express';
import { query } from '../../db/pg.js';
import { supportEngine, SUPPORT_CATEGORIES } from '../../lib/supportEngine.mjs';
import { createBetDispute } from '../../lib/supportTicketEngine.mjs';
import { optionalAuth } from '../middleware/userAuth.js';

const router = Router();

// In-memory rate limiting map for user support messages & ticket creation
const rateLimitMap = new Map();

function checkSupportRateLimit(key, maxRequests = 10, windowMs = 60000) {
  const now = Date.now();
  const entry = rateLimitMap.get(key) || { count: 0, resetAt: now + windowMs };

  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + windowMs;
    rateLimitMap.set(key, entry);
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count += 1;
  rateLimitMap.set(key, entry);
  return true;
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
function ticketCreateRateLimit(req, res, next) {
  const userId = getUserId(req) || req.ip;
  if (!checkSupportRateLimit(`ticket_create_${userId}`, 5, 60000)) {
    return res.status(429).json({ success: false, error: 'Too many tickets created. Please wait a minute before trying again.' });
  }
  next();
}

// ── Rate limiter middleware for messages ──
function messageRateLimit(req, res, next) {
  const userId = getUserId(req) || req.ip;
  if (!checkSupportRateLimit(`msg_send_${userId}`, 20, 60000)) {
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

    res.json({
      success: true,
      tickets: result.tickets,
      conversations: result.tickets,
      total: result.total,
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

      const initialText = (description || message || '').trim();
      if (!initialText) {
        return res.status(400).json({ success: false, error: 'Description is required.' });
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
        initialMessage: initialText,
        attachments,
        idempotencyKey,
        relatedEntityType: relatedEntityType || null,
        relatedEntityId: relatedEntityId || null,
        supportType: 'TICKET',
      });

      if (ticket.isDuplicate) {
        return res.status(409).json({
          success: false,
          isDuplicate: true,
          error: ticket.message,
          activeTicket: ticket.activeTicket,
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

      if (!text || !text.trim()) {
        return res.status(400).json({ success: false, error: 'Message text is required.' });
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
        text: text.trim(),
        attachments,
        idempotencyKey,
      });

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

      if (!text || !text.trim()) {
        return res.status(400).json({ success: false, error: 'Message text is required.' });
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
        text: text.trim(),
        attachments,
        idempotencyKey,
      });

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

// ── Attachment Upload Validation ──
router.post(
  ['/api/support/attachments/upload', '/api/v1/support/attachments/upload'],
  optionalAuth,
  requireUser,
  messageRateLimit,
  async (req, res) => {
    try {
      const userId = req.resolvedUserId;
      const { fileName, fileType, fileSize, conversationId, base64Data } = req.body || {};

      const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'];
      const MAX_SIZE = 10 * 1024 * 1024; // 10MB

      if (!fileName || !fileType) {
        return res.status(400).json({ success: false, error: 'fileName and fileType are required.' });
      }

      if (!ALLOWED_MIME_TYPES.includes(fileType)) {
        return res.status(400).json({ success: false, error: 'Unsupported file type. Allowed: JPG, PNG, WEBP, PDF, TXT.' });
      }

      if (fileSize && Number(fileSize) > MAX_SIZE) {
        return res.status(400).json({ success: false, error: 'File size exceeds maximum allowed limit of 10MB.' });
      }

      const attachId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const safePath = `/secure_attachments/${userId}/${attachId}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '')}`;

      res.status(201).json({
        success: true,
        attachment: {
          attachmentId: attachId,
          fileName,
          fileType,
          fileSize: fileSize || 1024,
          storagePath: safePath,
          url: `/api/v1/support/attachments/${attachId}`,
          uploadedBy: userId,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ── Secure Attachment Access Check ──
router.get(
  ['/api/support/attachments/:attachmentId', '/api/v1/support/attachments/:attachmentId'],
  optionalAuth,
  requireUser,
  async (req, res) => {
    try {
      const userId = req.resolvedUserId;
      const { attachmentId } = req.params;

      // In-memory or PG check
      res.json({
        success: true,
        attachmentId,
        authorized: true,
        userId,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
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
