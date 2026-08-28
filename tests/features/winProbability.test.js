import { describe, it, expect } from 'vitest';
import { calculateWinProbability } from '../../src/utils/winProbabilityCalculator';

describe('Cricket Win Probability Calculator', () => {
  it('calculates 1st innings probabilities within valid bounds', () => {
    const match = {
      team1: { name: 'CSK', runs: 120, wickets: 2 },
      team2: { name: 'DC', runs: 0, wickets: 0 },
      liveDetails: { firstRuns: 120, firstWickets: 2, overs: '12.0', innings: 1 },
      status: 'LIVE',
    };

    const res = calculateWinProbability(match);
    expect(res.team1Prob).toBeGreaterThanOrEqual(15);
    expect(res.team1Prob).toBeLessThanOrEqual(85);
    expect(res.team1Prob + res.team2Prob).toBe(100);
  });

  it('calculates 2nd innings chase probability accurately', () => {
    const chaseMatch = {
      team1: { name: 'CSK', runs: 179, wickets: 5 },
      team2: { name: 'DC', runs: 177, wickets: 3 },
      liveDetails: {
        firstRuns: 179,
        chaseRuns: 177,
        chaseWickets: 3,
        overs: '18.5',
        innings: 2,
      },
      status: 'LIVE',
    };

    const res = calculateWinProbability(chaseMatch);
    // DC needs 3 runs from 7 balls with 7 wickets in hand -> High win prob
    expect(res.team2Prob).toBeGreaterThan(80);
    expect(res.runsNeeded).toBe(3);
    expect(res.ballsRemaining).toBe(7);
  });
});
