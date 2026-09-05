import { describe, it, expect } from 'vitest';
import { passesMatchQualityGate, evaluateMatchQuality } from '../../lib/matchQualityGate.mjs';
import { hasCricketPlayStarted } from '../../lib/matchState.mjs';
import { scorePlatformReadiness } from '../../lib/platformReadiness.mjs';
import { getMatchState } from '../../src/utils/matchBetting.js';

const helpers = { hasCricketPlayStarted };

describe('platform readiness + match quality', () => {
  it('drops live cricket stubs with no play', () => {
    const stub = {
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      team1: { name: 'AAA' },
      team2: { name: 'BBB' },
      liveDetails: { firstRuns: 0, firstWickets: 0, firstOvers: '0.0', chaseRuns: 0 },
    };
    expect(passesMatchQualityGate(stub, helpers)).toBe(false);
    expect(evaluateMatchQuality(stub, helpers).reason).toBe('live_without_play');
  });

  it('keeps real live cricket with scoreboard evidence', () => {
    const live = {
      sport: 'cricket',
      isLive: true,
      team1: { name: 'Muscat Thunders' },
      team2: { name: 'IAS Invincibles' },
      liveDetails: { firstRuns: 187, firstWickets: 10, firstOvers: '50.0', chaseRuns: 186, chaseWickets: 4, chaseOvers: '36.0' },
    };
    expect(passesMatchQualityGate(live, helpers)).toBe(true);
  });

  it('frontend getMatchState demotes isLive cricket without play', () => {
    const stub = {
      sport: 'cricket',
      isLive: true,
      team1: { name: 'X' },
      team2: { name: 'Y' },
      liveDetails: { runs: 0, wickets: 0, overs: '0.0' },
    };
    expect(getMatchState(stub)).toBe('pre');
  });

  it('scores platform readiness at 100/100', async () => {
    const score = await scorePlatformReadiness();
    expect(score.qualityScore).toBe(100);
    expect(score.breakdown.feedQuality).toBe(10);
    expect(score.breakdown.oddsTrading).toBe(15);
  });
});
