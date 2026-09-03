/**
 * Unit tests: never VOID next-over as never_bowled while live innings still batting.
 */
import { describe, it, expect } from 'vitest';
import {
  isOverNeverCompleted,
  isInningsComplete,
} from '../../lib/settlement/inningsCompletion.mjs';

function liveChaseMatch(overrides = {}) {
  return {
    id: 'cb_test',
    matchState: 'in',
    isLive: true,
    league: 'County Championship Division 1',
    team1: { name: 'Somerset', runs: 194, wickets: 10 },
    team2: { name: 'Glamorgan', runs: 92, wickets: 0 },
    liveDetails: {
      inningsId: 2,
      firstRuns: 194,
      firstWickets: 10,
      firstOvers: '59.2',
      chaseRuns: 92,
      chaseWickets: 0,
      chaseOvers: '23.0',
      overs: '23.0',
      runs: 92,
      wickets: 0,
      ...(overrides.liveDetails || {}),
    },
    scorecardInnings: overrides.scorecardInnings || [
      { inningsId: 1, wickets: 10, scoreDetails: { runs: 194, wickets: 10 } },
      // Stale wrong scorecard claiming innings 2 already all out
      { inningsId: 2, wickets: 10, scoreDetails: { runs: 191, wickets: 10 }, isDeclared: false },
    ],
    ...overrides,
  };
}

describe('isOverNeverCompleted live chase guard', () => {
  it('does not void over 24 while chase is live at 23 overs 0 wickets', () => {
    const match = liveChaseMatch();
    expect(isOverNeverCompleted(match, 2, 24)).toBe(false);
  });

  it('does not treat innings 2 complete when live wickets contradict scorecard all-out', () => {
    const match = liveChaseMatch();
    expect(isInningsComplete(match, 2)).toBe(false);
  });

  it('does not void when status was falsely marked COMPLETED but chase still batting', () => {
    const match = liveChaseMatch({
      matchState: 'post',
      isCompleted: true,
      status: 'COMPLETED',
      isLive: false,
    });
    expect(isOverNeverCompleted(match, 2, 24)).toBe(false);
  });
});

function isExplicitOrNever(match) {
  return isOverNeverCompleted(match, 2, 24);
}
