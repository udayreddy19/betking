import { describe, it, expect, beforeEach } from 'vitest';
import { processPendingOutboxEvents } from '../../lib/notificationWorker.mjs';
import { query } from '../../db/pg.js';

describe('Phase 11 Outbox Event Processing & Idempotency Tests', () => {
  const userId = 'usr_notif_101';
  const eventId = `evt_bet_won_${Date.now()}`;

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userId, `${userId}@example.com`]);
    await query(`DELETE FROM notifications WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM outbox_events WHERE id = $1;`, [eventId]);
  });

  it('should process pending outbox event, render template, and persist notification record', async () => {
    // Insert Outbox Event (bet.won)
    await query(`
      INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status, created_at)
      VALUES ($1, 'bet.won', 'bet', 'bet_123', $2, 'PENDING', NOW());
    `, [eventId, JSON.stringify({ userId, betId: 'bet_123', stake: '100.00', payout: '250.00', status: 'WON' })]);

    const res = await processPendingOutboxEvents({ eventId });
    expect(res.success).toBe(true);

    const dbNotif = await query('SELECT * FROM notifications WHERE event_id = $1', [eventId]);
    expect(dbNotif.rows.length).toBeGreaterThan(0);
    expect(dbNotif.rows[0].user_id).toBe(userId);
    expect(dbNotif.rows[0].status).toBe('QUEUED');

    const dbEvt = await query('SELECT status FROM outbox_events WHERE id = $1', [eventId]);
    expect(dbEvt.rows[0].status).toBe('PROCESSED');
  });

  it('CRITICAL: Duplicate Event Test -> processing same event ID twice guarantees database-level idempotency', async () => {
    // Insert Outbox Event
    await query(`
      INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status, created_at)
      VALUES ($1, 'bet.won', 'bet', 'bet_123', $2, 'PENDING', NOW());
    `, [eventId, JSON.stringify({ userId, betId: 'bet_123', stake: '100.00', payout: '250.00', status: 'WON' })]);

    // Process Attempt 1
    await processPendingOutboxEvents({ eventId });

    const notifCount1 = await query('SELECT COUNT(*) FROM notifications WHERE event_id = $1', [eventId]);
    const initialCount = parseInt(notifCount1.rows[0].count, 10);

    // Re-insert duplicate event or re-process
    await query(`UPDATE outbox_events SET status = 'PENDING' WHERE id = $1;`, [eventId]);
    await processPendingOutboxEvents({ eventId });

    const notifCount2 = await query('SELECT COUNT(*) FROM notifications WHERE event_id = $1', [eventId]);
    expect(parseInt(notifCount2.rows[0].count, 10)).toBe(initialCount); // Zero duplicate notifications!
  });
});
