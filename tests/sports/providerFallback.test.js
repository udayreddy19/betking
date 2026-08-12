import { describe, it, expect } from 'vitest';
import { providerHealthEngine } from '../../lib/providerHealthEngine.mjs';

describe('Phase 3 Provider Health & Automated Fallback Tests', () => {
  it('should classify fresh active provider feeds as FRESH', () => {
    providerHealthEngine.recordSuccess('cricbuzz', 150);
    const freshness = providerHealthEngine.evaluateFreshness('cricbuzz');
    expect(freshness).toBe('FRESH');
  });

  it('CRITICAL: should trigger automated fallback to secondary provider when primary fails', async () => {
    // Record 3 consecutive failures for primary provider Cricbuzz
    await providerHealthEngine.recordFailure('cricbuzz', 'HTTP Timeout');
    await providerHealthEngine.recordFailure('cricbuzz', 'HTTP Timeout');
    await providerHealthEngine.recordFailure('cricbuzz', 'HTTP Timeout');

    // Make secondary provider ESPN healthy
    await providerHealthEngine.recordSuccess('espn', 200);

    const operational = providerHealthEngine.getOperationalProvider('cricket', 'cricbuzz', 'espn');
    expect(operational.activeProvider).toBe('espn');
    expect(operational.isFallback).toBe(true);
    expect(operational.fallbackReason).toContain('cricbuzz is OFFLINE');
  });

  it('should automatically recover primary provider when health restores', async () => {
    // Restore health for Cricbuzz
    await providerHealthEngine.recordSuccess('cricbuzz', 180);

    const operational = providerHealthEngine.getOperationalProvider('cricket', 'cricbuzz', 'espn');
    expect(operational.activeProvider).toBe('cricbuzz');
    expect(operational.isFallback).toBe(false);
  });
});
