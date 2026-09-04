import { query } from '../db/pg.js';
import { logger } from './logger.mjs';

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
  async checkOrLock(idempotencyKey, operationType = 'generic', requestHash = '', userId = null) {
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

      // Lock new operation in PostgreSQL atomically with RETURNING key
      const insertRes = await query(`
        INSERT INTO idempotency_keys (key, operation_type, request_hash, status, user_id)
        VALUES ($1, $2, $3, 'PROCESSING', $4)
        ON CONFLICT (key) DO NOTHING
        RETURNING key;
      `, [idempotencyKey, operationType, requestHash, userId]);

      if (insertRes.rows.length === 0) {
        // Concurrent request inserted first
        const existing = await query(`
          SELECT key, operation_type, status, result, error, created_at, completed_at
          FROM idempotency_keys WHERE key = $1;
        `, [idempotencyKey]);

        if (existing.rows.length > 0) {
          const row = existing.rows[0];
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
      }

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
      // Fail closed — never allow duplicate financial ops when the store is unavailable.
      throw new Error(`IDEMPOTENCY_STORE_UNAVAILABLE: ${err.message}`);
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
      // Never swallow: callers that already committed money must surface this so
      // PROCESSING locks are not left silently after a successful credit.
      logger.error('idempotency_complete_failed', {
        idempotencyKey,
        error: err.message || String(err),
      });
      throw err;
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

  /**
   * Drop a non-completed lock so a financial op can be retried after failure
   * or a stale PROCESSING claim (crash mid-flight).
   */
  async release(idempotencyKey, { allowStatuses = ['FAILED', 'PROCESSING'] } = {}) {
    if (!idempotencyKey) return false;
    this.memoryCache.delete(idempotencyKey);
    const allowed = (allowStatuses || []).map((s) => String(s).toUpperCase());
    try {
      const res = await query(
        `DELETE FROM idempotency_keys
         WHERE key = $1
           AND UPPER(COALESCE(status, '')) = ANY($2::text[])`,
        [idempotencyKey, allowed],
      );
      return (res.rowCount || 0) > 0;
    } catch (err) {
      console.error('[Idempotency Release Error]', err.message);
      return false;
    }
  }
}

export const idempotencyEngine = new IdempotencyEngine();
