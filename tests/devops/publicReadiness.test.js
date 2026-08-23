import { describe, it, expect } from 'vitest';
import { getPublicReadinessStatus } from '../../lib/devopsEngine.mjs';

describe('public readiness exposure', () => {
  it('returns minimal payload without queue metrics', () => {
    const body = getPublicReadinessStatus({ ready: true, status: 'HEALTHY' });
    expect(body.ready).toBe(true);
    expect(body.status).toBe('HEALTHY');
    expect(body.timestamp).toBeTruthy();
    expect(body.settlementWorker).toBeUndefined();
    expect(body.queueDepth).toBeUndefined();
  });
});
