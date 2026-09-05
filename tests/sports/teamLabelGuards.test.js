import { describe, it, expect } from 'vitest';
import {
  teamNameMatches,
  resolveCricketTeamScores,
  resolveLabeledTeamSide,
  resolveInningsSidesFromLabels,
  hasDistinctiveTeamOverlap,
  matchesTeamIdentifier,
} from '../../src/utils/cricketScores.js';
import { getCanonicalMatchPairKey } from '../../lib/matchPairKey.mjs';

describe('team label guards', () => {
  it('refuses weak shared prefixes like South / West / United alone', () => {
    expect(teamNameMatches('South Africa', 'South')).toBe(false);
    expect(teamNameMatches('South Australia', 'South')).toBe(false);
    expect(teamNameMatches('West Indies', 'West')).toBe(false);
    expect(teamNameMatches('United Arab Emirates', 'United')).toBe(false);
    expect(teamNameMatches('South Africa', 'SA')).toBe(true);
    expect(teamNameMatches('West Indies', 'WI')).toBe(true);
  });

  it('keeps South Africa distinct from South Australia', () => {
    expect(teamNameMatches('South Africa', 'South Australia')).toBe(false);
    expect(hasDistinctiveTeamOverlap('South Africa', 'South Australia')).toBe(false);
    expect(
      resolveLabeledTeamSide('South', 'South Africa', 'South Australia', {
        homeRuns: 120,
        awayRuns: 0,
      }),
    ).toBe('home');
    expect(
      resolveLabeledTeamSide('South', 'South Africa', 'South Australia', {
        homeRuns: 50,
        awayRuns: 50,
      }),
    ).toBeNull();
  });

  it('keeps Sussex / Somerset / Nottinghamshire short codes from colliding', () => {
    expect(teamNameMatches('Sussex', 'SUS')).toBe(true);
    expect(teamNameMatches('Somerset', 'SUS')).toBe(false);
    expect(teamNameMatches('Somerset', 'SOM')).toBe(true);
    expect(matchesTeamIdentifier({ name: 'Nottinghamshire', shortName: 'NOT' }, 'NOTTS')).toBe(true);
    expect(matchesTeamIdentifier({ name: 'Northamptonshire', shortName: 'NOR' }, 'NOTTS')).toBe(false);
  });

  it('maps spelling variants: challengers, invincibles, knights', () => {
    expect(teamNameMatches('Royal Challengers', 'Royal Challangers')).toBe(true);
    expect(teamNameMatches('IAS Invincibles', 'IAS Invinciblers')).toBe(true);
    expect(teamNameMatches('Desert Knights', 'Desert Knight')).toBe(true);
    expect(
      getCanonicalMatchPairKey({
        team1: { name: 'Royal Challangers Bangalore' },
        team2: { name: 'Mumbai Indians' },
        id: 'a',
      }),
    ).toBe(
      getCanonicalMatchPairKey({
        team1: { name: 'Royal Challengers Bangalore' },
        team2: { name: 'Mumbai Indians' },
        id: 'b',
      }),
    );
  });

  it('uses wickets/overs activity when runs are still 0', () => {
    expect(
      resolveLabeledTeamSide('Unknown XI', 'Home CC', 'Away CC', {
        homeRuns: 0,
        awayRuns: 0,
        homeWickets: 0,
        awayWickets: 2,
        homeOvers: '0.0',
        awayOvers: '3.2',
      }),
    ).toBe('away');
  });

  it('detects conflicting first/chase labels that point at the same side', () => {
    const result = resolveInningsSidesFromLabels(
      'Muscat Thunders',
      'Muscat Thunderers',
      'Muscat Thunders',
      'IAS Invincibles',
      { homeRuns: 101, awayRuns: 0 },
    );
    expect(result.labelsConflict).toBe(true);
    expect(result.firstSide).toBe('home');
    expect(result.chaseSide).toBeNull();
  });

  it('does not hang first-innings total on the wrong side for ambiguous dual match', () => {
    const match = {
      id: 'ambiguous_south',
      sport: 'cricket',
      matchType: 'ODI',
      isLive: true,
      team1: { name: 'South Africa', shortName: 'SA', runs: 210, wickets: 4 },
      team2: { name: 'South Australia', shortName: 'SOA', runs: 0, wickets: 0 },
      liveDetails: {
        runs: 210,
        wickets: 4,
        overs: '38.2',
        score1: 210,
        score2: 0,
        firstRuns: 210,
        firstWickets: 4,
        firstOvers: '38.2',
        firstTeamName: 'South',
        inningsId: 1,
      },
    };
    const resolved = resolveCricketTeamScores(match, match.liveDetails);
    expect(resolved.team1.hasBatted).toBe(true);
    expect(resolved.team1.displayScore).toBe('210/4');
    expect(resolved.team2.hasBatted).toBe(false);
  });

  it('attributes chase label near-miss without flipping first innings', () => {
    const match = {
      id: 'chase_near_miss',
      sport: 'cricket',
      matchType: 'T20',
      isLive: true,
      team1: { name: 'Muscat Thunders', shortName: 'MUT', runs: 156, wickets: 7 },
      team2: { name: 'IAS Invincibles', shortName: 'IAI', runs: 42, wickets: 1 },
      liveDetails: {
        inningsId: 2,
        firstRuns: 156,
        firstWickets: 7,
        firstOvers: '20.0',
        firstTeamName: 'Muscat Thunderers',
        chaseRuns: 42,
        chaseWickets: 1,
        chaseOvers: '5.3',
        chaseTeamName: 'IAS Invinciblers',
      },
    };
    const resolved = resolveCricketTeamScores(match, match.liveDetails);
    expect(resolved.team1.displayScore).toBe('156/7');
    expect(resolved.team2.displayScore).toBe('42/1');
  });

  it('matchesTeamIdentifier stays exact for franchise codes', () => {
    expect(matchesTeamIdentifier({ name: 'Chennai Super Kings', shortName: 'CSK' }, 'CSK')).toBe(true);
    expect(matchesTeamIdentifier({ name: 'Mumbai Indians', shortName: 'MI' }, 'CSK')).toBe(false);
    expect(matchesTeamIdentifier('Muscat Thunders', 'Muscat Warriors')).toBe(false);
  });
});
