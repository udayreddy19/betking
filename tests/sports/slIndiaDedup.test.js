import { describe, it, expect } from 'vitest';
import {
  getCanonicalMatchPairKey,
  normalizeTeamNameForPair,
} from '../../lib/matchPairKey.mjs';
import { resolveCricketTeamScores, teamNameMatches } from '../../src/utils/cricketScores.js';

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

  it('attributes first-innings runs to Thunders when the feed says Thunderers', () => {
    const match = {
      id: 'fc_4248672',
      sport: 'cricket',
      matchType: 'ODI',
      isLive: true,
      team1: { name: 'Muscat Thunders', shortName: 'MUT', runs: 101, wickets: 5 },
      team2: { name: 'IAS Invincibles', shortName: 'IAI', runs: 0, wickets: 0 },
      liveDetails: {
        runs: 101,
        wickets: 5,
        overs: '24.5',
        score1: 101,
        wickets1: 5,
        score2: 0,
        firstRuns: 101,
        firstWickets: 5,
        firstOvers: '24.5',
        firstTeamName: 'Muscat Thunderers',
        inningsId: 1,
      },
    };
    const resolved = resolveCricketTeamScores(match, match.liveDetails);
    expect(resolved.team1.hasBatted).toBe(true);
    expect(resolved.team1.displayScore).toBe('101/5');
    expect(resolved.team2.hasBatted).toBe(false);
  });

  it('attributes runs using card totals when firstTeamName is an unknown spelling', () => {
    const match = {
      id: 'fc_unknown_spell',
      sport: 'cricket',
      matchType: 'T20',
      isLive: true,
      team1: { name: 'Desert Knights', shortName: 'DK', runs: 0, wickets: 0 },
      team2: { name: 'Coastal Warriors', shortName: 'CW', runs: 88, wickets: 3 },
      liveDetails: {
        runs: 88,
        wickets: 3,
        overs: '12.1',
        score1: 0,
        score2: 88,
        firstRuns: 88,
        firstWickets: 3,
        firstOvers: '12.1',
        firstTeamName: 'Costal Warriorz',
        inningsId: 1,
      },
    };
    const resolved = resolveCricketTeamScores(match, match.liveDetails);
    expect(resolved.team2.hasBatted).toBe(true);
    expect(resolved.team2.displayScore).toBe('88/3');
    expect(resolved.team1.hasBatted).toBe(false);
  });

  it('matches plural/collective near-miss feed labels without colliding counties', () => {
    expect(teamNameMatches('Desert Knights', 'Desert Knight')).toBe(true);
    expect(teamNameMatches('Muscat Thunders', 'Muscat Thunderers')).toBe(true);
    expect(teamNameMatches('Sussex', 'Somerset')).toBe(false);
    expect(teamNameMatches('South Africa', 'South Australia')).toBe(false);
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
    expect(a).toContain('muscat thunder');
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
