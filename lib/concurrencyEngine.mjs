/**
 * Distributed Concurrency & Lock Engine
 * Protects bet placements, cashout, settlements, and wallet operations from race conditions.
 */

class ConcurrencyEngine {
  constructor() {
    this.activeLocks = new Map(); // lockKey -> { lockId, acquiredAt, expiresAt }
  }

  /** Acquire lock for critical operation with auto TTL */
  async acquireLock(lockKey, ttlMs = 5000) {
    const now = Date.now();
    const existing = this.activeLocks.get(lockKey);

    if (existing && existing.expiresAt > now) {
      return { acquired: false, reason: 'Lock currently held by active process' };
    }

    const lockId = `lock_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const lockInfo = {
      lockId,
      acquiredAt: now,
      expiresAt: now + ttlMs,
    };

    this.activeLocks.set(lockKey, lockInfo);
    return { acquired: true, lockId, lockKey };
  }

  /** Release lock */
  releaseLock(lockKey, lockId) {
    const existing = this.activeLocks.get(lockKey);
    if (!existing) return true;
    if (existing.lockId === lockId || Date.now() > existing.expiresAt) {
      this.activeLocks.delete(lockKey);
      return true;
    }
    return false;
  }

  /** Run asynchronous critical action inside lock */
  async runLocked(lockKey, actionFn, ttlMs = 5000) {
    const lockRes = await this.acquireLock(lockKey, ttlMs);
    if (!lockRes.acquired) {
      throw new Error(`Concurrency Lock Conflict for key: ${lockKey}`);
    }

    try {
      const result = await actionFn();
      return result;
    } finally {
      this.releaseLock(lockKey, lockRes.lockId);
    }
  }

  clear() {
    this.activeLocks.clear();
  }
}

export const concurrencyEngine = new ConcurrencyEngine();
