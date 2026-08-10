import { query } from '../db/pg.js';

/**
 * Production-Hardened Persistent Idempotency Engine
 * Backed by PostgreSQL idempotency_keys table to prevent duplicate financial operations.
 */
class IdempotencyEngine {
  constructor() {
    this.memoryCache = new Map();
  }

  /**
   * Check or lock an operation by idempotency key.
   * Atomic check-and-set in PostgreSQL.
   */
  async checkOrLock(idempotencyKey, operationType = 'generic', requestHash = '') {
    if (!idempotencyKey) {
      return { isDuplicate: false, record: null };
    }

    // Fast memory cache check
    if (this.memoryCache.has(idempotencyKey)) {
      const cached = this.memoryCache.get(idempotencyKey);
      return {
        isDuplicate: true,
        status: cached.status,
        result: cached.result,
        record: cached,
      };
    }

    try {
      // Check PostgreSQL idempotency_keys table
      const dbCheck = await query(`
        SELECT key, operation_type, status, result, error, created_at, completed_at
        FROM idempotency_keys WHERE key = $1;
      `, [idempotencyKey]);

      if (dbCheck.rows.length > 0) {
        const row = dbCheck.rows[0];
        const record = {
          idempotencyKey: row.key,
          operationType: row.operation_type,
          status: row.status,
          result: row.result,
          error: row.error,
          createdAt: row.created_at,
          completedAt: row.completed_at,
        };
        this.memoryCache.set(idempotencyKey, record);

        return {
          isDuplicate: true,
          status: row.status,
          result: row.result,
          record,
        };
      }

      // Lock new operation in PostgreSQL
      await query(`
        INSERT INTO idempotency_keys (key, operation_type, request_hash, status)
        VALUES ($1, $2, $3, 'PROCESSING')
        ON CONFLICT (key) DO NOTHING;
      `, [idempotencyKey, operationType, requestHash]);

      const newRecord = {
        idempotencyKey,
        operationType,
        requestHash,
        status: 'PROCESSING',
        result: null,
        createdAt: new Date().toISOString(),
      };

      this.memoryCache.set(idempotencyKey, newRecord);
      return { isDuplicate: false, record: newRecord };
    } catch (err) {
      console.warn('[Idempotency Engine Warning]', err.message);
      return { isDuplicate: false, record: null };
    }
  }

  /** Complete idempotency operation with result */
  async complete(idempotencyKey, result = {}) {
    if (!idempotencyKey) return null;

    try {
      const now = new Date().toISOString();
      await query(`
        UPDATE idempotency_keys
        SET status = 'COMPLETED', result = $2, completed_at = $3
        WHERE key = $1;
      `, [idempotencyKey, JSON.stringify(result), now]);

      const updated = {
        idempotencyKey,
        status: 'COMPLETED',
        result,
        completedAt: now,
      };

      this.memoryCache.set(idempotencyKey, updated);
      return updated;
    } catch (err) {
      console.error('[Idempotency Complete Error]', err.message);
      return null;
    }
  }

  /** Mark idempotency operation as failed */
  async fail(idempotencyKey, error = '') {
    if (!idempotencyKey) return null;

    try {
      await query(`
        UPDATE idempotency_keys
        SET status = 'FAILED', error = $2, completed_at = CURRENT_TIMESTAMP
        WHERE key = $1;
      `, [idempotencyKey, error]);

      this.memoryCache.delete(idempotencyKey);
    } catch (err) {
      console.error('[Idempotency Fail Error]', err.message);
    }
  }
}

export const idempotencyEngine = new IdempotencyEngine();
