import { query } from '../db/pg.js';

/**
 * Transactional Outbox Engine
 * Guarantees atomic event publishing inside business database transactions.
 */
export async function publishOutboxEvent(dbClient, {
  eventType,
  aggregateType,
  aggregateId,
  payload = {},
  correlationId = null,
}) {
  const eventId = `evt_${eventType.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const corrId = correlationId || `corr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const sql = `
    INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status, correlation_id)
    VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)
    RETURNING id, event_type, status, created_at;
  `;
  const params = [eventId, eventType, aggregateType, aggregateId, JSON.stringify(payload), corrId];

  // If passed an atomic transaction client, use it; otherwise use pool query
  const res = dbClient ? await dbClient.query(sql, params) : await query(sql, params);
  return res.rows[0];
}

/**
 * Fetch Outbox Engine Observability Metrics
 */
export async function getOutboxMetrics() {
  try {
    const res = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN status = 'PROCESSING' THEN 1 ELSE 0 END), 0) AS processing,
        COALESCE(SUM(CASE WHEN status = 'PROCESSED' THEN 1 ELSE 0 END), 0) AS processed,
        COALESCE(SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END), 0) AS failed,
        COALESCE(SUM(CASE WHEN status = 'DEAD_LETTER' THEN 1 ELSE 0 END), 0) AS dead_letter,
        COUNT(*) AS total_events
      FROM outbox_events;
    `);

    const oldestPending = await query(`
      SELECT id, event_type, created_at
      FROM outbox_events
      WHERE status = 'PENDING'
      ORDER BY created_at ASC
      LIMIT 1;
    `);

    const metrics = res.rows[0];
    return {
      pending: parseInt(metrics.pending, 10),
      processing: parseInt(metrics.processing, 10),
      processed: parseInt(metrics.processed, 10),
      failed: parseInt(metrics.failed, 10),
      deadLetter: parseInt(metrics.dead_letter, 10),
      totalEvents: parseInt(metrics.total_events, 10),
      oldestPending: oldestPending.rows[0] || null,
    };
  } catch (err) {
    return {
      pending: 0, processing: 0, processed: 0, failed: 0, deadLetter: 0, totalEvents: 0, oldestPending: null,
    };
  }
}
