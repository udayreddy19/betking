/**
 * Support → in-app notifications + transactional emails.
 */

import { query } from '../db/pg.js';
import { broadcastWsMessage } from './websocketEngine.mjs';
import { ensureAdminNotificationTable } from './notificationWorker.mjs';

function notifId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function lookupUserContact(userId) {
  if (!userId) return { email: null, name: null };
  try {
    const res = await query(
      `SELECT email, first_name, last_name FROM users WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    const row = res.rows[0];
    if (!row) return { email: null, name: null };
    const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || null;
    return { email: row.email || null, name };
  } catch {
    return { email: null, name: null };
  }
}

export async function notifyAdminSupportEvent({
  title,
  message,
  conversationId,
  priority = 'HIGH',
}) {
  try {
    await ensureAdminNotificationTable();
    const id = notifId('anot');
    await query(
      `INSERT INTO admin_notifications
         (notification_id, admin_id, title, message, category, priority,
          action_type, action_target_type, action_target_id, action_label, is_read, created_at)
       VALUES ($1, 'admin', $2, $3, 'SUPPORT', $4, 'OPEN_TICKET', 'support_conversation', $5, 'Open ticket', FALSE, NOW())
       ON CONFLICT DO NOTHING`,
      [id, title, message, priority, conversationId || null],
    );
    broadcastWsMessage('admin.alert.created', {
      notificationId: id,
      title,
      message,
      category: 'SUPPORT',
      priority,
      conversationId,
      timestamp: Date.now(),
    });
    return id;
  } catch (err) {
    console.error('[supportNotify] admin', err.message);
    return null;
  }
}

export async function notifyUserSupportEvent({
  userId,
  eventType,
  subject,
  message,
  conversationId,
  eventId,
}) {
  if (!userId) return null;
  try {
    const id = notifId('ntf');
    const eid = eventId || id;
    try {
      await query(
        `INSERT INTO notifications
           (id, user_id, event_type, category, channel, recipient, subject, body, status, event_id, is_read, attempts)
         VALUES ($1, $2, $3, 'SUPPORT', 'IN_APP', $2, $4, $5, 'DELIVERED', $6, FALSE, 0)
         ON CONFLICT (id) DO NOTHING`,
        [id, userId, eventType, subject, message, eid],
      );
    } catch {
      await query(
        `INSERT INTO notifications
           (id, user_id, event_type, category, channel, recipient, subject, body, status, event_id, is_read, attempts, tenant_id)
         VALUES ($1, $2, $3, 'SUPPORT', 'IN_APP', $2, $4, $5, 'DELIVERED', $6, FALSE, 0, 'oddsyra_in')
         ON CONFLICT (id) DO NOTHING`,
        [id, userId, eventType, subject, message, eid],
      );
    }
    broadcastWsMessage('user.notification.created', {
      notificationId: id,
      userId,
      eventType,
      subject,
      message,
      conversationId,
      timestamp: Date.now(),
    });
    try {
      const { sendToUser } = await import('./websocketEngine.mjs');
      sendToUser(userId, 'user.notification.created', {
        notificationId: id,
        userId,
        eventType,
        subject,
        message,
        conversationId,
        timestamp: Date.now(),
      });
    } catch {
      /* optional realtime fanout */
    }

    // Browser Push Notification
    try {
      const { sendWebPush } = await import('./notificationChannels.mjs');
      void sendWebPush({
        userId,
        subject: subject || 'OddsYra Support Update',
        body: message || 'You have an update from OddsYra Support.',
        data: {
          conversationId,
          eventType,
          url: conversationId ? `/support/tickets/${conversationId}` : '/support',
        },
      }).catch(() => {});
    } catch {
      // webpush is optional
    }

    return id;
  } catch (err) {
    console.error('[supportNotify] user', err.message);
    return null;
  }
}

/**
 * Email alerts@ (and support@ if different) when a ticket is created.
 */
export async function emailSupportInboxOnTicketCreated(ticket) {
  try {
    let userEmail = ticket?.userEmail || null;
    if (!userEmail && ticket?.userId) {
      const contact = await lookupUserContact(ticket.userId);
      userEmail = contact.email;
    }

    const { sendSupportTicketAlertEmail } = await import('../server/auth/emailService.js');
    return await sendSupportTicketAlertEmail({
      ticketNumber: ticket?.ticketNumber || ticket?.conversationNumber,
      conversationId: ticket?.conversationId,
      userId: ticket?.userId,
      userEmail,
      subject: ticket?.subject,
      category: ticket?.category,
      priority: ticket?.priority,
      message: ticket?.message || ticket?.initialMessage || ticket?.lastMessage,
      createdAt: ticket?.createdAt,
    });
  } catch (err) {
    console.error('[supportNotify] email inbox', err.message);
    return { success: false, error: err.message };
  }
}

/** Confirm to the player that their ticket was created. */
export async function emailUserOnTicketCreated(ticket) {
  try {
    const contact = await lookupUserContact(ticket?.userId);
    const { sendSupportTicketCreatedUserEmail } = await import('../server/auth/emailService.js');
    const ticketRef = ticket?.ticketNumber || ticket?.ticketReference || ticket?.conversationNumber || ticket?.id;
    return await sendSupportTicketCreatedUserEmail({
      email: ticket?.userEmail || contact.email,
      name: contact.name,
      userName: contact.name,
      ticketId: ticketRef,
      ticketNumber: ticketRef,
      subject: ticket?.subject,
      category: ticket?.category,
    });
  } catch (err) {
    console.error('[supportNotify] user ticket created', err.message);
    return { success: false, error: err.message };
  }
}

/** Email player when admin replies. */
export async function emailUserOnAdminReply({
  userId,
  email,
  userEmail,
  name,
  userName,
  ticketNumber,
  ticketId,
  agentReply,
  messageText,
  content,
  preview,
}) {
  try {
    const replyContent = (agentReply || messageText || content || preview || '').trim();
    if (!replyContent) {
      return { success: false, skipped: true, error: 'No agent reply content provided.' };
    }

    let contactEmail = userEmail || email;
    let contactName = userName || name;

    if (!contactEmail && userId) {
      const contact = await lookupUserContact(userId);
      contactEmail = contact.email;
      contactName = contactName || contact.name;
    }

    if (!contactEmail) {
      return { success: false, error: 'User contact email not found.' };
    }

    const resolvedTicket = ticketNumber || ticketId || 'SUPPORT';
    const { sendSupportAdminReplyEmail } = await import('../server/auth/emailService.js');
    return await sendSupportAdminReplyEmail({
      email: contactEmail,
      name: contactName,
      userName: contactName,
      ticketId: resolvedTicket,
      ticketNumber: resolvedTicket,
      agentReply: replyContent,
      messageText: replyContent,
      content: replyContent,
      preview: replyContent,
      replyUrl: `${process.env.FRONTEND_URL || 'https://oddsyra.com'}/support/tickets/${encodeURIComponent(ticketId || conversationId || '')}`,
    });
  } catch (err) {
    console.error('[supportNotify] admin reply mail', err.message);
    return { success: false, error: err.message };
  }
}

/** Email player when ticket is closed. */
export async function emailUserOnTicketClosed({ userId, ticketNumber, ticketId, resolutionSummary }) {
  try {
    const contact = await lookupUserContact(userId);
    const resolvedTicket = ticketNumber || ticketId || 'SUPPORT';
    const { sendSupportTicketClosedEmail } = await import('../server/auth/emailService.js');
    return await sendSupportTicketClosedEmail({
      email: contact.email,
      name: contact.name,
      userName: contact.name,
      ticketId: resolvedTicket,
      ticketNumber: resolvedTicket,
      resolutionSummary,
    });
  } catch (err) {
    console.error('[supportNotify] ticket closed mail', err.message);
    return { success: false, error: err.message };
  }
}

/** Resolve user contact for payment emails. */
export async function emailUserPaymentEvent(kind, payload) {
  try {
    const contact = await lookupUserContact(payload?.userId);
    const emailMod = await import('../server/auth/emailService.js');
    if (kind === 'deposit') {
      return await emailMod.sendDepositCompletedEmail({
        email: contact.email,
        name: contact.name,
        amount: payload.amount,
        paymentId: payload.paymentId,
        newBalance: payload.newBalance,
      });
    }
    if (kind === 'withdrawal') {
      return await emailMod.sendWithdrawalStatusEmail({
        email: contact.email,
        name: contact.name,
        amount: payload.amount,
        status: payload.status,
        withdrawalId: payload.withdrawalId,
        reason: payload.reason,
      });
    }
    return { success: false, error: 'unknown_kind' };
  } catch (err) {
    console.error('[supportNotify] payment mail', err.message);
    return { success: false, error: err.message };
  }
}

/** Notify payments@ when a gateway deposit is newly captured. */
export async function emailOpsDepositAlert(payload) {
  try {
    const { notifyOpsDepositCaptured } = await import('./paymentsOpsNotify.mjs');
    return await notifyOpsDepositCaptured(payload);
  } catch (err) {
    console.error('[supportNotify] deposit ops mail', err.message);
    return { success: false, error: err.message };
  }
}

/** Notify payments@ on withdrawal paid / rejected / hold. */
export async function emailOpsWithdrawalAlert(payload) {
  try {
    const { notifyOpsWithdrawalEvent } = await import('./paymentsOpsNotify.mjs');
    return await notifyOpsWithdrawalEvent(payload);
  } catch (err) {
    console.error('[supportNotify] withdrawal ops mail', err.message);
    return { success: false, error: err.message };
  }
}

export { lookupUserContact };
