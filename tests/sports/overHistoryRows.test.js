import { describe, expect, it } from 'vitest';
import { buildOverHistoryRows } from '../../src/utils/liveMatchWidgetData.js';

describe('buildOverHistoryRows', () => {
  it('prefers match overHistory when present', () => {
    const rows = buildOverHistoryRows(null, 'm1', {
      overHistory: [
        { overNum: 1, balls: ['1', '0', '4'], isCurrent: false },
        { overNum: 2, balls: ['W'], isCurrent: true },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ overNum: 2, isCurrent: true });
    expect(rows[0].balls).toContain('•');
  });

  it('uses field-state over balls when the feed has no overHistory', () => {
    const rows = buildOverHistoryRows({
      overNum: 4,
      overBalls: ['1', '6', 'W'],
      recentOvers: [{ overNum: 3, balls: ['0', '1'] }],
    }, 'm2', { liveDetails: {} });
    expect(rows.map((r) => r.overNum)).toEqual([3, 4]);
    expect(rows[1].balls).toEqual(['1', '6', 'W']);
    expect(rows[1].isCurrent).toBe(true);
  });

  it('always returns a current-over row so the scroller can render', () => {
    const rows = buildOverHistoryRows(null, 'm3', {
      liveDetails: { overs: '2.3' },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[rows.length - 1].isCurrent).toBe(true);
    expect(rows[rows.length - 1].overNum).toBe(3);
    expect(rows[rows.length - 1].balls.length).toBe(3);
  });
});
