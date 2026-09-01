import { describe, expect, it } from 'vitest';
import { formatCricketInlineScore, resolveCricketTeamScores } from '../../src/utils/cricketScores.js';
import { normalizeMatch } from '../../src/utils/cricketMatchNormalizer.js';

const keralaT20 = {
  id: 'cb_kca_t20',
  sport: 'cricket',
  team1: { id: 'aks', name: 'Aries Kollam Sailors', shortName: 'AKS' },
  team2: { id: 'tt', name: 'Thrissur Titans', shortName: 'TT' },
  isLive: true,
  matchState: 'in',
};

describe('My Bets cricket score line', () => {
  it('does not repeat a copied first-innings total as 42/2 : 42/2', () => {
    const match = {
      ...keralaT20,
      liveDetails: {
        inningsId: 1,
        runs: 42,
        wickets: 2,
        overs: '6.2',
        firstRuns: 42,
        firstWickets: 2,
        firstOvers: '6.2',
        score1: 42,
        score2: 42,
        wickets1: 2,
        wickets2: 2,
        overs2: '6.2',
        chaseRuns: 42,
        chaseWickets: 2,
        chaseOvers: '6.2',
      },
    };

    expect(formatCricketInlineScore(match)).toBe('42/2');
    expect(resolveCricketTeamScores(match).team2.hasBatted).toBe(false);
    expect(normalizeMatch(match).awayTeam.hasBatted).toBe(false);
  });

  it('still shows both sides when the chase is a real different total', () => {
    const match = {
      ...keralaT20,
      liveDetails: {
        inningsId: 2,
        firstRuns: 156,
        firstWickets: 6,
        firstOvers: '20.0',
        chaseRuns: 42,
        chaseWickets: 2,
        chaseOvers: '6.2',
        firstTeamName: 'Aries Kollam Sailors',
        chaseTeamName: 'Thrissur Titans',
      },
    };

    expect(formatCricketInlineScore(match)).toBe('156/6 : 42/2');
  });
});
