import { describe, expect, it } from 'vitest';
import {
  applyLiveOddsOverlay,
  matchOddsStateKey,
} from '../../lib/matchOddsStateKey.mjs';

describe('matchOddsStateKey', () => {
  it('changes when runs or overs move', () => {
    const a = {
      liveDetails: {
        inningsId: 2,
        firstRuns: 162,
        firstWickets: 5,
        firstOvers: '10.0',
        chaseRuns: 77,
        chaseWickets: 1,
        chaseOvers: '6.0',
      },
    };
    const b = {
      liveDetails: { ...a.liveDetails, chaseRuns: 81, chaseOvers: '6.2' },
    };
    expect(matchOddsStateKey(a)).not.toBe(matchOddsStateKey(b));
  });

  it('overlays live scores onto the match used for pricing', () => {
    const match = {
      liveDetails: { chaseRuns: 70, chaseOvers: '5.4' },
    };
    const next = applyLiveOddsOverlay(match, { chaseRuns: 81, chaseOvers: '6.2' });
    expect(next.liveDetails.chaseRuns).toBe(81);
    expect(next.liveDetails.chaseOvers).toBe('6.2');
  });
});
