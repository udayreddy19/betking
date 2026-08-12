import { describe, it, expect } from 'vitest';
import { getRetentionAndCohortMetrics, getUserFunnelMetrics } from '../../lib/businessIntelligenceEngine.mjs';

describe('Phase 12 Retention, ARPU & Conversion Funnel Tests', () => {
  it('should calculate retention metrics and cohort list', async () => {
    const res = await getRetentionAndCohortMetrics();
    expect(res.success).toBe(true);
    expect(res.d1RetentionPct).toBeGreaterThanOrEqual(0.0);
    expect(Array.isArray(res.cohorts)).toBe(true);
  });

  it('should calculate 4-stage customer conversion funnel', async () => {
    const res = await getUserFunnelMetrics();
    expect(res.success).toBe(true);
    expect(res.funnel.length).toBe(4);
    expect(res.funnel[0].stage).toBe('1. Registered Users');
    expect(res.funnel[1].stage).toBe('2. KYC Verified');
    expect(res.funnel[2].stage).toBe('3. First Deposit');
    expect(res.funnel[3].stage).toBe('4. First Bet Placed');
  });
});
