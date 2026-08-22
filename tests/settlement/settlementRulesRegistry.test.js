import { describe, it, expect } from 'vitest';
import { getSettlementBoundary, resolveSettlementGrader } from '../../lib/settlement/marketSettlementRegistry.mjs';
import { resolveSettlementLine } from '../../lib/settlement/placementContext.mjs';
import { combineParlayLegOutcomes } from '../../lib/settlement/parlaySettlement.mjs';

describe('settlement rule registry boundaries', () => {
  it('maps over markets to OVER_COMPLETE boundary', () => {
    const b = getSettlementBoundary('i1_next_over_16_total');
    expect(b.marketType).toBe('NEXT_OVER_TOTAL');
    expect(b.boundary).toBe('OVER_COMPLETE');
  });

  it('maps delivery markets to BALL_CONFIRMED boundary', () => {
    const b = getSettlementBoundary('i1_next_delivery_runs_16_5');
    expect(b.marketType).toBe('NEXT_DELIVERY');
    expect(b.boundary).toBe('BALL_CONFIRMED');
  });

  it('resolves grader for match winner', () => {
    expect(resolveSettlementGrader('match_winner')).toBe('openBetOutcome');
  });
});

describe('placement context at settlement', () => {
  it('prefers line frozen at placement', () => {
    const bet = {
      placement_snapshot: {
        legs: [{ line: 8.5, selectionName: 'Over 8.5' }],
      },
    };
    expect(resolveSettlementLine(bet, 'sel_x', 'Over 8.5')).toBe(8.5);
  });
});

describe('parlay settlement invariants', () => {
  it('stays PENDING when any leg pending', () => {
    const res = combineParlayLegOutcomes([
      { outcome: 'WON' },
      { outcome: null },
      { outcome: 'WON' },
    ]);
    expect(res.outcome).toBeNull();
  });

  it('LOST when any leg lost', () => {
    const res = combineParlayLegOutcomes([
      { outcome: 'WON' },
      { outcome: 'LOST' },
      { outcome: 'WON' },
    ]);
    expect(res.outcome).toBe('LOST');
  });

  it('VOID when any leg void', () => {
    const res = combineParlayLegOutcomes([
      { outcome: 'WON' },
      { outcome: 'VOID' },
      { outcome: 'WON' },
    ]);
    expect(res.outcome).toBe('VOID');
  });
});
