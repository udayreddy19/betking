/**
 * Kapso WhatsApp Business API Integration Service
 * 
 * Provides authenticated dispatch of WhatsApp text and template messages
 * using Kapso (Meta WhatsApp Cloud API BSP wrapper).
 * 
 * Includes E.164 phone normalization, audit logging, template parameter binding,
 * and sandbox / mock fallback for development without API keys.
 */

import crypto from 'crypto';
import { query } from '../../db/pg.js';

const KAPSO_DEFAULT_BASE_URL = 'https://api.kapso.ai/meta/whatsapp/v24.0';

/**
 * Normalizes phone number to Meta / WhatsApp format (digits only, no '+' or punctuation).
 * Defaults 10-digit Indian numbers to '91' prefix.
 */
export function normalizeWhatsAppPhone(rawPhone) {
  if (!rawPhone || typeof rawPhone !== 'string') {
    throw new Error('Phone number must be a non-empty string');
  }

  // Remove all non-digit characters except leading plus if any
  let digits = rawPhone.replace(/\D/g, '');

  // 10-digit number without country code assumes India (+91)
  if (digits.length === 10) {
    digits = `91${digits}`;
  }

  if (digits.length < 10 || digits.length > 15) {
    throw new Error(`Invalid phone number length (${digits.length} digits). Expected 10-15 digits.`);
  }

  return digits;
}

/**
 * Built-in WhatsApp Templates for OddsYra Admin Operations
 */
export const BUILTIN_ADMIN_TEMPLATES = [
  {
    name: 'oddsyra_support_update',
    label: 'Support Update',
    category: 'UTILITY',
    language: 'en',
    description: 'Update player regarding an open support ticket or inquiry',
    parameters: [
      { key: 'name', label: 'Player Name', placeholder: 'Uday', required: true },
      { key: 'ticket_id', label: 'Ticket ID', placeholder: 'TKT-1042', required: true },
      { key: 'update_text', label: 'Update Details', placeholder: 'Your ticket has been reviewed by our specialist team.', required: true }
    ],
    sampleText: 'Hello {{name}}, update regarding your OddsYra support request #{{ticket_id}}: {{update_text}}'
  },
  {
    name: 'oddsyra_kyc_reminder',
    label: 'KYC Document Request',
    category: 'UTILITY',
    language: 'en',
    description: 'Prompt player to upload missing KYC documents for verification',
    parameters: [
      { key: 'name', label: 'Player Name', placeholder: 'Uday', required: true },
      { key: 'doc_type', label: 'Required Document', placeholder: 'PAN Card / Aadhaar', required: true }
    ],
    sampleText: 'Hello {{name}}, we require your {{doc_type}} to complete your OddsYra account verification and unlock full withdrawals. Please log in to complete your KYC.'
  },
  {
    name: 'oddsyra_withdrawal_status',
    label: 'Withdrawal Payout Notice',
    category: 'UTILITY',
    language: 'en',
    description: 'Notify player regarding withdrawal processing or UTR confirmation',
    parameters: [
      { key: 'name', label: 'Player Name', placeholder: 'Uday', required: true },
      { key: 'amount', label: 'Amount (₹)', placeholder: '5,000', required: true },
      { key: 'status_note', label: 'Status Note / UTR', placeholder: 'UTR 202609091234 has been processed to your bank account.', required: true }
    ],
    sampleText: 'Hello {{name}}, regarding your withdrawal of ₹{{amount}}: {{status_note}}'
  },
  {
    name: 'oddsyra_deposit_help',
    label: 'Deposit Assistance',
    category: 'UTILITY',
    language: 'en',
    description: 'Reach out to player regarding a pending or failed deposit',
    parameters: [
      { key: 'name', label: 'Player Name', placeholder: 'Uday', required: true },
      { key: 'deposit_hint', label: 'Assistance Note', placeholder: 'We noticed an incomplete deposit. Please reply with the transaction UTR if amount was deducted.', required: true }
    ],
    sampleText: 'Hi {{name}}, OddsYra Support team here. {{deposit_hint}}'
  },
  {
    name: 'oddsyra_vip_exclusive',
    label: 'VIP Exclusive Offer',
    category: 'MARKETING',
    language: 'en',
    description: 'Personalized bonus or free bet invitation for VIP players',
    parameters: [
      { key: 'name', label: 'Player Name', placeholder: 'Uday', required: true },
      { key: 'perk_description', label: 'Perk / Bonus', placeholder: 'A 20% cashback bonus is active on your profile.', required: true }
    ],
    sampleText: 'Hello {{name}}, exclusive VIP announcement from OddsYra: {{perk_description}} Log in to claim before expiry.'
  }
];

class KapsoService {
  constructor() {
    this.reloadConfig();
  }

  /**
   * Reload environment config at runtime
   */
  reloadConfig() {
    this.apiKey = process.env.KAPSO_API_KEY || '';
    this.phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID || '';
    this.businessAccountId = process.env.KAPSO_BUSINESS_ACCOUNT_ID || '';
    const rawBase = process.env.KAPSO_BASE_URL || process.env.KAPSO_API_BASE_URL || '';
    if (rawBase && !rawBase.includes('/meta/whatsapp')) {
      const version = process.env.META_GRAPH_VERSION || 'v24.0';
      this.baseUrl = `${rawBase.replace(/\/+$/, '')}/meta/whatsapp/${version}`;
    } else {
      this.baseUrl = (rawBase || KAPSO_DEFAULT_BASE_URL).replace(/\/+$/, '');
    }
  }

  /**
   * Returns true if Kapso credentials are fully configured.
   */
  isConfigured() {
    this.reloadConfig();
    return Boolean(this.apiKey && this.phoneNumberId);
  }

  /**
   * Returns service status and masked configuration details for admin display.
   */
  getStatus() {
    this.reloadConfig();
    const configured = Boolean(this.apiKey && this.phoneNumberId);
    return {
      configured,
      mode: configured ? 'LIVE' : 'MOCK_SANDBOX',
      phoneNumberId: this.phoneNumberId ? `${this.phoneNumberId.slice(0, 4)}...${this.phoneNumberId.slice(-4)}` : null,
      apiKeyMasked: this.apiKey ? `${this.apiKey.slice(0, 4)}••••••••${this.apiKey.slice(-4)}` : null,
      baseUrl: this.baseUrl,
      businessAccountId: this.businessAccountId ? `${this.businessAccountId.slice(0, 4)}...` : null
    };
  }

  /**
   * Dispatches a direct text message via Kapso.
   */
  async sendTextMessage({ to, body, adminId, userId = null, metadata = {} }) {
    if (!to) throw new Error('Recipient phone number is required');
    if (!body || !body.trim()) throw new Error('Message body is required');
    if (!adminId) throw new Error('Admin ID is required for audit trail');

    const normalizedPhone = normalizeWhatsAppPhone(to);
    const cleanBody = body.trim();
    const logId = `wal_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const isLive = this.isConfigured();

    if (!isLive) {
      // Mock / Sandbox mode
      const mockResult = {
        success: true,
        mock: true,
        logId,
        messageId: `mock_msg_${Date.now()}`,
        recipient: normalizedPhone,
        body: cleanBody,
        status: 'MOCK_SENT',
        note: 'Message simulated in sandbox mode (KAPSO_API_KEY or KAPSO_PHONE_NUMBER_ID not set)'
      };

      await this.recordLog({
        id: logId,
        adminId,
        userId,
        recipientPhone: normalizedPhone,
        messageType: 'TEXT',
        templateName: null,
        messageBody: cleanBody,
        status: 'MOCK_SENT',
        kapsoMessageId: mockResult.messageId,
        errorMessage: null,
        metadata: { ...metadata, mock: true }
      });

      return mockResult;
    }

    const endpoint = `${this.baseUrl}/${this.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: 'text',
      text: {
        body: cleanBody
      }
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data?.error?.message || `Kapso HTTP error ${response.status}`;
        await this.recordLog({
          id: logId,
          adminId,
          userId,
          recipientPhone: normalizedPhone,
          messageType: 'TEXT',
          templateName: null,
          messageBody: cleanBody,
          status: 'FAILED',
          kapsoMessageId: null,
          errorMessage: errorMsg,
          metadata: { ...metadata, errorResponse: data }
        });

        const err = new Error(`Kapso API error: ${errorMsg}`);
        err.status = response.status;
        err.details = data;
        throw err;
      }

      const kapsoMessageId = data?.messages?.[0]?.id || null;

      await this.recordLog({
        id: logId,
        adminId,
        userId,
        recipientPhone: normalizedPhone,
        messageType: 'TEXT',
        templateName: null,
        messageBody: cleanBody,
        status: 'SENT',
        kapsoMessageId,
        errorMessage: null,
        metadata: { ...metadata, kapsoResponse: data }
      });

      return {
        success: true,
        logId,
        messageId: kapsoMessageId,
        recipient: normalizedPhone,
        status: 'SENT'
      };
    } catch (err) {
      if (err.status) throw err; // Already logged and formatted
      await this.recordLog({
        id: logId,
        adminId,
        userId,
        recipientPhone: normalizedPhone,
        messageType: 'TEXT',
        templateName: null,
        messageBody: cleanBody,
        status: 'FAILED',
        kapsoMessageId: null,
        errorMessage: err.message,
        metadata
      });
      throw err;
    }
  }

  /**
   * Dispatches an approved WhatsApp Template message via Kapso.
   */
  async sendTemplateMessage({
    to,
    templateName,
    languageCode = 'en',
    parameters = [],
    adminId,
    userId = null,
    metadata = {}
  }) {
    if (!to) throw new Error('Recipient phone number is required');
    if (!templateName) throw new Error('Template name is required');
    if (!adminId) throw new Error('Admin ID is required for audit trail');

    const normalizedPhone = normalizeWhatsAppPhone(to);
    const logId = `wal_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const isLive = this.isConfigured();

    // Reconstruct readable message text from template definition & parameters
    const knownTemplate = BUILTIN_ADMIN_TEMPLATES.find((t) => t.name === templateName);
    let renderedText = knownTemplate ? knownTemplate.sampleText : `[Template: ${templateName}]`;
    if (knownTemplate && Array.isArray(parameters)) {
      parameters.forEach((param, idx) => {
        const val = typeof param === 'object' ? (param.text || param.value || '') : String(param);
        const key = knownTemplate.parameters[idx]?.key;
        if (key) {
          renderedText = renderedText.replaceAll(`{{${key}}}`, val);
        }
      });
    }

    if (!isLive) {
      const mockResult = {
        success: true,
        mock: true,
        logId,
        messageId: `mock_tmpl_${Date.now()}`,
        recipient: normalizedPhone,
        templateName,
        body: renderedText,
        status: 'MOCK_SENT',
        note: 'Template message simulated in sandbox mode'
      };

      await this.recordLog({
        id: logId,
        adminId,
        userId,
        recipientPhone: normalizedPhone,
        messageType: 'TEMPLATE',
        templateName,
        messageBody: renderedText,
        status: 'MOCK_SENT',
        kapsoMessageId: mockResult.messageId,
        errorMessage: null,
        metadata: { ...metadata, parameters, mock: true }
      });

      return mockResult;
    }

    const endpoint = `${this.baseUrl}/${this.phoneNumberId}/messages`;

    // Map parameters to Meta components format
    const bodyParameters = (parameters || []).map((p) => {
      const textVal = typeof p === 'object' ? (p.text || p.value || '') : String(p);
      return { type: 'text', text: String(textVal) };
    });

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode
        },
        components: bodyParameters.length > 0 ? [
          {
            type: 'body',
            parameters: bodyParameters
          }
        ] : []
      }
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data?.error?.message || `Kapso HTTP error ${response.status}`;
        await this.recordLog({
          id: logId,
          adminId,
          userId,
          recipientPhone: normalizedPhone,
          messageType: 'TEMPLATE',
          templateName,
          messageBody: renderedText,
          status: 'FAILED',
          kapsoMessageId: null,
          errorMessage: errorMsg,
          metadata: { ...metadata, parameters, errorResponse: data }
        });

        const err = new Error(`Kapso Template API error: ${errorMsg}`);
        err.status = response.status;
        err.details = data;
        throw err;
      }

      const kapsoMessageId = data?.messages?.[0]?.id || null;

      await this.recordLog({
        id: logId,
        adminId,
        userId,
        recipientPhone: normalizedPhone,
        messageType: 'TEMPLATE',
        templateName,
        messageBody: renderedText,
        status: 'SENT',
        kapsoMessageId,
        errorMessage: null,
        metadata: { ...metadata, parameters, kapsoResponse: data }
      });

      return {
        success: true,
        logId,
        messageId: kapsoMessageId,
        recipient: normalizedPhone,
        templateName,
        status: 'SENT'
      };
    } catch (err) {
      if (err.status) throw err;
      await this.recordLog({
        id: logId,
        adminId,
        userId,
        recipientPhone: normalizedPhone,
        messageType: 'TEMPLATE',
        templateName,
        messageBody: renderedText,
        status: 'FAILED',
        kapsoMessageId: null,
        errorMessage: err.message,
        metadata: { ...metadata, parameters }
      });
      throw err;
    }
  }

  /**
   * Retrieves available WhatsApp templates.
   * Merges live Kapso/Meta templates if businessAccountId is present, with builtin operational templates.
   */
  async listTemplates() {
    this.reloadConfig();
    let liveTemplates = [];

    if (this.apiKey && this.businessAccountId) {
      try {
        const endpoint = `https://api.kapso.ai/meta/whatsapp/v24.0/${this.businessAccountId}/message_templates`;
        const res = await fetch(endpoint, {
          headers: {
            'X-API-Key': this.apiKey,
            'Authorization': `Bearer ${this.apiKey}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          liveTemplates = (data.data || []).map((t) => ({
            name: t.name,
            label: t.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
            category: t.category,
            language: t.language,
            status: t.status,
            description: `Meta approved template (${t.category})`,
            parameters: (t.components || [])
              .filter((c) => c.type === 'BODY')
              .flatMap((c) => {
                const matches = (c.text || '').match(/{{(\d+)}}/g) || [];
                return matches.map((m, idx) => ({
                  key: `param_${idx + 1}`,
                  label: `Variable {{${idx + 1}}}`,
                  placeholder: `Value for {{${idx + 1}}}`,
                  required: true
                }));
              }),
            sampleText: (t.components || []).find((c) => c.type === 'BODY')?.text || t.name
          }));
        }
      } catch {
        // Fall back gracefully to built-in templates
      }
    }

    const templateMap = new Map();
    BUILTIN_ADMIN_TEMPLATES.forEach((t) => templateMap.set(t.name, t));
    liveTemplates.forEach((t) => templateMap.set(t.name, t));

    return Array.from(templateMap.values());
  }

  /**
   * Queries paginated WhatsApp delivery logs.
   */
  async getLogs({ limit = 50, offset = 0, status = null, recipient = null } = {}) {
    const cleanLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const cleanOffset = Math.max(0, parseInt(offset, 10) || 0);

    let sql = `
      SELECT id, admin_id, user_id, recipient_phone, message_type,
             template_name, message_body, status, kapso_message_id,
             error_message, metadata, created_at
      FROM admin_whatsapp_logs
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'ALL') {
      params.push(status.toUpperCase());
      sql += ` AND status = $${params.length}`;
    }

    if (recipient) {
      params.push(`%${recipient.replace(/\D/g, '')}%`);
      sql += ` AND recipient_phone LIKE $${params.length}`;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(cleanLimit, cleanOffset);

    const rowsRes = await query(sql, params).catch(() => ({ rows: [] }));

    const countSql = `
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE status IN ('SENT', 'MOCK_SENT', 'DELIVERED', 'READ'))::int AS successful,
             count(*) FILTER (WHERE status = 'FAILED')::int AS failed
      FROM admin_whatsapp_logs
    `;
    const countRes = await query(countSql, []).catch(() => ({ rows: [{ total: 0, successful: 0, failed: 0 }] }));

    return {
      logs: rowsRes.rows.map((r) => ({
        id: r.id,
        adminId: r.admin_id,
        userId: r.user_id,
        recipientPhone: r.recipient_phone,
        messageType: r.message_type,
        templateName: r.template_name,
        messageBody: r.message_body,
        status: r.status,
        kapsoMessageId: r.kapso_message_id,
        errorMessage: r.error_message,
        metadata: r.metadata,
        createdAt: r.created_at
      })),
      pagination: {
        limit: cleanLimit,
        offset: cleanOffset,
        total: countRes.rows[0]?.total || 0,
        successful: countRes.rows[0]?.successful || 0,
        failed: countRes.rows[0]?.failed || 0
      }
    };
  }

  /**
   * Internal recorder for DB logging
   */
  async recordLog({
    id,
    adminId,
    userId,
    recipientPhone,
    messageType,
    templateName,
    messageBody,
    status,
    kapsoMessageId,
    errorMessage,
    metadata
  }) {
    try {
      await query(
        `INSERT INTO admin_whatsapp_logs
         (id, admin_id, user_id, recipient_phone, message_type, template_name, message_body, status, kapso_message_id, error_message, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          id,
          adminId,
          userId,
          recipientPhone,
          messageType,
          templateName,
          messageBody,
          status,
          kapsoMessageId,
          errorMessage,
          JSON.stringify(metadata || {})
        ]
      );
    } catch {
      // Fallback silent failure if migration not yet applied in dev/test environment
    }
  }
}

export const kapsoService = new KapsoService();
export default kapsoService;
