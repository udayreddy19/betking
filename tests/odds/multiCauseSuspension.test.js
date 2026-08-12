import { describe, it, expect } from 'vitest';
import { marketSuspensionEngine } from '../../lib/marketSuspensionEngine.mjs';

describe('Phase 4 Multi-Cause Suspension & Safety Reopening Guard Tests', () => {
  const marketId = 'mkt_multi_cause_safety_999';

  it('CRITICAL: market must remain SUSPENDED when clearing one cause if another cause remains active', async () => {
    // 1. Add first cause: MANUAL_ADMIN
    await marketSuspensionEngine.addSuspensionCause(marketId, 'MANUAL_ADMIN', 'ADMIN', 'admin_1');

    // 2. Add second cause: STALE_ODDS
    await marketSuspensionEngine.addSuspensionCause(marketId, 'STALE_ODDS', 'SYSTEM');

    let activeCauses = await marketSuspensionEngine.getActiveCauses(marketId);
    expect(activeCauses.length).toBe(2);

    // 3. Clear STALE_ODDS cause (e.g. fresh odds payload received)
    const result = await marketSuspensionEngine.clearSuspensionCause(marketId, 'STALE_ODDS');

    // EXPECTED: Market MUST REMAIN SUSPENDED because MANUAL_ADMIN cause is still active!
    expect(result.status).toBe('SUSPENDED');
    expect(result.activeCauses.length).toBe(1);
    expect(result.activeCauses[0].reason).toBe('MANUAL_ADMIN');
    expect(result.message).toContain("Cause 'STALE_ODDS' cleared, but market remains SUSPENDED");

    // 4. Now clear MANUAL_ADMIN cause
    const finalResult = await marketSuspensionEngine.clearSuspensionCause(marketId, 'MANUAL_ADMIN');

    // EXPECTED: Zero causes remain -> Market REOPENS!
    expect(finalResult.status).toBe('OPEN');
    expect(finalResult.activeCauses.length).toBe(0);
  });
});
