/**
 * Admin WhatsApp Management & Dispatch Routes
 * 
 * Powered by Kapso WhatsApp Business API
 * Provides endpoints for status check, template retrieval, message dispatch,
 * recipient user lookup, and paginated delivery audit logs.
 */

import { Router } from 'express';
import { kapsoService } from '../../services/kapsoService.js';
import { logAdminAction } from '../../middleware/auditLogger.js';
import { query } from '../../../db/pg.js';

const router = Router();

/**
 * Require adequate role for admin WhatsApp messaging
 */
function requireWhatsAppRole(req, res) {
  const role = String(req.admin?.role || '').toUpperCase();
  const allowed = ['SUPER_ADMIN', 'MARKETING_ADMIN', 'OPERATIONS_ADMIN', 'SUPPORT_AGENT'];
  if (role && !allowed.includes(role)) {
    res.status(403).json({ error: 'WhatsApp messaging requires Support Agent, Marketing, Operations, or Super Admin role' });
    return false;
  }
  return true;
}

/**
 * GET /api/admin/whatsapp/status
 * Returns current Kapso WhatsApp connection status and masked credentials
 */
router.get('/status', (req, res) => {
  if (!requireWhatsAppRole(req, res)) return;
  const status = kapsoService.getStatus();
  res.json({ success: true, ...status });
});

/**
 * GET /api/admin/whatsapp/templates
 * Lists approved and built-in WhatsApp templates
 */
router.get('/templates', async (req, res) => {
  if (!requireWhatsAppRole(req, res)) return;
  try {
    const templates = await kapsoService.listTemplates();
    res.json({ success: true, templates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, templates: [] });
  }
});

/**
 * GET /api/admin/whatsapp/logs
 * Fetches paginated WhatsApp delivery records
 */
router.get('/logs', async (req, res) => {
  if (!requireWhatsAppRole(req, res)) return;
  try {
    const { limit, offset, status, recipient } = req.query;
    const result = await kapsoService.getLogs({ limit, offset, status, recipient });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, logs: [], pagination: { total: 0 } });
  }
});

/**
 * GET /api/admin/whatsapp/search-players
 * Helper endpoint to autocomplete players by username, phone, or email
 */
router.get('/search-players', async (req, res) => {
  if (!requireWhatsAppRole(req, res)) return;
  const q = String(req.query.q || '').trim();
  if (!q || q.length < 2) {
    return res.json({ players: [] });
  }

  try {
    const sql = `
      SELECT id, username, email, phone, name, kyc_status, vip_tier
      FROM users
      WHERE username ILIKE $1
         OR email ILIKE $1
         OR name ILIKE $1
         OR phone ILIKE $1
      ORDER BY created_at DESC
      LIMIT 10
    `;
    const result = await query(sql, [`%${q}%`]);
    res.json({
      players: result.rows.map((r) => ({
        id: r.id,
        username: r.username,
        name: r.name || r.username,
        email: r.email,
        phone: r.phone || '',
        kycStatus: r.kyc_status,
        vipTier: r.vip_tier
      }))
    });
  } catch {
    res.json({ players: [] });
  }
});

/**
 * POST /api/admin/whatsapp/send
 * Dispatches a WhatsApp message to a player
 */
router.post('/send', async (req, res) => {
  if (!requireWhatsAppRole(req, res)) return;

  try {
    const {
      to,
      type = 'TEXT',
      body,
      templateName,
      languageCode = 'en',
      parameters = [],
      userId = null
    } = req.body || {};

    if (!to) {
      return res.status(400).json({ success: false, error: 'Recipient phone number is required' });
    }

    const adminId = req.admin?.id || 'admin';
    let result;

    if (String(type).toUpperCase() === 'TEMPLATE') {
      if (!templateName) {
        return res.status(400).json({ success: false, error: 'templateName is required for template messages' });
      }
      result = await kapsoService.sendTemplateMessage({
        to,
        templateName,
        languageCode,
        parameters,
        adminId,
        userId,
        metadata: { adminUsername: req.admin?.username }
      });
    } else {
      if (!body || !body.trim()) {
        return res.status(400).json({ success: false, error: 'Message body cannot be empty' });
      }
      result = await kapsoService.sendTextMessage({
        to,
        body,
        adminId,
        userId,
        metadata: { adminUsername: req.admin?.username }
      });
    }

    await logAdminAction({
      actorId: adminId,
      targetId: result.recipient,
      action: 'ADMIN_WHATSAPP_MESSAGE_SENT',
      details: {
        type,
        templateName: templateName || null,
        recipient: result.recipient,
        logId: result.logId,
        messageId: result.messageId,
        status: result.status,
        mock: result.mock || false
      },
      riskLevel: 'LOW'
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: err.message,
      code: err.code || 'WHATSAPP_DISPATCH_FAILED',
      details: err.details || null
    });
  }
});

export default router;
