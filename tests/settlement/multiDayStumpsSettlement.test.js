import { describe, expect, it } from 'vitest';
import { resolveLiveMatchWinner } from '../../lib/liveMatchSettlement.mjs';
import { getMatchState, normalizeMatchLiveFlags } from '../../lib/matchState.mjs';
import { generateMatchWinnerEvidence } from '../../lib/settlementEvidence/matchWinnerEvidence.mjs';
import { isCricketMatchCompleted } from '../../src/utils/cricketMatchComplete.js';

function nottsHamsStumps(overrides = {}) {
  return {
    id: 'cb_notts_hams',
    sport: 'cricket',
    league: 'County Championship Division One',
    matchFormat: 'FIRST_CLASS',
    isLive: true,
    matchState: 'in',
    time: '2nd Day - Stumps',
    team1: { name: 'Nottinghamshire', shortName: 'NOT', runs: 377, wickets: 10 },
    team2: { name: 'Hampshire', shortName: 'HAM', runs: 267, wickets: 7 },
    liveDetails: {
      inningsId: 2,
      firstRuns: 377,
      firstWickets: 10,
      firstOvers: '104.2',
      firstTeamName: 'Nottinghamshire',
      chaseRuns: 267,
      chaseWickets: 7,
      chaseOvers: '100.0',
      chaseTeamName: 'Hampshire',
      commentary: 'Hampshire need 111 runs to win',
      period: '2nd Day - Stumps',
    },
    ...overrides,
  };
}

describe('multi-day stumps must not settle Match Winner', () => {
  it('keeps stumps as in-play even if provider stamped post', () => {
    const match = nottsHamsStumps({ isLive: false, matchState: 'post', time: 'Completed' });
    // liveStatus/commentary still say stumps → server state stays in
    match.liveStatus = '2nd Day - Stumps';
    match.time = '2nd Day - Stumps';
    expect(isCricketMatchCompleted(match)).toBe(false);
    expect(getMatchState(match)).toBe('in');
    expect(normalizeMatchLiveFlags(match).isLive).toBe(true);
  });

  it('does not invent a Match Winner from first-innings lead at stumps', () => {
    const match = nottsHamsStumps();
    expect(resolveLiveMatchWinner(match)).toBe(null);
  });

  it('still settles limited-overs chase winners', () => {
    const match = {
      sport: 'cricket',
      league: 'T20 Blast',
      matchFormat: 'T20',
      isLive: false,
      matchState: 'post',
      time: 'Completed',
      team1: { name: 'Isle of Man', shortName: 'IOM' },
      team2: { name: 'Spain', shortName: 'ESP' },
      liveDetails: {
        firstRuns: 108,
        firstWickets: 8,
        firstTeamName: 'Isle of Man',
        chaseRuns: 110,
        chaseWickets: 3,
        chaseTeamName: 'Spain',
        commentary: 'Spain won by 7 wickets',
      },
    };
    expect(isCricketMatchCompleted(match)).toBe(true);
    expect(resolveLiveMatchWinner(match)).toBe('2');
  });

  it('does not fabricate "won by N runs" evidence for unfinished FC boards', () => {
    const match = nottsHamsStumps();
    const evidence = generateMatchWinnerEvidence({
      bet: {
        status: 'WON',
        selection_name: 'Hampshire',
        market_id: 'match_winner',
      },
      matchState: match,
    });
    expect(evidence.matchResult.winner).toBeFalsy();
    expect(String(evidence.summary)).not.toMatch(/won by 110 runs/i);
    expect(String(evidence.summary)).toMatch(/in progress/i);
  });
});
