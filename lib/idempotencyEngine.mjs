/**
 * Central Idempotency Engine
 * Ensures duplicate HTTP requests or events produce identical results without duplicate side-effects.
 */

class IdempotencyEngine {
  constructor() {
    this.records = new Map(); // idempotencyKey -> Idempotency Record
  }

  /**
   * Check or register an operation by idempotency key.
   */
  checkOrLock(idempotencyKey, operationType = 'generic', requestHash = '') {
    if (!idempotencyKey) {
      return { isDuplicate: false, record: null };
    }

    const existing = this.records.get(idempotencyKey);
    if (existing) {
      return {
        isDuplicate: true,
        status: existing.status,
        result: existing.result,
        record: existing,
      };
    }

    const newRecord = {
      idempotencyKey,
      operationType,
      requestHash,
      status: 'PROCESSING',
      result: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    this.records.set(idempotencyKey, newRecord);
    return { isDuplicate: false, record: newRecord };
  }

  /** Complete idempotency operation with result */
  complete(idempotencyKey, result = {}) {
    const existing = this.records.get(idempotencyKey);
    if (!existing) return null;

    existing.status = 'COMPLETED';
    existing.result = result;
    existing.completedAt = new Date().toISOString();
    return existing;
  }

  /** Mark idempotency operation as failed */
  fail(idempotencyKey, error = '') {
    const existing = this.records.get(idempotencyKey);
    if (!existing) return null;

    existing.status = 'FAILED';
    existing.error = error;
    existing.completedAt = new Date().toISOString();
    return existing;
  }

  clear() {
    this.records.clear();
  }
}

export const idempotencyEngine = new IdempotencyEngine();
