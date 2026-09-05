import { describe, it, expect } from 'vitest';
import { passesMatchQualityGate, evaluateMatchQuality } from '../../lib/matchQualityGate.mjs';
import { hasCricketPlayStarted } from '../../lib/matchState.mjs';
import { scorePlatformReadiness } from '../../lib/platformReadiness.mjs';
import { getMatchState } from '../../src/utils/matchBetting.js';
import { isMarketEligible } from '../../lib/odds-v3/eligibility/marketEligibility.mjs';

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

  it('drops thin 0–1 live stubs with no overs', () => {
    const stub = {
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      team1: { name: 'Home XI' },
      team2: { name: 'Away XI' },
      liveDetails: { firstRuns: 0, firstWickets: 0, firstOvers: '', chaseRuns: 1, chaseWickets: 0 },
    };
    expect(evaluateMatchQuality(stub, helpers).reason).toMatch(/thin_|live_without_play/);
    expect(passesMatchQualityGate(stub, helpers)).toBe(false);
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

  it('blocks far-future dismissal markets when chase is 4 down', () => {
    const state = {
      currentInnings: 2,
      battingTeamId: 't2',
      team1: { id: 't1', wickets: 9, runs: 167 },
      team2: { id: 't2', wickets: 9, runs: 141 },
      liveDetails: { chaseWickets: 4, firstWickets: 9 },
    };
    expect(isMarketEligible('i2_team_score_at_10_dismissal', state)).toBe(false);
    expect(isMarketEligible('i2_team_score_at_5_dismissal', state)).toBe(true);
    expect(isMarketEligible('i2_method_of_next_wicket_5', state)).toBe(true);
    expect(isMarketEligible('i2_method_of_next_wicket_10', state)).toBe(false);
  });

  it('scores platform readiness at 100/100', async () => {
    const score = await scorePlatformReadiness();
    expect(score.qualityScore).toBe(100);
    expect(score.breakdown.feedQuality).toBe(10);
    expect(score.breakdown.oddsTrading).toBe(15);
  });
});
