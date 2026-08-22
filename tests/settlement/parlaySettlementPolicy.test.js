import { describe, it, expect } from 'vitest';
import { combineParlayLegOutcomes } from '../../lib/settlement/parlaySettlement.mjs';

describe('parlay settlement policy', () => {
  it('WON + PENDING stays pending', () => {
    const r = combineParlayLegOutcomes([
      { outcome: 'WON' },
      { outcome: null },
    ]);
    expect(r.outcome).toBeNull();
  });

  it('WON + LOST loses immediately', () => {
    const r = combineParlayLegOutcomes([
      { outcome: 'WON' },
      { outcome: 'LOST' },
    ]);
    expect(r.outcome).toBe('LOST');
  });

  it('WON + VOID voids the acca', () => {
    const r = combineParlayLegOutcomes([
      { outcome: 'WON' },
      { outcome: 'VOID' },
    ]);
    expect(r.outcome).toBe('VOID');
  });

  it('all WON wins the acca', () => {
    const r = combineParlayLegOutcomes([
      { outcome: 'WON' },
      { outcome: 'WON' },
    ]);
    expect(r.outcome).toBe('WON');
  });
});
