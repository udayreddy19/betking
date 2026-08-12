import { describe, it, expect } from 'vitest';
import { eventSuspensionEngine } from '../../lib/eventSuspensionEngine.mjs';
import { marketSuspensionEngine } from '../../lib/marketSuspensionEngine.mjs';

describe('Phase 4 Event-Triggered Suspension & Performance SLA Tests', () => {
  const canonicalMatchId = 'match_ind_sl_test';
  const affectedMarkets = ['mkt_match_winner', 'mkt_next_over'];

  it('CRITICAL: WICKET event must suspend affected live markets and meet < 500 ms SLA target', async () => {
    const result = await eventSuspensionEngine.handleMatchEvent(canonicalMatchId, 'WICKET', affectedMarkets);

    expect(result.eventType).toBe('WICKET');
    expect(result.causeReason).toBe('EVENT_WICKET');
    expect(result.suspensionLatencyMs).toBeLessThan(500);
    expect(result.targetMet).toBe(true);

    // Verify market suspension engine has active EVENT_WICKET cause
    const causes = await marketSuspensionEngine.getActiveCauses('mkt_match_winner');
    expect(causes.some(c => c.reason === 'EVENT_WICKET')).toBe(true);
  });

  it('GOAL event in Soccer must suspend affected live markets', async () => {
    const result = await eventSuspensionEngine.handleMatchEvent('match_epl_arsenal', 'GOAL', ['mkt_soccer_1x2']);
    expect(result.causeReason).toBe('EVENT_GOAL');
    expect(result.suspensionLatencyMs).toBeLessThan(500);
  });
});
