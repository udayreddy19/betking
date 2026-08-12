import { describe, it, expect } from 'vitest';
import { idempotencyEngine } from '../../lib/idempotencyEngine.mjs';

describe('Phase 1 Idempotency Security Tests', () => {
  it('should prevent duplicate operations for identical idempotency key', async () => {
    const key = `idem_test_${Date.now()}`;

    // First request check
    const check1 = await idempotencyEngine.checkOrLock(key, 'TEST_OP', '', 'user_idem_1');
    expect(check1.isDuplicate).toBe(false);

    // Complete first operation
    await idempotencyEngine.complete(key, { amount: 100, status: 'SUCCESS' });

    // Second request with same idempotency key
    const check2 = await idempotencyEngine.checkOrLock(key, 'TEST_OP', '', 'user_idem_1');
    expect(check2.isDuplicate).toBe(true);
    expect(check2.result).toEqual({ amount: 100, status: 'SUCCESS' });
  });

  it('CRITICAL: simultaneous duplicate requests with identical key — only ONE executes', async () => {
    const key = `idem_simul_${Date.now()}`;

    const [res1, res2] = await Promise.all([
      idempotencyEngine.checkOrLock(key, 'SIMUL_OP', '', 'user_idem_2'),
      idempotencyEngine.checkOrLock(key, 'SIMUL_OP', '', 'user_idem_2'),
    ]);

    const nonDuplicates = [res1, res2].filter(r => !r.isDuplicate);
    const duplicates = [res1, res2].filter(r => r.isDuplicate);

    expect(nonDuplicates.length).toBe(1);
    expect(duplicates.length).toBe(1);
  });
});
