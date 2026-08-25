import { describe, it, expect, beforeEach } from 'vitest';
import { supportEngine } from '../../lib/supportEngine.mjs';
import { query } from '../../db/pg.js';

describe('adminCloseTicket', () => {
  const userId = 'usr_admin_close_1';
  let convId;

  beforeEach(async () => {
    await query(
      `INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING`,
      [userId, `${userId}@example.com`],
    );
    await query(
      `DELETE FROM support_messages WHERE conversation_id IN (SELECT conversation_id FROM support_conversations WHERE user_id = $1)`,
      [userId],
    );
    await query(`DELETE FROM support_conversations WHERE user_id = $1`, [userId]);

    const conv = await supportEngine.startConversation({
      userId,
      subject: 'Withdrawal still pending',
      category: 'Withdrawal',
      initialMessage: 'UPI payout of ₹500 is stuck.',
      bypassDuplicateCheck: true,
    });
    convId = conv.conversationId;
  });

  it('closes a user ticket after the in-memory copy is gone', async () => {
    supportEngine.conversations.delete(convId);
    const closed = await supportEngine.adminCloseTicket(convId, { closedBy: 'admin_test' });
    expect(closed.status).toBe('CLOSED');

    const db = await query(
      `SELECT status FROM support_conversations WHERE conversation_id = $1`,
      [convId],
    );
    expect(String(db.rows[0].status).toUpperCase()).toBe('CLOSED');
  });
});
