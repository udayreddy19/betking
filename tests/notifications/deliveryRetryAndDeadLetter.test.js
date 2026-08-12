import { describe, it, expect, beforeEach } from 'vitest';
import { processQueuedNotifications } from '../../lib/notificationDeliveryWorker.mjs';
import { query } from '../../db/pg.js';

describe('Phase 11 Delivery Retry & Dead-Letter Queue Tests', () => {
  const userId = 'usr_retry_101';

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userId, `${userId}@example.com`]);
    await query(`DELETE FROM notifications WHERE user_id = $1;`, [userId]);
  });

  it('should process queued notifications and transition status to DELIVERED', async () => {
    const notifId = `notif_test_${Date.now()}`;
    await query(`
      INSERT INTO notifications (id, user_id, event_type, category, channel, recipient, subject, body, status, tenant_id)
      VALUES ($1, $2, 'bet.won', 'BETTING', 'IN_APP', 'usr@example.com', 'Bet Won', 'You won ₹250', 'QUEUED', 'tenant_default');
    `, [notifId, userId]);

    const res = await processQueuedNotifications({ notificationId: notifId });
    expect(res.success).toBe(true);

    const dbNotif = await query('SELECT status, attempts, delivered_at FROM notifications WHERE id = $1', [notifId]);
    expect(dbNotif.rows[0].status).toBe('DELIVERED');
    expect(dbNotif.rows[0].attempts).toBe(1);
    expect(dbNotif.rows[0].delivered_at).toBeDefined();
  });
});
