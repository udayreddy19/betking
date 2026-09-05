import { describe, it, expect } from 'vitest';
import {
  getCanonicalMatchPairKey,
  normalizeTeamNameForPair,
} from '../../lib/matchPairKey.mjs';
import { resolveCricketTeamScores } from '../../src/utils/cricketScores.js';

describe('SL vs India pair key + test score resolve', () => {
  it('maps SL/IND codes to the same pair key as full names', () => {
    expect(normalizeTeamNameForPair('SL')).toBe('sri lanka');
    expect(normalizeTeamNameForPair('IND')).toBe('india');
    expect(normalizeTeamNameForPair('Sri Lanka')).toBe('sri lanka');

    const full = getCanonicalMatchPairKey({
      team1: { name: 'Sri Lanka' },
      team2: { name: 'India' },
      id: 'cb_163017',
    });
    const short = getCanonicalMatchPairKey({
      team1: { name: 'SL' },
      team2: { name: 'IND' },
      id: 'espn_1',
    });
    expect(full).toBe(short);
    expect(full).toBe('m|real|india|sri lanka');
  });

  it('merges Muscat Thunderers and Muscat Thunders onto one pair key', () => {
    const a = getCanonicalMatchPairKey({
      team1: { name: 'Muscat Thunderers' },
      team2: { name: 'IAS Invincibles' },
      league: 'SRL T20',
      id: 'oy_a',
    });
    const b = getCanonicalMatchPairKey({
      team1: { name: 'Muscat Thunders' },
      team2: { name: 'IAS Invincibles' },
      league: 'SRL T20',
      id: 'oy_b',
    });
    expect(a).toBe(b);
    expect(a).toContain('muscat thunders');
    expect(a).toContain('|srl|');
  });

  it('resolves testInnings batTeam codes so SL is not stuck at 0/0', () => {
    const match = {
      id: 'cb_163017',
      sport: 'cricket',
      team1: { name: 'Sri Lanka' },
      team2: { name: 'India' },
      liveDetails: {
        matchFormat: 'Test',
        score1: 8,
        wickets1: 2,
        score2: 503,
        wickets2: 9,
        chaseRuns: 8,
        chaseWickets: 2,
        firstRuns: 503,
        firstWickets: 9,
        testInnings: [
          { inningsId: 1, batTeam: 'IND', runs: 503, wickets: 9, overs: '138.0' },
          { inningsId: 2, batTeam: 'SL', runs: 8, wickets: 2, overs: '3.0' },
        ],
      },
    };

    const resolved = resolveCricketTeamScores(match, match.liveDetails);
    expect(resolved.team1.runs).toBe(8);
    expect(resolved.team1.wickets).toBe(2);
    expect(resolved.team2.runs).toBe(503);
    expect(resolved.team2.wickets).toBe(9);
  });
});
