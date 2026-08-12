import { describe, it, expect, beforeEach } from 'vitest';
import { supportEngine } from '../../lib/supportEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 8 Admin Reply & Realtime Delivery Tests', () => {
  const userId = 'usr_sup_reply_101';
  let conversationId;

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userId, `${userId}@example.com`]);
    await query(`DELETE FROM support_messages WHERE conversation_id IN (SELECT conversation_id FROM support_conversations WHERE user_id = $1);`, [userId]);
    await query(`DELETE FROM support_conversations WHERE user_id = $1;`, [userId]);

    const conv = await supportEngine.startConversation({
      userId,
      subject: 'KYC Status Check',
      category: 'KYC',
      initialMessage: 'Please check my Aadhaar KYC document.',
      bypassDuplicateCheck: true,
    });
    conversationId = conv.conversationId;
  });

  it('should process admin reply, persist in PostgreSQL, and update status', async () => {
    const adminMsg = await supportEngine.addMessage(conversationId, {
      senderId: 'admin_priya',
      senderType: 'admin',
      messageType: 'ADMIN_MESSAGE',
      agentName: 'Priya Sharma',
      text: 'Your Aadhaar document has been approved!',
    });

    expect(adminMsg.messageId).toBeDefined();
    expect(adminMsg.senderType).toBe('admin');
    expect(adminMsg.agentName).toBe('Priya Sharma');

    // Verify DB persistence
    const dbMsg = await query('SELECT * FROM support_messages WHERE message_id = $1', [adminMsg.messageId]);
    expect(dbMsg.rows.length).toBe(1);
    expect(dbMsg.rows[0].text).toBe('Your Aadhaar document has been approved!');
    expect(dbMsg.rows[0].sender_type).toBe('admin');

    // Verify unreadUserCount was incremented
    const conv = await supportEngine.getConversationById(conversationId, 'user');
    expect(conv.unreadUserCount).toBe(1);
    expect(conv.messages.length).toBe(2);
  });

  it('should allow user reply and clear unread count upon markAsRead', async () => {
    await supportEngine.addMessage(conversationId, {
      senderId: 'admin_priya',
      senderType: 'admin',
      messageType: 'ADMIN_MESSAGE',
      agentName: 'Priya Sharma',
      text: 'Hello, how can I help?',
    });

    await supportEngine.markAsRead(conversationId, 'user');

    const convAfterRead = await supportEngine.getConversationById(conversationId, 'user');
    expect(convAfterRead.unreadUserCount).toBe(0);
  });
});
