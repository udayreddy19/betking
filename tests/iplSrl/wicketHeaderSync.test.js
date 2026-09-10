import { describe, it, expect } from 'vitest';
import {
  applySrlScoreAnchors,
  syncSrlWicketsToFallOfWicket,
  fallOfWicketsFromScorecard,
} from '../../lib/iplSrlSimulator.mjs';

function stubSim(firstWickets = 1) {
  return {
    first: {
      timeline: Array.from({ length: 12 }, (_, i) => ({
        runs: 17,
        wickets: i >= 3 ? firstWickets : 0,
      })),
    },
    second: { timeline: [] },
  };
}

const liveWithFow = {
  phase: 'first',
  inningsId: 1,
  firstRuns: 17,
  firstWickets: 0,
  runs: 17,
  wickets: 0,
  firstOvers: '0.4',
  overs: '0.4',
  currentOverBalls: ['1', '4', 'W', '4'],
  scorecardInnings: [{
    runs: 17,
    wickets: 0,
    displayScore: '17/0',
    batters: [
      { name: 'Jaiswal', runs: 1, balls: 1, dismissal: 'not out' },
      { name: 'Buttler', runs: 4, balls: 10, dismissal: 'bowled', out: true },
      { name: 'Sawai', runs: 4, balls: 3, dismissal: 'not out' },
    ],
  }],
};

describe('wicketHeaderSync', () => {
  it('counts fall of wickets from scorecard correctly', () => {
    expect(fallOfWicketsFromScorecard(liveWithFow.scorecardInnings[0])).toBe(1);
  });

  it('syncs board wickets to scorecard FoW', () => {
    const synced = syncSrlWicketsToFallOfWicket(liveWithFow);
    expect(synced.firstWickets).toBe(1);
    expect(synced.wickets).toBe(1);
    expect(synced.scorecardInnings[0].wickets).toBe(1);
    expect(synced.scorecardInnings[0].displayScore).toBe('17/1');
  });

  it('incident runs-only anchor does not leave header below scorecard FoW', () => {
    const anchored = applySrlScoreAnchors(liveWithFow, stubSim(1), [{
      innings: 1,
      runs: 17,
      wickets: 0,
      naturalRunsAtAnchor: 17,
      naturalWicketsAtAnchor: 1,
      ballIndex: 3,
      applyNow: true,
      source: 'incident',
    }]);
    expect(anchored.firstRuns).toBe(17);
    expect(anchored.firstWickets).toBe(1);
    expect(anchored.wickets).toBe(1);
    expect(anchored.scorecardInnings[0].displayScore).toMatch(/^17\/1$/);
  });

  it('runs-only inject (no wickets key) keeps natural FoW via sync', () => {
    const anchored = applySrlScoreAnchors({
      ...liveWithFow,
      firstWickets: 1,
      wickets: 1,
    }, stubSim(1), [{
      innings: 1,
      runs: 21,
      naturalRunsAtAnchor: 17,
      naturalWicketsAtAnchor: 1,
      ballIndex: 3,
      applyNow: true,
      source: 'incident',
    }]);
    expect(anchored.firstRuns).toBe(21);
    expect(anchored.firstWickets).toBe(1);
  });
});
