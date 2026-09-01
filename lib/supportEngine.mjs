/**
 * Enterprise Authoritative Support & Live Chat Engine — OddsYra Sportsbook (lib/supportEngine.mjs)
 * Manages 2-way real-time user <-> admin support tickets, real-time live chat sessions,
 * live chat -> ticket escalations, SLAs, state machine transitions, assignments,
 * idempotency, strict internal notes isolation, attachments, & PostgreSQL persistence.
 */

import { broadcastWsMessage } from './websocketEngine.mjs';
import { sportsDataRegistry } from './sportsDataRegistry.mjs';
import { canonicalMatchStateEngine } from './canonicalMatchState.mjs';

let pgQuery = null;
let pgPool = null;

async function getPgPool() {
  if (typeof window !== 'undefined') return null;
  try {
    if (!pgPool) {
      const mod = await import('../db/pg.js');
      pgPool = mod.pool;
    }
    return pgPool;
  } catch {
    return null;
  }
}

async function safePgQuery(text, params) {
  if (typeof window !== 'undefined') return { rows: [], rowCount: 0 };
  try {
    if (!pgQuery) {
      const mod = await import('../db/pg.js');
      pgQuery = mod.query;
    }
    return await pgQuery(text, params);
  } catch (err) {
    console.error('[SupportEngine PG Warning]', err.message);
    return { rows: [], rowCount: 0 };
  }
}

export const SUPPORT_CATEGORIES = [
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
  // Backwards compatibility mappings
  'Account',
  'Login / OTP',
  'Deposit',
  'Withdrawal',
  'Betting',
  'Bet Settlement',
  'Bonus / Promotion',
  'Payment',
  'Technical Issue',
  'Responsible Gaming',
  'Other',
];

export const TICKET_PRIORITIES = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];

export const TICKET_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_USER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  // Legacy compatibility
  'PENDING',
  'PENDING_USER',
  'PENDING_INTERNAL',
  'ESCALATED',
  'ASSIGNED',
];

export const LIVE_CHAT_STATUSES = [
  'WAITING',
  'ACTIVE',
  'ENDED',
  'ESCALATED_TO_TICKET',
];

export const VALID_TICKET_TRANSITIONS = {
  OPEN: ['IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED', 'ASSIGNED', 'ESCALATED'],
  IN_PROGRESS: ['WAITING_FOR_USER', 'RESOLVED', 'CLOSED', 'ESCALATED', 'OPEN'],
  WAITING_FOR_USER: ['IN_PROGRESS', 'RESOLVED', 'CLOSED', 'OPEN'],
  RESOLVED: ['CLOSED', 'REOPENED', 'IN_PROGRESS', 'OPEN'],
  CLOSED: ['REOPENED'],
  REOPENED: ['IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED', 'OPEN'],
  // Legacy aliases
  ASSIGNED: ['IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED', 'ESCALATED'],
  PENDING: ['IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED', 'OPEN'],
  PENDING_USER: ['IN_PROGRESS', 'RESOLVED', 'CLOSED', 'OPEN'],
  PENDING_INTERNAL: ['IN_PROGRESS', 'RESOLVED', 'CLOSED', 'OPEN'],
  ESCALATED: ['IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED', 'OPEN'],
};

export const VALID_LIVE_CHAT_TRANSITIONS = {
  WAITING: ['ACTIVE', 'ENDED', 'ESCALATED_TO_TICKET'],
  ACTIVE: ['ENDED', 'ESCALATED_TO_TICKET', 'WAITING'],
  ENDED: [],
  ESCALATED_TO_TICKET: [],
};

export const APPROVED_RESOLUTION_CODES = [
  'ACCOUNT_UNLOCKED',
  'PROFILE_UPDATED',
  'INFORMATION_PROVIDED',
  'KYC_VERIFIED',
  'DOCUMENT_REQUIRED',
  'KYC_REJECTED',
  'KYC_ESCALATED',
  'DEPOSIT_SUCCESSFUL',
  'DEPOSIT_REVERSED',
  'PAYMENT_PROVIDER_ISSUE',
  'WITHDRAWAL_PROCESSED',
  'WITHDRAWAL_REJECTED',
  'WITHDRAWAL_REVERSED',
  'PAYMENT_PROVIDER_DELAY',
  'BET_SETTLED',
  'BET_CANCELLED',
  'BET_VOIDED',
  'BET_RULE_EXPLANATION',
  'DUPLICATE_TICKET',
  'SPAM',
  'USER_CANCELLED',
  'OTHER_APPROVED',
];

export const TERMINAL_NOT_REQUIRED_CODES = [
  'DUPLICATE_TICKET',
  'SPAM',
  'USER_CANCELLED',
  'OTHER_APPROVED',
];

export const SUPPORT_TEAMS = ['SUPPORT_AGENT', 'SUPPORT_SUPERVISOR', 'PAYMENTS', 'KYC_FRAUD', 'RISK'];

let ticketCounter = Math.floor(10000 + Math.random() * 80000);

export function generateTicketReference() {
  const year = new Date().getFullYear();
  ticketCounter += 1;
  const randSuffix = Math.floor(10 + Math.random() * 90);
  const seq = `${String(ticketCounter).slice(-5)}${randSuffix}`;
  return `OD-${year}-${seq}`;
}

class SupportEngine {
  constructor() {
    this.tickets = new Map();
    this.conversations = new Map(); // conversationId -> conversation / ticket / live chat
    this.idempotencyMap = new Map(); // idempotencyKey -> message
    this.knowledgeBase = [
      { id: 'kb_01', title: 'Withdrawal Processing & Timelines', category: 'WITHDRAWAL', content: 'UPI & NetBanking withdrawals are processed within 15 minutes to KYC-verified accounts.' },
      { id: 'kb_02', title: 'Live Match Bet Settlement Rules', category: 'BET_SETTLEMENT', content: 'Bets are settled instantly upon official match event confirmation. In case of rain or abandonment, bets follow official league rules.' },
      { id: 'kb_03', title: 'Deposit Bonus Wagering Requirements', category: 'BONUS', content: 'Deposit bonus funds carry a 5x wagering requirement on sports selections with minimum odds of 1.50.' },
      { id: 'kb_04', title: 'Identity Verification (KYC) Guide', category: 'KYC', content: 'Upload valid PAN Card or Aadhaar Card in your Profile. Verification is completed within 2 hours.' },
    ];

    // Seed demo active conversation
    this.seedDemoConversation();
  }

  seedDemoConversation() {
    const convId = 'conv_demo_9912';
    if (!this.conversations.has(convId)) {
      const createdAt = new Date().toISOString();
      const slaDueAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      const conv = {
        conversationId: convId,
        supportType: 'TICKET',
        conversationNumber: 'OD-2026-10245',
        ticketNumber: 'OD-2026-10245',
        ticketReference: 'OD-2026-10245',
        userId: 'demo@oddsyra.com',
        tenantId: 'oddsyra_in',
        subject: 'UPI Withdrawal Status Query',
        category: 'WITHDRAWAL',
        priority: 'HIGH',
        status: 'OPEN',
        assignedAgentId: 'agent_priya',
        assignedAgentName: 'Priya Sharma',
        assignedTeam: 'PAYMENTS',
        slaDueAt,
        firstResponseDueAt: slaDueAt,
        resolutionDueAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        firstResponseAt: null,
        resolvedAt: null,
        closedAt: null,
        reopenedAt: null,
        unreadUserCount: 0,
        unreadAdminCount: 1,
        createdAt,
        updatedAt: createdAt,
        lastMessage: 'My withdrawal of ₹1,000 via UPI is still pending.',
        messages: [
          {
            id: 'msg_demo_1',
            messageId: 'msg_demo_1',
            conversationId: convId,
            senderId: 'demo@oddsyra.com',
            senderType: 'user',
            messageType: 'USER_MESSAGE',
            agentName: null,
            text: 'My withdrawal of ₹1,000 via UPI is still pending.',
            attachments: [],
            deliveredAt: createdAt,
            readAt: createdAt,
            createdAt,
          },
        ],
        internalNotes: [
          {
            noteId: 'note_demo_1',
            conversationId: convId,
            agentId: 'Priya Sharma',
            text: 'Verified user identity. Banking gateway UTR response pending from ICICI gateway.',
            createdAt,
          },
        ],
      };
      this.conversations.set(convId, conv);
    }
  }

  calculateSlaStatus(conv) {
    if (!conv) return 'WITHIN_SLA';
    if (conv.status === 'RESOLVED' || conv.status === 'CLOSED' || conv.status === 'ENDED' || conv.status === 'ESCALATED_TO_TICKET') return 'WITHIN_SLA';
    if (!conv.slaDueAt) return 'WITHIN_SLA';

    const now = Date.now();
    const dueTime = new Date(conv.slaDueAt).getTime();
    const diffMins = (dueTime - now) / (1000 * 60);

    if (diffMins < 0) return 'SLA_BREACHED';
    if (diffMins <= 30) return 'APPROACHING_SLA';
    return 'WITHIN_SLA';
  }

  /**
   * Verify related entity belongs to the user and exists.
   */
  async verifyRelatedEntity(userId, entityType, entityId) {
    if (!entityType || !entityId) return { valid: true, entity: null };

    const type = String(entityType).toUpperCase();
    try {
      if (type === 'BET') {
        const res = await safePgQuery(`SELECT bet_id, stake, odds, status FROM bets WHERE bet_id = $1 AND user_id = $2`, [entityId, userId]);
        if (res.rows.length === 0) return { valid: false, error: 'Bet record not found or does not belong to you.' };
        return { valid: true, entity: res.rows[0] };
      }
      if (type === 'TRANSACTION' || type === 'DEPOSIT' || type === 'WITHDRAWAL') {
        const res = await safePgQuery(
          `SELECT transaction_id, type, amount, status FROM transactions WHERE transaction_id = $1 AND user_id = $2`,
          [entityId, userId]
        );
        if (res.rows.length === 0) return { valid: false, error: 'Financial transaction record not found or does not belong to you.' };
        return { valid: true, entity: res.rows[0] };
      }
      if (type === 'KYC' || type === 'KYC_CASE') {
        const res = await safePgQuery(
          `SELECT id, status FROM kyc_verifications WHERE (id = $1 OR user_id = $1) AND user_id = $2`,
          [entityId, userId]
        );
        if (res.rows.length === 0) return { valid: false, error: 'KYC record not found or does not belong to you.' };
        return { valid: true, entity: res.rows[0] };
      }
      if (type === 'REFERRAL') {
        const res = await safePgQuery(
          `SELECT id, referrer_id, referee_id FROM referrals WHERE (id = $1 OR referrer_id = $2 OR referee_id = $2)`,
          [entityId, userId]
        );
        if (res.rows.length === 0) return { valid: false, error: 'Referral record not found or does not belong to you.' };
        return { valid: true, entity: res.rows[0] };
      }
    } catch {
      // In-memory fallback if table uninitialized in test
    }
    return { valid: true, entity: { entityType: type, entityId } };
  }

  /**
   * Support User Financial Summary
   * Queries authoritative wallets, transactions, deposits, and withdrawals.
   * Safe for users with zero transactions and never exposes sensitive payment credentials.
   */
  async getSupportUserFinancialSummary(userId) {
    if (!userId) return null;
    try {
      // 1. Authoritative Wallet Balance
      const wRes = await safePgQuery(
        `SELECT wallet_id, balance, bonus_balance,
                COALESCE(freebet_balance, 0) AS freebet_balance,
                COALESCE(locked_deposit_balance, 0) AS locked_deposit_balance,
                COALESCE(reserved_balance, 0) AS reserved_balance,
                COALESCE(winnings_balance, 0) AS winnings_balance,
                currency
         FROM wallets WHERE user_id = $1`,
        [userId],
      );
      const wallet = wRes.rows[0] || {
        balance: 0,
        bonus_balance: 0,
        freebet_balance: 0,
        locked_deposit_balance: 0,
        reserved_balance: 0,
        winnings_balance: 0,
        currency: 'INR',
      };

      // 2. Authoritative Financial Transactions
      const txRes = await safePgQuery(
        `SELECT transaction_id, type, method, amount, status, created_at
         FROM transactions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [userId],
      );

      // 3. Lifetime Deposit and Withdrawal Stats
      const depRes = await safePgQuery(
        `SELECT COALESCE(SUM(amount), 0) AS total_deposited, COUNT(*) AS deposit_count
         FROM deposits
         WHERE user_id = $1 AND status IN ('PAID', 'CAPTURED', 'SUCCESS')`,
        [userId],
      );
      const wdRes = await safePgQuery(
        `SELECT COALESCE(SUM(amount), 0) AS total_withdrawn, COUNT(*) AS withdrawal_count
         FROM withdrawals
         WHERE user_id = $1 AND status IN ('COMPLETED', 'SUCCESS', 'PAID')`,
        [userId],
      );

      return {
        userId,
        wallet: {
          balance: Number(wallet.balance || 0),
          bonusBalance: Number(wallet.bonus_balance || 0),
          freebetBalance: Number(wallet.freebet_balance || 0),
          lockedDepositBalance: Number(wallet.locked_deposit_balance || 0),
          reservedBalance: Number(wallet.reserved_balance || 0),
          winningsBalance: Number(wallet.winnings_balance || 0),
          currency: wallet.currency || 'INR',
        },
        lifetime: {
          totalDeposited: Number(depRes.rows[0]?.total_deposited || 0),
          depositCount: Number(depRes.rows[0]?.deposit_count || 0),
          totalWithdrawn: Number(wdRes.rows[0]?.total_withdrawn || 0),
          withdrawalCount: Number(wdRes.rows[0]?.withdrawal_count || 0),
        },
        recentTransactions: (txRes.rows || []).map((tx) => ({
          transactionId: tx.transaction_id,
          type: tx.type,
          method: tx.method,
          amount: Number(tx.amount || 0),
          status: tx.status,
          createdAt: tx.created_at,
        })),
      };
    } catch {
      return {
        userId,
        wallet: { balance: 0, bonusBalance: 0, freebetBalance: 0, lockedDepositBalance: 0, reservedBalance: 0, winningsBalance: 0, currency: 'INR' },
        lifetime: { totalDeposited: 0, depositCount: 0, totalWithdrawn: 0, withdrawalCount: 0 },
        recentTransactions: [],
      };
    }
  }

  /**
   * Start a support ticket
   */
  async startConversation({
    userId,
    subject = 'Customer Support Inquiry',
    category = 'OTHER',
    priority = 'NORMAL',
    initialMessage = '',
    attachments = [],
    idempotencyKey = null,
    tenantId = 'oddsyra_in',
    relatedEntityType = null,
    relatedEntityId = null,
    bypassDuplicateCheck = false,
    supportType = 'TICKET',
    escalatedFromChatId = null,
  }) {
    // Phase 4: Duplicate Ticket Prevention (in-memory; list endpoint hydrates from Postgres)
    if (!bypassDuplicateCheck && supportType === 'TICKET') {
      const wantCategory = String(category || 'OTHER').toUpperCase();
      const activeStatuses = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'PENDING_USER', 'PENDING_INTERNAL', 'ESCALATED', 'REOPENED'];
      const activeConvs = Array.from(this.conversations.values()).filter((c) =>
        c.userId === userId &&
        (c.supportType || 'TICKET') === 'TICKET' &&
        activeStatuses.includes(String(c.status || '').toUpperCase()) &&
        (
          String(c.category || '').toUpperCase() === wantCategory
          || (relatedEntityId && c.relatedEntityId === relatedEntityId)
        )
      );

      if (activeConvs.length > 0) {
        const existingTicket = activeConvs[0];
        return {
          isDuplicate: true,
          message: 'You already have an active support request for this issue.',
          activeTicket: existingTicket,
          conversationId: existingTicket.conversationId,
          ticketNumber: existingTicket.ticketReference || existingTicket.ticketNumber || existingTicket.conversationNumber,
          ticketReference: existingTicket.ticketReference || existingTicket.ticketNumber || existingTicket.conversationNumber,
        };
      }
    }

    const convId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const ticketRef = generateTicketReference();
    const createdAt = new Date().toISOString();

    let slaMinutes = 15;
    let calculatedPriority = priority;
    const normCat = String(category).toUpperCase();
    if (['WITHDRAWAL', 'DEPOSIT', 'PAYMENT', 'SECURITY'].includes(normCat)) {
      calculatedPriority = calculatedPriority === 'URGENT' ? 'URGENT' : 'HIGH';
    } else if (['KYC', 'BET', 'BET_SETTLEMENT', 'VIP'].includes(normCat)) {
      calculatedPriority = calculatedPriority === 'URGENT' ? 'URGENT' : 'HIGH';
    }

    try {
      const { getBenefitsForTier } = await import('./vipBenefits.mjs');
      const loyalty = await safePgQuery(`SELECT tier FROM user_loyalty WHERE user_id = $1`, [userId]);
      const vip = getBenefitsForTier(loyalty.rows[0]?.tier);
      slaMinutes = vip?.supportSlaMinutes || slaMinutes;
      if (vip?.prioritySupport) calculatedPriority = 'HIGH';
      if (vip?.dedicatedManager) calculatedPriority = 'URGENT';
    } catch {
      // VIP lookup is best-effort
    }

    const slaDueAt = new Date(Date.now() + slaMinutes * 60 * 1000).toISOString();

    let assignedTeam = 'SUPPORT_AGENT';
    if (['WITHDRAWAL', 'DEPOSIT', 'PAYMENT'].includes(normCat)) {
      assignedTeam = 'PAYMENTS';
    } else if (['KYC', 'RESPONSIBLE GAMING', 'SECURITY'].includes(normCat)) {
      assignedTeam = 'KYC_FRAUD';
    } else if (['BET', 'BETTING', 'BET_SETTLEMENT'].includes(normCat)) {
      assignedTeam = 'RISK';
    }

    const conversation = {
      conversationId: convId,
      supportType,
      conversationNumber: ticketRef,
      ticketNumber: ticketRef,
      ticketReference: ticketRef,
      userId,
      tenantId,
      subject: subject || 'Customer Support Inquiry',
      category: category || normCat || 'OTHER',
      priority: calculatedPriority,
      status: supportType === 'LIVE_CHAT' ? 'WAITING' : 'OPEN',
      assignedAgentId: null,
      assignedAgentName: assignedTeam === 'PAYMENTS'
        ? 'Payments queue'
        : assignedTeam === 'KYC_FRAUD'
          ? 'KYC / Fraud queue'
          : assignedTeam === 'RISK'
            ? 'Risk / Betting queue'
            : 'Support queue',
      assignedTeam,
      slaDueAt,
      firstResponseDueAt: slaDueAt,
      resolutionDueAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      firstResponseAt: null,
      resolvedAt: null,
      closedAt: null,
      reopenedAt: null,
      resolutionStatus: 'NOT_PROVIDED',
      resolutionCode: null,
      resolutionSummary: null,
      resolvedBy: null,
      relatedEntityType,
      relatedEntityId,
      escalatedFromChatId,
      unreadUserCount: 0,
      unreadAdminCount: 1,
      createdAt,
      updatedAt: createdAt,
      lastMessage: initialMessage,
      messages: [],
      internalNotes: [],
    };

    if (initialMessage) {
      const initialMsgObj = {
        id: `msg_${Date.now()}_1`,
        messageId: `msg_${Date.now()}_1`,
        conversationId: convId,
        senderId: userId,
        senderType: 'user',
        messageType: 'USER_MESSAGE',
        agentName: null,
        text: initialMessage || 'New support request',
        attachments: attachments || [],
        idempotencyKey: idempotencyKey || null,
        deliveredAt: createdAt,
        readAt: null,
        createdAt,
      };
      conversation.messages.push(initialMsgObj);
      if (idempotencyKey) {
        this.idempotencyMap.set(idempotencyKey, initialMsgObj);
      }
    }

    this.conversations.set(convId, conversation);

    // Transactional PostgreSQL persistence with collision retry
    let persisted = false;
    let attempts = 0;
    let currentTicketRef = ticketRef;
    const pool = await getPgPool();

    while (!persisted && attempts < 5) {
      attempts += 1;
      let client = null;
      try {
        if (pool && typeof pool.connect === 'function') {
          client = await pool.connect();
          await client.query('BEGIN');

          // Ensure user exists in users table safely
          const userCheck = await client.query('SELECT user_id FROM users WHERE user_id = $1', [userId]);
          if (userCheck.rows.length === 0) {
            // Fail closed: never invent a user row to satisfy the FK.
            await client.query('ROLLBACK');
            persisted = true;
            break;
          }

          // Insert support_conversations
          await client.query(
            `INSERT INTO support_conversations
             (conversation_id, conversation_number, ticket_number, user_id, tenant_id, subject, category, priority, status, assigned_team, sla_due_at, unread_user_count, unread_admin_count, related_entity_type, related_entity_id, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
             ON CONFLICT (conversation_id) DO NOTHING`,
            [
              convId,
              currentTicketRef,
              currentTicketRef,
              userId,
              tenantId,
              conversation.subject,
              conversation.category,
              conversation.priority,
              conversation.status,
              conversation.assignedTeam,
              slaDueAt,
              0,
              1,
              relatedEntityType || null,
              relatedEntityId || null,
              createdAt,
              createdAt,
            ]
          );

          // Insert initial message
          if (conversation.messages.length > 0) {
            const msg = conversation.messages[0];
            await client.query(
              `INSERT INTO support_messages
               (message_id, conversation_id, sender, sender_id, sender_type, message_type, agent_name, text, attachments, idempotency_key, delivered_at, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
               ON CONFLICT (message_id) DO NOTHING`,
              [
                msg.messageId,
                convId,
                'user',
                userId,
                'user',
                'USER_MESSAGE',
                null,
                msg.text,
                JSON.stringify(attachments || []),
                idempotencyKey || null,
                createdAt,
                createdAt,
              ]
            );
          }

          // Insert audit log
          await client.query(
            `INSERT INTO support_audit_logs (conversation_id, actor_id, action, details)
             VALUES ($1, $2, $3, $4)`,
            [convId, userId, supportType === 'LIVE_CHAT' ? 'CHAT_STARTED' : 'TICKET_CREATED', JSON.stringify({
              ticketReference: currentTicketRef,
              category: conversation.category,
              priority: conversation.priority,
              supportType,
            })]
          );

          await client.query('COMMIT');
          persisted = true;
          conversation.ticketNumber = currentTicketRef;
          conversation.ticketReference = currentTicketRef;
          conversation.conversationNumber = currentTicketRef;
        } else {
          persisted = true;
        }
      } catch (txErr) {
        if (client) {
          try { await client.query('ROLLBACK'); } catch (_) {}
        }
        if (txErr.message?.includes('duplicate key value') || txErr.message?.includes('ticket_number')) {
          currentTicketRef = generateTicketReference();
        } else {
          console.error('[SupportEngine PG Tx Error]', txErr.message);
          break;
        }
      } finally {
        if (client) client.release();
      }
    }

    this.addAuditLog(convId, userId, supportType === 'LIVE_CHAT' ? 'CHAT_STARTED' : 'TICKET_CREATED', {
      ticketReference: ticketRef,
      category: conversation.category,
      priority: conversation.priority,
      supportType,
    });

    // Broadcast WebSocket event
    broadcastWsMessage(supportType === 'LIVE_CHAT' ? 'support.livechat.created' : 'support.conversation.created', {
      conversationId: convId,
      conversationNumber: ticketRef,
      ticketNumber: ticketRef,
      ticketReference: ticketRef,
      supportType,
      userId,
      subject: conversation.subject,
      category: conversation.category,
      status: conversation.status,
      timestamp: Date.now(),
    });

    try {
      const {
        notifyAdminSupportEvent,
        notifyUserSupportEvent,
        emailSupportInboxOnTicketCreated,
        emailUserOnTicketCreated,
      } = await import('./supportNotify.mjs');

      if (supportType === 'LIVE_CHAT') {
        await notifyAdminSupportEvent({
          title: `New Waiting Live Chat from ${userId}`,
          message: `${conversation.subject}: ${String(initialMessage || '').slice(0, 160)}`,
          conversationId: convId,
          priority: 'HIGH',
        });
      } else {
        await notifyAdminSupportEvent({
          title: `New support ticket ${ticketRef}`,
          message: `${conversation.subject}: ${String(initialMessage || '').slice(0, 160)}`,
          conversationId: convId,
          priority: calculatedPriority === 'URGENT' ? 'URGENT' : 'HIGH',
        });
        await notifyUserSupportEvent({
          userId,
          eventType: 'support.ticket.created',
          subject: `Ticket ${ticketRef} created`,
          message: 'Your support request was received. Our team will reply soon.',
          conversationId: convId,
          eventId: `ticket_created_${convId}`,
        });
        void emailSupportInboxOnTicketCreated({
          ticketNumber: ticketRef,
          ticketReference: ticketRef,
          conversationId: convId,
          conversationNumber: ticketRef,
          userId,
          subject: conversation.subject,
          category: conversation.category,
          priority: conversation.priority,
          message: initialMessage,
          createdAt,
        });
        void emailUserOnTicketCreated({
          ticketNumber: ticketRef,
          ticketReference: ticketRef,
          conversationId: convId,
          conversationNumber: ticketRef,
          userId,
          subject: conversation.subject,
          category: conversation.category,
        });
      }
    } catch (err) {
      console.error('[SupportEngine notify]', err.message);
    }

    return conversation;
  }

  /**
   * Start Live Chat Session
   */
  async startLiveChat({ userId, tenantId = 'oddsyra_in', initialMessage = '', subject = 'Live Chat Inquiry' }) {
    // Check if user already has an active live chat
    const activeChat = Array.from(this.conversations.values()).find(
      (c) => c.userId === userId && c.supportType === 'LIVE_CHAT' && (c.status === 'WAITING' || c.status === 'ACTIVE')
    );

    if (activeChat) {
      return activeChat;
    }

    return this.startConversation({
      userId,
      subject: subject || 'Live Chat Session',
      category: 'TECHNICAL',
      priority: 'HIGH',
      initialMessage,
      tenantId,
      supportType: 'LIVE_CHAT',
      bypassDuplicateCheck: true,
    });
  }

  /**
   * Accept Live Chat by Agent
   */
  async acceptLiveChat(conversationId, { agentId, agentName = 'OddsYra Agent' }) {
    const conv = await this.ensureConversationInMemory(conversationId);
    if (!conv) throw new Error('Live chat conversation not found');

    if (conv.status === 'ENDED' || conv.status === 'ESCALATED_TO_TICKET') {
      throw new Error(`Cannot accept chat with status ${conv.status}`);
    }

    // Atomic race-check: if already active by another agent
    if (conv.assignedAgentId && conv.assignedAgentId !== agentId && conv.status === 'ACTIVE') {
      throw new Error(`Chat already accepted by ${conv.assignedAgentName || conv.assignedAgentId}`);
    }

    conv.assignedAgentId = agentId;
    conv.assignedAgentName = agentName;
    conv.status = 'ACTIVE';
    conv.updatedAt = new Date().toISOString();

    try {
      await safePgQuery(
        `UPDATE support_conversations
         SET assigned_agent_id = $1, assigned_agent_name = $2, status = 'ACTIVE', updated_at = NOW()
         WHERE conversation_id = $3`,
        [agentId, agentName, conversationId]
      );
    } catch (ignored) {}

    this.addAuditLog(conversationId, agentId, 'CHAT_ACCEPTED', { agentId, agentName });

    // Send system message to chat
    await this.addMessage(conversationId, {
      senderId: 'system',
      senderType: 'system',
      messageType: 'SYSTEM_MESSAGE',
      agentName: null,
      text: `${agentName} has joined the chat.`,
    });

    broadcastWsMessage('support.livechat.accepted', {
      conversationId,
      agentId,
      agentName,
      status: 'ACTIVE',
      timestamp: Date.now(),
    });

    try {
      const { notifyUserSupportEvent } = await import('./supportNotify.mjs');
      await notifyUserSupportEvent({
        userId: conv.userId,
        eventType: 'support.livechat.agent_joined',
        subject: `${agentName} joined your live chat`,
        message: 'A support agent is now ready to assist you.',
        conversationId,
        eventId: `chat_joined_${conversationId}`,
      });
    } catch (ignored) {}

    return conv;
  }

  /**
   * End Live Chat Session
   */
  async endLiveChat(conversationId, { endedBy = 'user', actorType = 'user' } = {}) {
    const conv = await this.ensureConversationInMemory(conversationId);
    if (!conv) throw new Error('Live chat conversation not found');

    conv.status = 'ENDED';
    conv.closedAt = new Date().toISOString();
    conv.updatedAt = conv.closedAt;

    try {
      await safePgQuery(
        `UPDATE support_conversations
         SET status = 'ENDED', closed_at = NOW(), updated_at = NOW()
         WHERE conversation_id = $1`,
        [conversationId]
      );
    } catch (ignored) {}

    this.addAuditLog(conversationId, endedBy, 'CHAT_ENDED', { endedBy, actorType });

    await this.addMessage(conversationId, {
      senderId: 'system',
      senderType: 'system',
      messageType: 'SYSTEM_MESSAGE',
      agentName: null,
      text: `Live chat ended by ${actorType === 'admin' ? 'support agent' : 'user'}.`,
    });

    broadcastWsMessage('support.livechat.ended', {
      conversationId,
      status: 'ENDED',
      endedBy,
      timestamp: Date.now(),
    });

    return conv;
  }

  /**
   * Escalate Live Chat to Support Ticket
   */
  async escalateChatToTicket(conversationId, {
    category = 'OTHER',
    priority = 'NORMAL',
    subject = '',
    assignedAgentId = null,
    assignedAgentName = null,
    agentId = 'admin',
  } = {}) {
    const chat = await this.ensureConversationInMemory(conversationId);
    if (!chat) throw new Error('Live chat conversation not found');

    const ticketSubject = subject || `Escalated Chat: ${chat.subject || 'Support Request'}`;
    const latestMsg = chat.messages?.[chat.messages.length - 1]?.text || '';
    const initialText = `[Escalated from Live Chat Session ${chat.conversationNumber || chat.conversationId}]\nLinked Live Chat Session: ${conversationId}${latestMsg ? `\nSummary: ${latestMsg}` : ''}`;

    // Create the ticket
    const ticket = await this.startConversation({
      userId: chat.userId,
      tenantId: chat.tenantId,
      subject: ticketSubject,
      category,
      priority,
      initialMessage: initialText,
      supportType: 'TICKET',
      escalatedFromChatId: conversationId,
      bypassDuplicateCheck: true,
    });

    if (assignedAgentId) {
      await this.assignAgent(ticket.conversationId, {
        agentId: assignedAgentId,
        agentName: assignedAgentName || 'Support Agent',
        assignedBy: agentId,
      });
    }

    // Mark original chat as ESCALATED_TO_TICKET
    chat.status = 'ESCALATED_TO_TICKET';
    chat.updatedAt = new Date().toISOString();

    try {
      await safePgQuery(
        `UPDATE support_conversations
         SET status = 'ESCALATED_TO_TICKET', updated_at = NOW()
         WHERE conversation_id = $1`,
        [conversationId]
      );
    } catch (ignored) {}

    this.addAuditLog(conversationId, agentId, 'CHAT_ESCALATED', {
      ticketId: ticket.conversationId,
      ticketReference: ticket.ticketReference,
      category,
      priority,
    });

    await this.addMessage(conversationId, {
      senderId: 'system',
      senderType: 'system',
      messageType: 'SYSTEM_MESSAGE',
      agentName: null,
      text: `Live chat has been escalated to support ticket ${ticket.ticketReference}. You can track replies in Profile → Support.`,
    });

    broadcastWsMessage('support.livechat.escalated', {
      conversationId,
      status: 'ESCALATED_TO_TICKET',
      ticketId: ticket.conversationId,
      ticketReference: ticket.ticketReference,
      timestamp: Date.now(),
    });

    return { chat, ticket };
  }

  /**
   * Add message to conversation (Ticket or Live Chat)
   */
  async addMessage(
    conversationId,
    {
      senderId = 'system',
      senderType = 'user', // user | admin | system
      messageType = 'USER_MESSAGE', // USER_MESSAGE | ADMIN_MESSAGE | INTERNAL_NOTE | SYSTEM_MESSAGE
      agentName = 'OddsYra Support',
      text = '',
      attachments = [],
      idempotencyKey = null,
    }
  ) {
    if (idempotencyKey && this.idempotencyMap.has(idempotencyKey)) {
      return this.idempotencyMap.get(idempotencyKey);
    }

    let conv = this.conversations.get(conversationId);
    if (!conv) {
      conv = await this.getConversationById(conversationId, 'admin');
      if (conv) {
        conv.messages = conv.messages || [];
        conv.internalNotes = conv.internalNotes || [];
        this.conversations.set(conversationId, conv);
      }
    }
    if (!conv) return null;

    const createdAt = new Date().toISOString();
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const message = {
      id: msgId,
      messageId: msgId,
      conversationId,
      senderId,
      senderType,
      messageType: messageType || (senderType === 'admin' ? 'ADMIN_MESSAGE' : 'USER_MESSAGE'),
      agentName: senderType === 'admin' ? agentName : null,
      text,
      attachments: attachments || [],
      idempotencyKey: idempotencyKey || null,
      deliveredAt: createdAt,
      readAt: null,
      createdAt,
    };

    if (messageType === 'INTERNAL_NOTE') {
      conv.internalNotes = conv.internalNotes || [];
      conv.internalNotes.push({
        noteId: `note_${Date.now()}`,
        conversationId,
        agentId: agentName,
        text,
        createdAt,
      });
      conv.messages.push(message);

      this.addAuditLog(conversationId, senderId, 'INTERNAL_NOTE_CREATED', {
        agentId: senderId,
        preview: String(text).slice(0, 100),
      });
    } else {
      conv.messages.push(message);
      conv.lastMessage = text;
      conv.updatedAt = createdAt;

      // Auto-Reopen logic for Tickets: if user replies to RESOLVED/CLOSED ticket, reopen it
      if (
        conv.supportType === 'TICKET' &&
        senderType === 'user' &&
        (conv.status === 'RESOLVED' || conv.status === 'CLOSED')
      ) {
        conv.status = 'OPEN';
        conv.reopenedAt = createdAt;
        this.addAuditLog(conversationId, senderId, 'TICKET_STATUS_CHANGED', {
          oldStatus: 'RESOLVED',
          newStatus: 'OPEN',
          reason: 'User reply received',
        });

        broadcastWsMessage('support.conversation.reopened', {
          conversationId,
          userId: conv.userId,
          reopenedAt: createdAt,
        });
      }

      if (senderType === 'user') {
        conv.unreadAdminCount = (conv.unreadAdminCount || 0) + 1;
        if (conv.status === 'WAITING_FOR_USER') conv.status = 'IN_PROGRESS';
      } else if (senderType === 'admin') {
        conv.unreadUserCount = (conv.unreadUserCount || 0) + 1;
        if (!conv.firstResponseAt) conv.firstResponseAt = createdAt;
        if (conv.supportType === 'TICKET' && conv.status === 'OPEN') conv.status = 'IN_PROGRESS';
      }
    }

    if (idempotencyKey) {
      this.idempotencyMap.set(idempotencyKey, message);
    }

    // Persist to PostgreSQL
    try {
      await safePgQuery(
        `INSERT INTO support_messages
         (message_id, conversation_id, sender, sender_id, sender_type, message_type, agent_name, text, attachments, idempotency_key, delivered_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (message_id) DO NOTHING`,
        [
          msgId,
          conversationId,
          senderType,
          senderId,
          senderType,
          message.messageType,
          message.agentName,
          text,
          JSON.stringify(attachments),
          idempotencyKey,
          createdAt,
          createdAt,
        ]
      );

      await safePgQuery(
        `UPDATE support_conversations
         SET status = $1, updated_at = $2, unread_user_count = $3, unread_admin_count = $4, first_response_at = COALESCE(first_response_at, $5)
         WHERE conversation_id = $6`,
        [conv.status, createdAt, conv.unreadUserCount, conv.unreadAdminCount, conv.firstResponseAt, conversationId]
      );
    } catch (err) {
      console.error('[SupportEngine PG Message Persist Warning]', err.message);
    }

    // Broadcast WebSocket message (INTERNAL_NOTE is NEVER broadcasted)
    if (messageType !== 'INTERNAL_NOTE') {
      broadcastWsMessage('support.message.created', {
        conversationId,
        messageId: msgId,
        senderType,
        messageType: message.messageType,
        text,
        agentName: message.agentName,
        createdAt,
        timestamp: Date.now(),
      });

      try {
        const { notifyAdminSupportEvent, notifyUserSupportEvent, emailUserOnAdminReply } = await import('./supportNotify.mjs');
        const fullMessageText = String(text || '').trim();
        const preview = fullMessageText.slice(0, 160);
        const ticketLabel = conv.ticketReference || conv.ticketNumber || conv.conversationNumber || conversationId;

        if (senderType === 'user') {
          await notifyAdminSupportEvent({
            title: `New reply on ${ticketLabel}`,
            message: preview || 'Customer sent a new message',
            conversationId,
            priority: 'HIGH',
          });
        } else if (senderType === 'admin') {
          await notifyUserSupportEvent({
            userId: conv.userId,
            eventType: 'support.message.admin',
            subject: `Support replied on ${ticketLabel}`,
            message: preview || 'You have a new reply from support.',
            conversationId,
            eventId: `admin_msg_${msgId}`,
          });
          if (fullMessageText) {
            void emailUserOnAdminReply({
              userId: conv.userId,
              ticketNumber: ticketLabel,
              ticketId: ticketLabel,
              agentReply: fullMessageText,
              messageText: fullMessageText,
              content: fullMessageText,
              preview: fullMessageText,
            });
          }
        }
      } catch (err) {
        console.error('[SupportEngine message notify]', err.message);
      }
    }

    return message;
  }

  /**
   * Atomic Agent Assignment with race protection
   */
  async assignAgent(conversationId, { agentId, agentName = 'Support Agent', teamId = 'SUPPORT_AGENT', assignedBy = 'admin', force = false }) {
    const conv = await this.ensureConversationInMemory(conversationId);
    if (!conv) return null;

    if (!force && conv.assignedAgentId && conv.assignedAgentId !== agentId && assignedBy !== 'super_admin' && assignedBy !== 'admin') {
      throw new Error(`Ticket is already assigned to ${conv.assignedAgentName || conv.assignedAgentId}`);
    }

    const previousAgent = conv.assignedAgentId;
    conv.assignedAgentId = agentId;
    conv.assignedAgentName = agentName;
    conv.assignedTeam = teamId;
    if (conv.status === 'OPEN') {
      conv.status = 'IN_PROGRESS';
    }
    conv.updatedAt = new Date().toISOString();

    try {
      await safePgQuery(
        `UPDATE support_conversations
         SET assigned_agent_id = $1, assigned_agent_name = $2, assigned_team = $3, status = $4, updated_at = NOW()
         WHERE conversation_id = $5`,
        [agentId, agentName, teamId, conv.status, conversationId]
      );

      const assignId = `asgn_${Date.now()}`;
      await safePgQuery(
        `INSERT INTO support_assignments (assignment_id, conversation_id, assigned_by, agent_id, agent_name, team_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [assignId, conversationId, assignedBy, agentId, agentName, teamId]
      );
    } catch (ignored) {}

    this.addAuditLog(conversationId, assignedBy, previousAgent ? 'TICKET_TRANSFERRED' : 'TICKET_ASSIGNED', {
      agentId,
      agentName,
      teamId,
      previousAgent,
    });

    broadcastWsMessage('support.conversation.assigned', {
      conversationId,
      assignedAgentId: agentId,
      assignedAgentName: agentName,
      assignedTeam: teamId,
      status: conv.status,
      timestamp: Date.now(),
    });

    return conv;
  }

  /**
   * Controlled Ticket Status Transition
   */
  async updateStatus(conversationId, { status = 'RESOLVED', resolutionReason = '', actorId = 'admin', reason = '' }) {
    const conv = await this.ensureConversationInMemory(conversationId);
    if (!conv) return null;

    const currentStatus = conv.status || 'OPEN';
    const targetStatus = status.toUpperCase();

    // Check valid transitions
    const allowed = VALID_TICKET_TRANSITIONS[currentStatus];
    if (allowed && !allowed.includes(targetStatus) && targetStatus !== currentStatus) {
      throw new Error(`Invalid status transition from ${currentStatus} to ${targetStatus}. Allowed: ${allowed.join(', ')}`);
    }

    const now = new Date().toISOString();
    conv.status = targetStatus;
    conv.updatedAt = now;

    if (targetStatus === 'RESOLVED') {
      conv.resolvedAt = now;
      conv.unreadUserCount = (conv.unreadUserCount || 0) + 1;
    } else if (targetStatus === 'CLOSED') {
      conv.closedAt = now;
    } else if (targetStatus === 'REOPENED') {
      conv.reopenedAt = now;
    }

    try {
      await safePgQuery(
        `UPDATE support_conversations
         SET status = $1, resolved_at = COALESCE(resolved_at, $2), closed_at = COALESCE(closed_at, $3), updated_at = NOW()
         WHERE conversation_id = $4`,
        [targetStatus, conv.resolvedAt, conv.closedAt, conversationId]
      );
    } catch (ignored) {}

    this.addAuditLog(conversationId, actorId, 'TICKET_STATUS_CHANGED', {
      oldStatus: currentStatus,
      newStatus: targetStatus,
      resolutionReason: resolutionReason || reason,
    });

    broadcastWsMessage('support.conversation.status_changed', {
      conversationId,
      oldStatus: currentStatus,
      status: targetStatus,
      resolutionReason,
      timestamp: Date.now(),
    });

    return conv;
  }

  /**
   * Update Ticket Priority
   */
  async updatePriority(conversationId, { priority = 'NORMAL', actorId = 'admin' }) {
    const conv = await this.ensureConversationInMemory(conversationId);
    if (!conv) return null;

    const normPri = String(priority).toUpperCase();
    if (!TICKET_PRIORITIES.includes(normPri)) {
      throw new Error(`Invalid priority '${priority}'. Allowed: ${TICKET_PRIORITIES.join(', ')}`);
    }

    const oldPriority = conv.priority;
    conv.priority = normPri;
    conv.updatedAt = new Date().toISOString();

    try {
      await safePgQuery(
        `UPDATE support_conversations SET priority = $1, updated_at = NOW() WHERE conversation_id = $2`,
        [normPri, conversationId]
      );
    } catch (ignored) {}

    this.addAuditLog(conversationId, actorId, 'TICKET_PRIORITY_CHANGED', {
      oldPriority,
      newPriority: normPri,
    });

    broadcastWsMessage('support.conversation.priority_changed', {
      conversationId,
      priority: normPri,
      timestamp: Date.now(),
    });

    return conv;
  }

  /**
   * Provide resolution and close ticket
   */
  async provideResolution(conversationId, { resolutionCode, resolutionSummary, resolvedBy = 'admin' }) {
    const conv = await this.ensureConversationInMemory(conversationId);
    if (!conv) return null;

    conv.resolutionCode = resolutionCode;
    conv.resolutionSummary = resolutionSummary;
    conv.resolutionStatus = 'PROVIDED';
    conv.resolvedBy = resolvedBy;
    conv.status = 'RESOLVED';
    const now = new Date().toISOString();
    conv.resolvedAt = now;
    conv.updatedAt = now;

    try {
      await safePgQuery(
        `UPDATE support_conversations
         SET resolution_code = $1, resolution_summary = $2, resolution_status = 'PROVIDED', resolved_by = $3, resolved_at = $4, status = 'RESOLVED', updated_at = NOW()
         WHERE conversation_id = $5`,
        [resolutionCode, resolutionSummary, resolvedBy, now, conversationId]
      );
    } catch (ignored) {}

    this.addAuditLog(conversationId, resolvedBy, 'TICKET_STATUS_CHANGED', {
      newStatus: 'RESOLVED',
      resolutionCode,
      resolutionSummary,
    });

    broadcastWsMessage('support.conversation.resolved', {
      conversationId,
      resolutionCode,
      resolutionSummary,
      status: 'RESOLVED',
      timestamp: Date.now(),
    });

    try {
      const { notifyUserSupportEvent } = await import('./supportNotify.mjs');
      const ticketLabel = conv.ticketReference || conv.ticketNumber || conversationId;
      await notifyUserSupportEvent({
        userId: conv.userId,
        eventType: 'support.ticket.resolved',
        subject: `Ticket ${ticketLabel} resolved`,
        message: resolutionSummary || 'Your support ticket has been resolved.',
        conversationId,
        eventId: `ticket_resolved_${conversationId}_${Date.now()}`,
      });
    } catch (ignored) {}

    return conv;
  }

  async closeTicket(conversationId, { closedBy = 'admin', resolutionCode = null } = {}) {
    return this.updateStatus(conversationId, { status: 'CLOSED', actorId: closedBy });
  }

  async adminCloseTicket(conversationId, {
    closedBy = 'admin',
    resolutionCode = 'INFORMATION_PROVIDED',
    resolutionSummary = 'Closed by OddsYra support.',
  } = {}) {
    const conv = await this.ensureConversationInMemory(conversationId);
    if (!conv) throw new Error('Ticket not found');

    if (conv.status !== 'RESOLVED') {
      await this.provideResolution(conversationId, {
        resolutionCode: APPROVED_RESOLUTION_CODES.includes(resolutionCode) ? resolutionCode : 'INFORMATION_PROVIDED',
        resolutionSummary,
        resolvedBy: closedBy,
      });
    }

    return this.closeTicket(conversationId, { closedBy, resolutionCode });
  }

  async ensureConversationInMemory(conversationId) {
    const existing = this.conversations.get(conversationId);
    if (existing) return existing;
    const loaded = await this.getConversationById(conversationId, 'admin');
    if (!loaded) return null;
    this.conversations.set(conversationId, loaded);
    return loaded;
  }

  addAuditLog(conversationId, actorId, action, details = {}) {
    const logObj = {
      conversationId,
      actorId,
      action,
      details,
      createdAt: new Date().toISOString(),
    };
    try {
      safePgQuery(
        `INSERT INTO support_audit_logs (conversation_id, actor_id, action, details)
         VALUES ($1, $2, $3, $4)`,
        [conversationId, actorId, action, JSON.stringify(details)]
      ).catch(() => {});
    } catch (ignored) {}
    return logObj;
  }

  async markAsRead(conversationId, actorType = 'user') {
    const conv = this.conversations.get(conversationId);
    if (conv) {
      if (actorType === 'user') {
        conv.unreadUserCount = 0;
      } else {
        conv.unreadAdminCount = 0;
      }
    }

    try {
      if (actorType === 'user') {
        await safePgQuery(
          `UPDATE support_conversations SET unread_user_count = 0, updated_at = NOW() WHERE conversation_id = $1`,
          [conversationId]
        );
      } else {
        await safePgQuery(
          `UPDATE support_conversations SET unread_admin_count = 0, updated_at = NOW() WHERE conversation_id = $1`,
          [conversationId]
        );
      }
    } catch (ignored) {}

    broadcastWsMessage('support.message.read', {
      conversationId,
      actorType,
      timestamp: Date.now(),
    });

    return conv;
  }

  /**
   * Get user tickets with strict stripping of INTERNAL_NOTE
   */
  async getUserConversations(userId, { supportType = null, category = null, status = null, search = null, limit = 50, offset = 0 } = {}) {
    let all = Array.from(this.conversations.values()).filter((c) => c.userId === userId);

    if (all.length === 0) {
      // Hydrate from PostgreSQL if in-memory copy cleared
      try {
        const dbRes = await safePgQuery(
          `SELECT * FROM support_conversations WHERE user_id = $1 ORDER BY updated_at DESC`,
          [userId]
        );
        if (dbRes.rows.length > 0) {
          for (const row of dbRes.rows) {
            const msgRes = await safePgQuery(
              `SELECT * FROM support_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
              [row.conversation_id]
            );
            const conv = {
              conversationId: row.conversation_id,
              supportType: row.support_type || 'TICKET',
              conversationNumber: row.conversation_number || row.ticket_number,
              ticketNumber: row.ticket_number || row.conversation_number,
              ticketReference: row.ticket_number || row.conversation_number,
              userId: row.user_id,
              tenantId: row.tenant_id,
              subject: row.subject,
              category: row.category,
              priority: row.priority,
              status: row.status,
              assignedAgentId: row.assigned_agent_id,
              assignedAgentName: row.assigned_agent_name,
              assignedTeam: row.assigned_team,
              slaDueAt: row.sla_due_at,
              unreadUserCount: row.unread_user_count || 0,
              unreadAdminCount: row.unread_admin_count || 0,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
              messages: msgRes.rows.map((m) => ({
                id: m.message_id,
                messageId: m.message_id,
                conversationId: m.conversation_id,
                senderId: m.sender_id,
                senderType: m.sender_type,
                messageType: m.message_type,
                agentName: m.agent_name,
                text: m.text,
                attachments: typeof m.attachments === 'string' ? JSON.parse(m.attachments || '[]') : m.attachments || [],
                deliveredAt: m.delivered_at,
                createdAt: m.created_at,
              })),
              internalNotes: [],
            };
            this.conversations.set(conv.conversationId, conv);
          }
          all = Array.from(this.conversations.values()).filter((c) => c.userId === userId);
        }
      } catch (ignored) {}
    }

    let filtered = all;
    if (supportType) filtered = filtered.filter((c) => (c.supportType || 'TICKET') === supportType);
    if (category) filtered = filtered.filter((c) => String(c.category).toUpperCase() === String(category).toUpperCase());
    if (status) filtered = filtered.filter((c) => String(c.status).toUpperCase() === String(status).toUpperCase());
    if (search) {
      const q = String(search).toLowerCase();
      filtered = filtered.filter(
        (c) =>
          String(c.subject || '').toLowerCase().includes(q) ||
          String(c.ticketReference || c.ticketNumber || '').toLowerCase().includes(q)
      );
    }

    filtered.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    const list = paginated.map((c) => ({
      ...c,
      slaStatus: this.calculateSlaStatus(c),
      // STRICT INTERNAL NOTE REMOVAL
      messages: (c.messages || []).filter((m) => m.messageType !== 'INTERNAL_NOTE'),
      internalNotes: [],
    }));

    // Attach .tickets and .total so it functions as both an Array and an Object response
    Object.defineProperties(list, {
      tickets: { value: list, enumerable: false },
      total: { value: total, enumerable: false },
    });

    return list;
  }

  /**
   * Get conversation or ticket by ID/reference with strict role isolation
   */
  async getConversationById(conversationIdOrRef, userRole = 'user') {
    const all = Array.from(this.conversations.values());
    let conv = all.find(
      (c) =>
        c.conversationId === conversationIdOrRef ||
        c.ticketReference === conversationIdOrRef ||
        c.ticketNumber === conversationIdOrRef ||
        c.conversationNumber === conversationIdOrRef
    );

    if (!conv) {
      // Try Postgres lookup
      try {
        const cRes = await safePgQuery(
          `SELECT c.* FROM support_conversations c
           WHERE c.conversation_id = $1 OR c.ticket_number = $1 OR c.conversation_number = $1`,
          [conversationIdOrRef]
        );
        if (cRes.rows.length > 0) {
          const row = cRes.rows[0];
          const msgRes = await safePgQuery(
            `SELECT * FROM support_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
            [row.conversation_id]
          );
          conv = {
            conversationId: row.conversation_id,
            supportType: row.support_type || 'TICKET',
            conversationNumber: row.conversation_number || row.ticket_number,
            ticketNumber: row.ticket_number || row.conversation_number,
            ticketReference: row.ticket_number || row.conversation_number,
            userId: row.user_id,
            tenantId: row.tenant_id,
            subject: row.subject,
            category: row.category,
            priority: row.priority,
            status: row.status,
            assignedAgentId: row.assigned_agent_id,
            assignedAgentName: row.assigned_agent_name,
            assignedTeam: row.assigned_team,
            slaDueAt: row.sla_due_at,
            firstResponseAt: row.first_response_at,
            resolvedAt: row.resolved_at,
            closedAt: row.closed_at,
            reopenedAt: row.reopened_at,
            resolutionStatus: row.resolution_status || 'NOT_PROVIDED',
            resolutionCode: row.resolution_code || null,
            resolutionSummary: row.resolution_summary || null,
            resolvedBy: row.resolved_by || null,
            relatedEntityType: row.related_entity_type,
            relatedEntityId: row.related_entity_id,
            unreadUserCount: row.unread_user_count || 0,
            unreadAdminCount: row.unread_admin_count || 0,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            messages: msgRes.rows.map((m) => ({
              id: m.message_id,
              messageId: m.message_id,
              conversationId: m.conversation_id,
              senderId: m.sender_id,
              senderType: m.sender_type,
              messageType: m.message_type,
              agentName: m.agent_name,
              text: m.text,
              attachments: typeof m.attachments === 'string' ? JSON.parse(m.attachments || '[]') : m.attachments || [],
              deliveredAt: m.delivered_at,
              createdAt: m.created_at,
            })),
            internalNotes: [],
          };
          this.conversations.set(conv.conversationId, conv);
        }
      } catch (ignored) {}
    }

    if (!conv) return null;

    const isAdmin = userRole === 'admin' || userRole === 'SUPPORT_AGENT' || userRole === 'SUPER_ADMIN' || userRole === 'OPERATIONS_ADMIN';
    const slaStatus = this.calculateSlaStatus(conv);

    if (isAdmin) {
      return { ...conv, slaStatus };
    }

    // Strict user filtering
    return {
      ...conv,
      slaStatus,
      messages: (conv.messages || []).filter((m) => m.messageType !== 'INTERNAL_NOTE'),
      internalNotes: [],
    };
  }

  getAdminMetrics(agentId = 'agent_priya') {
    const convs = Array.from(this.conversations.values());
    const tickets = convs.filter((c) => (c.supportType || 'TICKET') === 'TICKET');
    const liveChats = convs.filter((c) => c.supportType === 'LIVE_CHAT');
    const todayStr = new Date().toISOString().slice(0, 10);

    return {
      totalOpen: tickets.filter((c) => c.status === 'OPEN').length,
      inProgress: tickets.filter((c) => c.status === 'IN_PROGRESS' || c.status === 'ASSIGNED').length,
      waitingForUser: tickets.filter((c) => c.status === 'WAITING_FOR_USER' || c.status === 'PENDING_USER').length,
      resolvedToday: tickets.filter((c) => c.resolvedAt && c.resolvedAt.startsWith(todayStr)).length,
      closed: tickets.filter((c) => c.status === 'CLOSED').length,
      unassigned: tickets.filter((c) => !c.assignedAgentId && c.status !== 'CLOSED' && c.status !== 'RESOLVED').length,
      highPriority: tickets.filter((c) => (c.priority === 'HIGH' || c.priority === 'URGENT') && c.status !== 'CLOSED').length,
      activeLiveChats: liveChats.filter((c) => c.status === 'ACTIVE').length,
      waitingLiveChats: liveChats.filter((c) => c.status === 'WAITING').length,
    };
  }

  getAllConversations({ supportType = null, status = null, category = null, priority = null, assignedAgentId = null, sort = 'newest' } = {}) {
    let list = Array.from(this.conversations.values());

    if (supportType) list = list.filter((c) => (c.supportType || 'TICKET') === supportType);
    if (status) list = list.filter((c) => c.status === status);
    if (category) list = list.filter((c) => c.category === category);
    if (priority) list = list.filter((c) => c.priority === priority);
    if (assignedAgentId) list = list.filter((c) => c.assignedAgentId === assignedAgentId);

    if (sort === 'oldest') {
      list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else if (sort === 'priority') {
      const pOrder = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
      list.sort((a, b) => (pOrder[a.priority] || 2) - (pOrder[b.priority] || 2));
    } else if (sort === 'last_updated') {
      list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    } else {
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    return list.map((conv) => ({
      ...conv,
      slaStatus: this.calculateSlaStatus(conv),
    }));
  }

  getLiveChats({ filter = 'ALL', agentId = null } = {}) {
    let chats = Array.from(this.conversations.values()).filter((c) => c.supportType === 'LIVE_CHAT');

    if (filter === 'WAITING') {
      chats = chats.filter((c) => c.status === 'WAITING');
    } else if (filter === 'ACTIVE') {
      chats = chats.filter((c) => c.status === 'ACTIVE');
    } else if (filter === 'MY_CHATS' && agentId) {
      chats = chats.filter((c) => c.assignedAgentId === agentId && c.status === 'ACTIVE');
    } else if (filter === 'UNASSIGNED') {
      chats = chats.filter((c) => !c.assignedAgentId && (c.status === 'WAITING' || c.status === 'ACTIVE'));
    }

    chats.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    return chats;
  }

  getKnowledgeBase(query = '') {
    if (!query) return this.knowledgeBase;
    const q = query.toLowerCase();
    return this.knowledgeBase.filter(
      (k) => k.title.toLowerCase().includes(q) || k.content.toLowerCase().includes(q) || k.category.toLowerCase().includes(q)
    );
  }
}

export const supportEngine = new SupportEngine();
export const getSupportUserFinancialSummary = (userId) => supportEngine.getSupportUserFinancialSummary(userId);
