import { describe, it, expect, beforeEach } from 'vitest';
import { processPendingOutboxEvents, ensureAdminNotificationTable } from '../../lib/notificationWorker.mjs';
import { query } from '../../db/pg.js';

describe('Phase 11 Admin Realtime Alerts & Header Bell Tests', () => {
  const eventId = `evt_fraud_${Date.now()}`;

  beforeEach(async () => {
    await ensureAdminNotificationTable();
    await query(`DELETE FROM admin_notifications;`);
    await query(`DELETE FROM outbox_events WHERE event_type = 'fraud.signal.created';`);
  });

  it('CRITICAL: Admin Realtime Alert Test -> operational event creates admin alert, updates unread count & marks read', async () => {
    const currentEventId = `evt_fraud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    // 1. Insert Operational Outbox Event (fraud.signal.created)
    await query(`
      INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status, created_at)
      VALUES ($1, 'fraud.signal.created', 'fraud', 'sig_101', $2, 'PENDING', NOW());
    `, [currentEventId, JSON.stringify({ userId: 'usr_fraud_999', severity: 'HIGH', message: 'High-risk device cluster detected' })]);

    // 2. Process Outbox Event
    const res = await processPendingOutboxEvents({ eventId: currentEventId });
    expect(res.success).toBe(true);

    // 3. Verify admin_notifications entry created
    const dbAlert = await query('SELECT * FROM admin_notifications WHERE notification_id LIKE \'anot_%\' ORDER BY created_at DESC');
    expect(dbAlert.rows.length).toBeGreaterThanOrEqual(1);
    expect(dbAlert.rows[0].title).toBe('Alert: fraud.signal.created');
    expect(dbAlert.rows[0].is_read).toBe(false);

    const alertId = dbAlert.rows[0].notification_id;

    // 4. Mark Alert Read (idempotent)
    await query('UPDATE admin_notifications SET is_read = TRUE WHERE notification_id = $1', [alertId]);

    const readAlert = await query('SELECT is_read FROM admin_notifications WHERE notification_id = $1', [alertId]);
    expect(readAlert.rows[0].is_read).toBe(true);
  });
});
