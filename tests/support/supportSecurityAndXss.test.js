import { describe, it, expect, beforeEach } from 'vitest';
import { supportEngine } from '../../lib/supportEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 8 Support Security, User Isolation & Internal Note Tests', () => {
  const user1 = 'usr_sec_101';
  const user2 = 'usr_sec_102';
  let convId1;

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [user1, `${user1}@example.com`]);
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [user2, `${user2}@example.com`]);
    await query(`DELETE FROM support_messages WHERE conversation_id IN (SELECT conversation_id FROM support_conversations WHERE user_id IN ($1, $2));`, [user1, user2]);
    await query(`DELETE FROM support_conversations WHERE user_id IN ($1, $2);`, [user1, user2]);

    const conv1 = await supportEngine.startConversation({
      userId: user1,
      subject: 'Private Financial Issue',
      category: 'Withdrawal',
      initialMessage: 'My private banking details.',
      bypassDuplicateCheck: true,
    });
    convId1 = conv1.conversationId;
  });

  it('CRITICAL: user isolation -> User 2 cannot access User 1 support conversation', async () => {
    const u2Convs = await supportEngine.getUserConversations(user2);
    expect(u2Convs.length).toBe(0);

    const u1Convs = await supportEngine.getUserConversations(user1);
    expect(u1Convs.length).toBe(1);
    expect(u1Convs[0].conversationId).toBe(convId1);
  });

  it('CRITICAL: internal notes isolation -> INTERNAL_NOTE messages strictly stripped from customer endpoint', async () => {
    // Admin posts internal note
    await supportEngine.addMessage(convId1, {
      senderId: 'admin_supervisor',
      senderType: 'admin',
      messageType: 'INTERNAL_NOTE',
      agentName: 'Supervisor',
      text: 'CONFIDENTIAL INTERNAL NOTE: Flagged for high-risk manual audit.',
    });

    // Customer queries conversation
    const customerView = await supportEngine.getConversationById(convId1, 'user');
    expect(customerView.messages.length).toBe(1); // Only initial message
    expect(customerView.messages.some(m => m.text.includes('CONFIDENTIAL'))).toBe(false);
    expect(customerView.internalNotes.length).toBe(0);

    // Admin queries conversation
    const adminView = await supportEngine.getConversationById(convId1, 'admin');
    expect(adminView.messages.some(m => m.text.includes('CONFIDENTIAL'))).toBe(true);
  });

  it('XSS Protection: script payloads are safely stored as plain text strings', async () => {
    const xssPayload = '<script>alert("xss_attack")</script>';
    const xssMsg = await supportEngine.addMessage(convId1, {
      senderId: user1,
      senderType: 'user',
      messageType: 'USER_MESSAGE',
      text: xssPayload,
    });

    expect(xssMsg.text).toBe(xssPayload);

    const dbMsg = await query('SELECT text FROM support_messages WHERE message_id = $1', [xssMsg.messageId]);
    expect(dbMsg.rows[0].text).toBe(xssPayload);
  });
});
