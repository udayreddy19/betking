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

  it('VOID + PENDING stays pending until all legs resolve', () => {
    const r = combineParlayLegOutcomes([
      { outcome: 'VOID' },
      { outcome: null },
    ]);
    expect(r.outcome).toBeNull();
    expect(r.reason).toBe('acca_legs_pending');
  });

  it('WON + VOID voids the acca when no legs pending', () => {
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
