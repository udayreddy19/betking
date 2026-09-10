import { describe, it, expect } from 'vitest';
import {
  buildOversBoardRows,
  listOversBoardInnings,
} from '../../src/utils/liveMatchWidgetData.js';

describe('buildOversBoardRows', () => {
  it('maps overHistory into Over | Balls | Runs rows (newest first)', () => {
    const match = {
      overHistory: [
        {
          overNum: 1,
          inningsId: 1,
          balls: ['1', '0', '4', '0', 'W', '2'],
          runs: 7,
          wickets: 1,
          scoreAtEnd: '7-1',
          bowler: 'Bumrah',
          batters: ['Jaiswal', 'Buttler'],
        },
        {
          overNum: 2,
          inningsId: 1,
          balls: ['6', '.', '1', '1', '.', '4'],
          runs: 19,
          wickets: 1,
          scoreAtEnd: '19-1',
          bowler: 'Arshdeep',
          batters: ['Jaiswal', 'Sawai'],
          isCurrent: true,
        },
      ],
    };

    const rows = buildOversBoardRows(match, { inningsId: 1 });
    expect(rows).toHaveLength(2);
    expect(rows[0].overNum).toBe(2);
    expect(rows[0].overRuns).toBe(12);
    expect(rows[0].balls[0]).toBe('6');
    expect(rows[0].scoreAtEnd).toBe('19-1');
    expect(rows[0].commentary).toMatch(/Arshdeep/);
    expect(rows[1].overNum).toBe(1);
    expect(rows[1].overRuns).toBe(7);
    expect(rows[1].overWickets).toBe(1);
  });

  it('lists innings for tabs', () => {
    const match = {
      overHistory: [
        { overNum: 1, inningsId: 1, balls: ['1'] },
        { overNum: 1, inningsId: 2, balls: ['0'] },
      ],
    };
    expect(listOversBoardInnings(match)).toEqual([1, 2]);
  });
});
