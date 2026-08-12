import { describe, it, expect, beforeEach } from 'vitest';
import { supportEngine } from '../../lib/supportEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 8 Support Ticket Creation & PostgreSQL Persistence Tests', () => {
  const userId = 'usr_sup_101';

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userId, `${userId}@example.com`]);
    await query(`DELETE FROM support_messages WHERE conversation_id IN (SELECT conversation_id FROM support_conversations WHERE user_id = $1);`, [userId]);
    await query(`DELETE FROM support_conversations WHERE user_id = $1;`, [userId]);
  });

  it('should create conversation and persist first message in PostgreSQL', async () => {
    const conv = await supportEngine.startConversation({
      userId,
      subject: 'Withdrawal Delay Query',
      category: 'Withdrawal',
      initialMessage: 'Where is my UPI withdrawal of ₹1,000?',
      priority: 'HIGH',
      bypassDuplicateCheck: true,
    });

    expect(conv.conversationId).toBeDefined();
    expect(conv.status).toBe('OPEN');
    expect(conv.priority).toBe('HIGH');

    // Query PostgreSQL directly (Server Restart Durability Check)
    const dbConv = await query('SELECT * FROM support_conversations WHERE conversation_id = $1', [conv.conversationId]);
    expect(dbConv.rows.length).toBe(1);
    expect(dbConv.rows[0].user_id).toBe(userId);
    expect(dbConv.rows[0].category).toBe('Withdrawal');

    const dbMsg = await query('SELECT * FROM support_messages WHERE conversation_id = $1', [conv.conversationId]);
    expect(dbMsg.rows.length).toBe(1);
    expect(dbMsg.rows[0].text).toBe('Where is my UPI withdrawal of ₹1,000?');
    expect(dbMsg.rows[0].sender_type).toBe('user');
  });

  it('CRITICAL: server restart persistence -> history loads from PostgreSQL directly', async () => {
    const conv = await supportEngine.startConversation({
      userId,
      subject: 'Deposit Issue',
      category: 'Deposit',
      initialMessage: 'Money deducted but wallet not credited.',
      bypassDuplicateCheck: true,
    });

    // Simulate Server Restart by clearing in-memory Map
    supportEngine.conversations.clear();
    expect(supportEngine.conversations.size).toBe(0);

    // Fetch conversations from PostgreSQL persistent store
    const userConvs = await supportEngine.getUserConversations(userId);
    expect(userConvs.length).toBe(1);
    expect(userConvs[0].conversationId).toBe(conv.conversationId);
    expect(userConvs[0].messages.length).toBe(1);
    expect(userConvs[0].messages[0].text).toBe('Money deducted but wallet not credited.');
  });
});
