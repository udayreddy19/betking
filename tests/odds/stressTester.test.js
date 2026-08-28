import { describe, it, expect } from 'vitest';
import { runMatchOddsStressTest, SAMPLE_DELIVERIES } from '../../lib/oddsStressTester.mjs';

describe('OddsEngine V3 — Live Match Delivery Simulator & Benchmark', () => {
  it('contains valid delivery event definitions', () => {
    expect(SAMPLE_DELIVERIES.length).toBeGreaterThanOrEqual(4);
    expect(SAMPLE_DELIVERIES.some((d) => d.event === 'WICKET')).toBe(true);
    expect(SAMPLE_DELIVERIES.some((d) => d.event === 'BOUNDARY_SIX')).toBe(true);
  });

  it('runs match simulation over 6 deliveries with fast pricing reaction', () => {
    const res = runMatchOddsStressTest({
      matchId: 'sim_test_1',
      scoreHome: 135,
      wicketsHome: 2,
      oversCompleted: 15.0,
      teamHome: 'India',
      teamAway: 'Australia',
    }, 6);

    expect(res.totalBallsExecuted).toBe(6);
    expect(res.deliveries.length).toBe(6);
    expect(res.avgLatencyMs).toBeLessThan(100);
  });
});
