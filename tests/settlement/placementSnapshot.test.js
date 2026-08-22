import { describe, it, expect } from 'vitest';
import { parseMarketInstance, buildLegPlacementContext } from '../../lib/placementSnapshot.mjs';

describe('placement snapshot', () => {
  it('captures next over total market instance', () => {
    const ctx = buildLegPlacementContext({
      matchId: 'oy_1',
      marketId: 'i1_next_over_16_total',
      selectionId: 'sel_over_85',
      selectionName: 'Over 8.5',
      odds: 1.95,
    });
    expect(ctx.marketInstance.type).toBe('NEXT_OVER_TOTAL');
    expect(ctx.marketInstance.over).toBe(16);
    expect(ctx.line).toBe(8.5);
    expect(ctx.selectionSide).toBe('OVER');
  });

  it('captures delivery market ball slot', () => {
    const inst = parseMarketInstance('i1_next_delivery_runs_16_5');
    expect(inst.type).toBe('NEXT_DELIVERY');
    expect(inst.over).toBe(16);
    expect(inst.ball).toBe(5);
    expect(inst.instanceKey).toContain('O16:B5');
  });
});
