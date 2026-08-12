import { describe, it, expect } from 'vitest';
import { oddsFreshnessEngine } from '../../lib/oddsFreshnessEngine.mjs';
import { marketSuspensionEngine } from '../../lib/marketSuspensionEngine.mjs';

describe('Phase 4 Stale Odds Freshness & Automatic Suspension Tests', () => {
  const marketId = 'mkt_stale_test_101';

  it('should classify fresh odds as FRESH and keep market active', async () => {
    const res = await oddsFreshnessEngine.processOddsFreshness(marketId, new Date().toISOString(), true);
    expect(res.freshnessStatus).toBe('FRESH');

    const causes = await marketSuspensionEngine.getActiveCauses(marketId);
    expect(causes.some(c => c.reason === 'STALE_ODDS')).toBe(false);
  });

  it('CRITICAL: stale odds (> 15s live) must automatically trigger STALE_ODDS market suspension', async () => {
    const staleTime = new Date(Date.now() - 25000).toISOString(); // 25 seconds ago
    const res = await oddsFreshnessEngine.processOddsFreshness(marketId, staleTime, true);

    expect(res.freshnessStatus).toBe('STALE');

    const causes = await marketSuspensionEngine.getActiveCauses(marketId);
    expect(causes.some(c => c.reason === 'STALE_ODDS')).toBe(true);
  });

  it('should automatically clear STALE_ODDS suspension cause when fresh odds arrive', async () => {
    const freshTime = new Date().toISOString();
    const res = await oddsFreshnessEngine.processOddsFreshness(marketId, freshTime, true);

    expect(res.freshnessStatus).toBe('FRESH');

    const causes = await marketSuspensionEngine.getActiveCauses(marketId);
    expect(causes.some(c => c.reason === 'STALE_ODDS')).toBe(false);
  });
});
