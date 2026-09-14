import { afterEach, describe, expect, it } from 'vitest';
import { getIplSrlMatches } from '../../lib/iplSrlSimulator.mjs';
import {
  resetAllSrlOperatorSessions,
  setSrlSeasonOffsetMs,
} from '../../lib/iplSrlOperatorState.mjs';

describe('SRL public board calendar', () => {
  afterEach(() => {
    resetAllSrlOperatorSessions();
    setSrlSeasonOffsetMs(0);
  });

  it('publicBoard ignores season-jump so next fixtures follow wall calendar', () => {
    const wall = Date.parse('2026-09-14T13:49:00.000Z'); // ~19:19 IST
    // Jump sim clock ~4 days ahead (toward 18 Sep).
    setSrlSeasonOffsetMs(4 * 24 * 60 * 60 * 1000);

    const jumped = getIplSrlMatches(wall);
    const publicBoard = getIplSrlMatches(wall, { publicBoard: true });

    const firstJumped = jumped.find((m) => m.matchState !== 'post');
    const firstPublic = publicBoard.find((m) => m.matchState !== 'post');

    expect(firstPublic?.startTime).toBeLessThan(Date.parse('2026-09-15T00:00:00+05:30'));
    expect(String(firstPublic?.team1?.shortName || '')).toMatch(/SRH|LSG/);
    // Season-jump board should be later than wall-calendar next match.
    expect(Number(firstJumped?.startTime || 0)).toBeGreaterThan(Number(firstPublic?.startTime || 0));
  });

  it('lists upcoming SRL cards in start-time order on the public board', () => {
    const wall = Date.parse('2026-09-14T13:49:00.000Z');
    const upcoming = getIplSrlMatches(wall, { publicBoard: true })
      .filter((m) => m.matchState === 'pre' || m.matchState === 'in');
    expect(upcoming.length).toBeGreaterThan(2);
    for (let i = 1; i < upcoming.length; i += 1) {
      expect(Number(upcoming[i].startTime)).toBeGreaterThanOrEqual(Number(upcoming[i - 1].startTime));
    }
  });
});
