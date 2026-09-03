/**
 * Wall-clock finality must never invent COMPLETED for multi-day / live feeds.
 */
import { describe, it, expect } from 'vitest';
import {
  inferWallClockMatchFinal,
  isMultiDayCricket,
  isFeedStillLive,
  markInferredFinal,
} from '../../lib/settlement/wallClockFinality.mjs';
import { isExplicitMatchFinal, isMatchFinalStatus, isOverNeverCompleted } from '../../lib/settlement/inningsCompletion.mjs';

describe('wallClockFinality', () => {
  const tenHoursAgo = new Date(Date.now() - 10 * 3600 * 1000).toISOString();

  it('detects County Championship as multi-day', () => {
    expect(isMultiDayCricket({
      league: 'County Championship Division 1',
      matchFormat: 'TEST',
    })).toBe(true);
  });

  it('does not infer final for County match older than 3.5h', () => {
    const match = {
      league: 'County Championship Division 1',
      matchFormat: 'TEST',
      startTime: tenHoursAgo,
      team1: { runs: 194 },
      team2: { runs: 92 },
      isLive: true,
      matchState: 'in',
      time: 'Live',
    };
    expect(inferWallClockMatchFinal(match)).toBe(false);
    expect(isMatchFinalStatus(match)).toBe(false);
  });

  it('does not infer final while feed is still Live (even T20)', () => {
    const match = {
      league: 'IPL',
      matchType: 'T20',
      startTime: tenHoursAgo,
      isLive: true,
      matchState: 'in',
      time: 'Live',
      team1: { runs: 180 },
      team2: { runs: 90 },
    };
    expect(isFeedStillLive(match)).toBe(true);
    expect(inferWallClockMatchFinal(match)).toBe(false);
  });

  it('may infer final for stale short-format match with no live signal', () => {
    const match = {
      league: 'IPL',
      matchType: 'T20',
      startTime: tenHoursAgo,
      isLive: false,
      matchState: undefined,
      time: 'Completed',
      team1: { runs: 180 },
      team2: { runs: 175 },
      cachedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    };
    expect(inferWallClockMatchFinal(match)).toBe(true);
  });

  it('ignores mutated COMPLETED flags while feed still Live', () => {
    const match = {
      league: 'County Championship Division 1',
      matchFormat: 'TEST',
      isLive: true,
      matchState: 'in',
      time: 'Live',
      status: 'COMPLETED',
      isCompleted: true,
      liveDetails: {
        inningsId: 2,
        chaseRuns: 92,
        chaseWickets: 0,
        chaseOvers: '23.0',
        firstRuns: 194,
        firstWickets: 10,
      },
      team1: { name: 'Somerset', runs: 92, wickets: 0 },
      team2: { name: 'Glamorgan', runs: 194, wickets: 10 },
    };
    expect(isExplicitMatchFinal(match)).toBe(false);
    expect(isOverNeverCompleted(match, 2, 24)).toBe(false);
  });

  it('markInferredFinal only used after infer returns true', () => {
    const m = { isLive: true, matchState: 'in' };
    markInferredFinal(m);
    expect(m.isCompleted).toBe(true);
    expect(m.isLive).toBe(false);
  });
});
