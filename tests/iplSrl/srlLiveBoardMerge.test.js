import { describe, expect, it } from 'vitest';
import { overlaySrlFromServer } from '../../src/utils/srlLiveBoardMerge.js';

describe('overlaySrlFromServer season-jump protection', () => {
  it('does not demote a wall-clock live match to post from a jumped server board', () => {
    const start = Date.now() - (25 * 60 * 1000);
    const client = {
      id: 'srl_ipl_6',
      startTime: start,
      expectedDurationMs: 3.5 * 3600 * 1000,
      matchState: 'in',
      isLive: true,
      liveDetails: { phase: 'first', firstRuns: 24, firstWickets: 1, overs: '3.2' },
    };
    const server = {
      id: 'srl_ipl_6',
      startTime: start,
      matchState: 'post',
      isCompleted: true,
      isLive: false,
      operator: {},
      liveDetails: {
        phase: 'chase-complete',
        firstRuns: 80,
        chaseRuns: 81,
        commentary: 'Season jump completed board',
      },
    };

    const out = overlaySrlFromServer(client, server);
    expect(out.matchState).toBe('in');
    expect(out.isLive).toBe(true);
    expect(out.liveDetails.phase).toBe('first');
    expect(out.liveDetails.firstRuns).toBe(24);
  });

  it('still accepts a declared server completion', () => {
    const start = Date.now() - (25 * 60 * 1000);
    const client = {
      id: 'srl_ipl_6',
      startTime: start,
      expectedDurationMs: 3.5 * 3600 * 1000,
      matchState: 'in',
      isLive: true,
      liveDetails: { phase: 'first', firstRuns: 24 },
    };
    const server = {
      id: 'srl_ipl_6',
      startTime: start,
      matchState: 'post',
      isCompleted: true,
      operator: { declaredWinnerKey: 'srh', started: true },
      liveDetails: { phase: 'chase-complete', firstRuns: 80, chaseRuns: 81 },
    };

    const out = overlaySrlFromServer(client, server);
    expect(out.matchState).toBe('post');
    expect(out.liveDetails.phase).toBe('chase-complete');
  });
});
