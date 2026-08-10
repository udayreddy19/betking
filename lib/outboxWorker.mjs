import { withTransaction, query } from '../db/pg.js';
import { redis } from '../db/redis.js';

const subscribers = new Map(); // eventType -> Array of handler functions

/** Register domain event subscriber handler */
export function subscribeToEvent(eventType, handler) {
  if (!subscribers.has(eventType)) {
    subscribers.set(eventType, []);
  }
  subscribers.get(eventType).push(handler);
}

// Register default Redis cache invalidation subscribers
subscribeToEvent('USER_PROFILE_UPDATED', async (payload) => {
  if (payload.userId) await redis.del(`user:${payload.userId}:profile`);
});

subscribeToEvent('BET_PLACED', async (payload) => {
  if (payload.userId) await redis.del(`user:${payload.userId}:bets`);
});

subscribeToEvent('BET_SETTLED', async (payload) => {
  if (payload.userId) {
    await redis.del(`user:${payload.userId}:wallet`);
    await redis.del(`user:${payload.userId}:bets`);
  }
});

/**
 * Process Pending Outbox Events Batch using PostgreSQL FOR UPDATE SKIP LOCKED
 */
export async function processPendingOutboxEvents(batchSize = 20) {
  try {
    const events = await withTransaction(async (client) => {
      const claimRes = await client.query(`
        SELECT id, event_type, aggregate_type, aggregate_id, payload, attempts, correlation_id
        FROM outbox_events
        WHERE status IN ('PENDING', 'FAILED')
          AND available_at <= CURRENT_TIMESTAMP
          AND attempts < 5
        ORDER BY available_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED;
      `, [batchSize]);

      if (claimRes.rows.length === 0) return [];

      const claimedIds = claimRes.rows.map(r => r.id);
      await client.query(`
        UPDATE outbox_events
        SET status = 'PROCESSING', updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($1);
      `, [claimedIds]);

      return claimRes.rows;
    });

    let processedCount = 0;

    for (const evt of events) {
      try {
        const handlers = subscribers.get(evt.event_type) || [];
        const payload = typeof evt.payload === 'string' ? JSON.parse(evt.payload) : evt.payload;

        for (const handler of handlers) {
          await handler(payload, evt);
        }

        // Mark event as PROCESSED
        await query(`
          UPDATE outbox_events
          SET status = 'PROCESSED', processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1;
        `, [evt.id]);

        processedCount++;
      } catch (err) {
        const nextAttempts = (evt.attempts || 0) + 1;
        const maxAttempts = 5;
        const isDeadLetter = nextAttempts >= maxAttempts;
        const nextStatus = isDeadLetter ? 'DEAD_LETTER' : 'FAILED';

        // Exponential backoff: 2^attempts * 1000ms
        const delayMs = Math.pow(2, nextAttempts) * 1000;
        const nextAvailable = new Date(Date.now() + delayMs).toISOString();

        await query(`
          UPDATE outbox_events
          SET status = $1, attempts = $2, error_message = $3, available_at = $4, updated_at = CURRENT_TIMESTAMP
          WHERE id = $5;
        `, [nextStatus, nextAttempts, err.message, nextAvailable, evt.id]);
      }
    }

    return processedCount;
  } catch (err) {
    console.error('[Outbox Worker Error]', err.message);
    return 0;
  }
}
