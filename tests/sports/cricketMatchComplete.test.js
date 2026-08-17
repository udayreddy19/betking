import { describe, it, expect } from 'vitest';
import { isCricketMatchCompleted } from '../../src/utils/cricketMatchComplete.js';
import { getMatchState, isDisplayableLiveMatch } from '../../src/utils/matchBetting.js';
import { getMatchState as getServerMatchState, normalizeMatchLiveFlags } from '../../lib/matchState.mjs';
import { resolveCricketTeamScores } from '../../src/utils/cricketScores.js';

function iomSpain(overrides = {}) {
  return {
    id: 'iom_esp',
    sport: 'cricket',
    isLive: true,
    matchState: 'in',
    time: 'Live',
    team1: { name: 'Isle of Man', runs: 108, wickets: 8 },
    team2: { name: 'Spain', runs: 110, wickets: 3 },
    liveDetails: {
      inningsId: 2,
      firstRuns: 108,
      firstWickets: 8,
      firstTeamName: 'Isle of Man',
      chaseRuns: 110,
      chaseWickets: 3,
      chaseTeamName: 'Spain',
      commentary: 'Spain need 0 runs to win',
    },
    ...overrides,
  };
}

describe('completed cricket matches leave live', () => {
  it('marks a finished chase as post even when the feed still says live', () => {
    const match = iomSpain();
    expect(isCricketMatchCompleted(match)).toBe(true);
    expect(getMatchState(match)).toBe('post');
    expect(getServerMatchState(match)).toBe('post');
    expect(isDisplayableLiveMatch(match)).toBe(false);
    const normalized = normalizeMatchLiveFlags(match);
    expect(normalized.isLive).toBe(false);
    expect(normalized.matchState).toBe('post');
    expect(getServerMatchState(match)).toBe('post');
  });

  it('marks a result line like "Purani Dilli 6 won" as complete', () => {
    const match = {
      id: 'cb_169111',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      time: 'Match starts at Aug 16, 13:30 GMT',
      team1: { name: 'Outer Delhi Warriors', runs: 165, wickets: 10, overs: '20.0' },
      team2: { name: 'Purani Dilli 6', runs: 169, wickets: 3, overs: '18.2' },
      liveDetails: {
        inningsId: 2,
        overs: '0.0',
        commentary: 'Purani Dilli 6 won',
      },
    };
    expect(isCricketMatchCompleted(match)).toBe(true);
    expect(getMatchState(match)).toBe('post');
    expect(isDisplayableLiveMatch(match)).toBe(false);
  });

  it('does not treat toss-only copy as a completed match', () => {
    const match = {
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      liveDetails: {
        inningsId: 1,
        firstRuns: 12,
        commentary: 'Outer Delhi Warriors won the toss and opted to bat',
      },
    };
    expect(isCricketMatchCompleted(match)).toBe(false);
    expect(getMatchState(match)).toBe('in');
  });

  it('keeps a genuine chase in live', () => {
    const match = iomSpain({
      team2: { name: 'Spain', runs: 100, wickets: 3 },
      liveDetails: {
        inningsId: 2,
        firstRuns: 150,
        firstWickets: 8,
        firstTeamName: 'Isle of Man',
        chaseRuns: 100,
        chaseWickets: 3,
        chaseTeamName: 'Spain',
        commentary: 'Spain need 51 runs to win',
      },
    });
    expect(isCricketMatchCompleted(match)).toBe(false);
    expect(getMatchState(match)).toBe('in');
    expect(isDisplayableLiveMatch(match)).toBe(true);
  });

  it('does not treat innings break as complete', () => {
    const match = {
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      time: 'Innings Break',
      liveDetails: {
        inningsId: 1,
        firstRuns: 108,
        firstWickets: 8,
        commentary: 'Innings break',
      },
    };
    expect(isCricketMatchCompleted(match)).toBe(false);
    expect(getMatchState(match)).toBe('in');
  });

  it('maps first-innings score onto team1 during a completed chase', () => {
    const scores = resolveCricketTeamScores(iomSpain({
      liveDetails: {
        inningsId: 2,
        firstRuns: 0,
        chaseRuns: 110,
        chaseWickets: 3,
        chaseTeamName: 'Spain',
        firstTeamName: 'Isle of Man',
        commentary: 'Spain need 0 runs to win',
      },
    }));
    expect(scores.team1.runs).toBe(108);
    expect(scores.team2.runs).toBe(110);
  });
});
