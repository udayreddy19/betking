import { describe, it, expect } from 'vitest';
import {
  parseBallSummary,
  cricbuzzOverNumToInteger,
  matchHasBallFeed,
  maxInningsForFormat,
  ballLabelFromCommentaryEntry,
  extractOversFromBallEntries,
} from '../../lib/cricbuzzBallFeed.mjs';

describe('cricbuzz ball feed helpers', () => {
  it('parses over summary tokens', () => {
    expect(parseBallSummary('0 4 0 W 1 Wd 2 ')).toEqual(['•', '4', '•', 'W', '1', 'wd', '2']);
  });

  it('maps Cricbuzz 0.6 → over 1 and 9.6 → over 10', () => {
    expect(cricbuzzOverNumToInteger(0.6)).toBe(1);
    expect(cricbuzzOverNumToInteger(9.6)).toBe(10);
    expect(cricbuzzOverNumToInteger(85.6)).toBe(86);
  });

  it('detects usable ball feed vs placeholder pipes', () => {
    expect(matchHasBallFeed({ overHistory: [{ overNum: 1, balls: ['|', '|'] }] })).toBe(false);
    expect(matchHasBallFeed({ overHistory: [{ overNum: 1, balls: ['•', '4', 'W'] }] })).toBe(true);
  });

  it('probes 4 innings for Tests and 2 for limited-overs formats', () => {
    expect(maxInningsForFormat('TEST')).toBe(4);
    expect(maxInningsForFormat({ matchFormat: 'T20' })).toBe(2);
    expect(maxInningsForFormat({ matchType: 'ODI' })).toBe(2);
    expect(maxInningsForFormat({ format: 'THE_HUNDRED' })).toBe(2);
    expect(maxInningsForFormat({ matchFormat: 'T10' })).toBe(2);
  });

  it('maps per-ball commentary rows without inventing outcomes', () => {
    expect(ballLabelFromCommentaryEntry({
      ballNbr: 10, overNumber: 1.4, event: 'NONE', legalRuns: 0, totalRuns: 0, commText: 'no run',
    })).toBe('•');
    expect(ballLabelFromCommentaryEntry({
      ballNbr: 11, overNumber: 1.5, event: 'FOUR', legalRuns: 4, totalRuns: 4, commText: 'FOUR',
    })).toBe('4');
    expect(ballLabelFromCommentaryEntry({
      ballNbr: 12, overNumber: 1.6, event: 'WICKET', legalRuns: 0, totalRuns: 0, commText: 'Caught!!',
    })).toBe('W');
    expect(ballLabelFromCommentaryEntry({
      ballNbr: 13, overNumber: 2.1, event: 'SIX', legalRuns: 6, totalRuns: 6, commText: 'SIX',
    })).toBe('6');
    expect(ballLabelFromCommentaryEntry({
      ballNbr: 14, overNumber: 2.2, event: 'NONE', legalRuns: 0, totalRuns: 1, commText: 'Bowler to Batter, wide, down leg',
    })).toBe('wd');
    expect(ballLabelFromCommentaryEntry({
      ballNbr: 15, overNumber: 2.3, event: 'NONE', legalRuns: 0, totalRuns: 0,
      commText: 'no run, very full and wide outside off, left alone',
    })).toBe('•');
    expect(ballLabelFromCommentaryEntry({ ballNbr: 0, legalRuns: 4 })).toBe(null);
  });

  it('builds overs from ball entries when o_summary is missing', () => {
    const payload = {
      commentary: [{
        inningsId: 1,
        commentaryList: [
          // newest-first (as Cricbuzz returns) — must still settle in chronological order
          { ballNbr: 6, overNumber: 0.6, event: 'WICKET', legalRuns: 0, totalRuns: 0, commText: 'OUT', batTeamScore: 5 },
          { ballNbr: 5, overNumber: 0.5, event: 'NONE', legalRuns: 0, totalRuns: 0, commText: 'no run', batTeamScore: 5 },
          { ballNbr: 4, overNumber: 0.4, event: 'NONE', legalRuns: 0, totalRuns: 0, commText: 'no run', batTeamScore: 5 },
          { ballNbr: 3, overNumber: 0.3, event: 'NONE', legalRuns: 1, totalRuns: 1, commText: '1 run', batTeamScore: 5 },
          { ballNbr: 2, overNumber: 0.2, event: 'FOUR', legalRuns: 4, totalRuns: 4, commText: 'FOUR', batTeamScore: 4 },
          { ballNbr: 1, overNumber: 0.1, event: 'NONE', legalRuns: 0, totalRuns: 0, commText: 'no run', batTeamScore: 0 },
        ],
      }],
    };
    const overs = extractOversFromBallEntries(payload, 1);
    expect(overs).toHaveLength(1);
    expect(overs[0].overNum).toBe(1);
    expect(overs[0].balls).toEqual(['•', '4', '1', '•', '•', 'W']);
    expect(overs[0].wickets).toBe(1);
    expect(overs[0].isCurrent).toBe(false);
  });
});
