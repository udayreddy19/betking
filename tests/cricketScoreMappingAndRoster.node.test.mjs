import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMatch, normalizeMatchScore } from '../src/utils/cricketMatchNormalizer.js';
import { resolveCricketTeamScores, teamNameMatches } from '../src/utils/cricketScores.js';

describe('CRITICAL CRICKET SCORE MAPPING & ROSTER DISPLAY FIX', () => {
  test('1. Test Match Multi-Innings Ownership (Sussex vs Somerset)', () => {
    const rawTestMatch = {
      id: 'match_test_sus_som_101',
      sport: 'cricket',
      league: 'County Championship Division One',
      format: 'TEST',
      matchType: 'Test',
      isLive: true,
      team1: { id: 'team_sussex', name: 'Sussex', shortName: 'SUS' },
      team2: { id: 'team_somerset', name: 'Somerset', shortName: 'SOM' },
      liveDetails: {
        matchFormat: 'TEST',
        inningsId: 3,
        testInnings: [
          {
            inningsId: 1,
            inningsNum: 1,
            batTeamId: 'team_sussex',
            batTeam: 'Sussex',
            teamSName: 'SUS',
            runs: 202,
            wickets: 10,
            overs: '64.2',
          },
          {
            inningsId: 2,
            inningsNum: 1,
            batTeamId: 'team_somerset',
            batTeam: 'Somerset',
            teamSName: 'SOM',
            runs: 250,
            wickets: 10,
            overs: '82.1',
          },
          {
            inningsId: 3,
            inningsNum: 2,
            batTeamId: 'team_sussex',
            batTeam: 'Sussex',
            teamSName: 'SUS',
            runs: 256,
            wickets: 3,
            overs: '78.3',
          },
        ],
      },
    };

    const normalized = normalizeMatch(rawTestMatch);

    // Mutual Exclusivity
    assert.equal(normalized.homeTeam.innings.length, 2, 'Sussex should have exactly 2 innings');
    assert.equal(normalized.homeTeam.innings[0].inningsId, 1);
    assert.equal(normalized.homeTeam.innings[0].runs, 202);
    assert.equal(normalized.homeTeam.innings[0].wickets, 10);
    assert.equal(normalized.homeTeam.innings[1].inningsId, 3);
    assert.equal(normalized.homeTeam.innings[1].runs, 256);
    assert.equal(normalized.homeTeam.innings[1].wickets, 3);

    assert.equal(normalized.awayTeam.innings.length, 1, 'Somerset should have exactly 1 innings');
    assert.equal(normalized.awayTeam.innings[0].inningsId, 2);
    assert.equal(normalized.awayTeam.innings[0].runs, 250);
    assert.equal(normalized.awayTeam.innings[0].wickets, 10);

    // Compact Roster Single Score
    assert.equal(normalized.homeTeam.latestScore, '256/3');
    assert.equal(normalized.homeTeam.score, '256/3');
    assert.equal(normalized.homeTeam.displayScore, '256/3');

    assert.equal(normalized.awayTeam.latestScore, '250/10');
    assert.equal(normalized.awayTeam.score, '250/10');
    assert.equal(normalized.awayTeam.displayScore, '250/10');

    // NEVER display combined string "202/10 & 250/10 & 256/3"
    assert.ok(!normalized.homeTeam.score.includes('250/10'));
    assert.ok(!normalized.awayTeam.score.includes('202/10'));
    assert.ok(!normalized.awayTeam.score.includes('256/3'));

    // Detailed Summary
    assert.equal(normalized.homeTeam.fullInningsSummary, '202 & 256/3');
    assert.equal(normalized.awayTeam.fullInningsSummary, '250/10');

    // Active Current Innings
    assert.equal(normalized.currentInnings.matchInningsId, 3);
    assert.equal(normalized.currentInnings.batTeam, 'Sussex');
    assert.equal(normalized.currentInnings.runs, 256);
    assert.equal(normalized.currentInnings.wickets, 3);
    assert.equal(normalized.currentInnings.overs, '78.3');

    // resolveCricketTeamScores
    const resolved = resolveCricketTeamScores(rawTestMatch, rawTestMatch.liveDetails);
    assert.equal(resolved.team1.displayScore, '256/3');
    assert.equal(resolved.team2.displayScore, '250/10');
    assert.equal(resolved.team1.innings.length, 2);
    assert.equal(resolved.team2.innings.length, 1);
  });

  test('2. Team Identification & Disambiguation (Prevent Initial Collisions)', () => {
    assert.equal(teamNameMatches('Sussex', 'SUS'), true);
    assert.equal(teamNameMatches('Somerset', 'SUS'), false);
    assert.equal(teamNameMatches('Somerset', 'SOM'), true);
    assert.equal(teamNameMatches('Sussex', 'SOM'), false);

    assert.equal(teamNameMatches('Chennai Super Kings', 'CSK'), true);
    assert.equal(teamNameMatches('Mumbai Indians', 'MI'), true);
    assert.equal(teamNameMatches('Mumbai Indians', 'CSK'), false);
    assert.equal(teamNameMatches('England', 'ENG'), true);
    assert.equal(teamNameMatches('India', 'IND'), true);
    assert.equal(teamNameMatches('India', 'ENG'), false);
  });

  test('3. ODI Format Scoring (50 Overs)', () => {
    const rawOdiMatch = {
      id: 'match_odi_ind_aus',
      sport: 'cricket',
      format: 'ODI',
      team1: { id: 'tm_ind', name: 'India', shortName: 'IND' },
      team2: { id: 'tm_aus', name: 'Australia', shortName: 'AUS' },
      liveDetails: {
        inningsId: 2,
        firstRuns: 320,
        firstWickets: 7,
        firstOvers: '50.0',
        firstTeamName: 'India',
        chaseRuns: 180,
        chaseWickets: 4,
        chaseOvers: '28.2',
        chaseTeamName: 'Australia',
      },
    };

    const normalized = normalizeMatch(rawOdiMatch);
    assert.equal(normalized.homeTeam.latestScore, '320/7');
    assert.equal(normalized.homeTeam.overs, '50.0');
    assert.equal(normalized.awayTeam.latestScore, '180/4');
    assert.equal(normalized.awayTeam.overs, '28.2');

    assert.equal(normalized.homeTeam.innings.length, 1);
    assert.equal(normalized.awayTeam.innings.length, 1);
  });

  test('4. T20 Format Scoring (1st Innings — Opponent Has Not Batted)', () => {
    const rawT20Match = {
      id: 'match_t20_csk_mi',
      sport: 'cricket',
      format: 'T20',
      team1: { id: 'tm_csk', name: 'Chennai Super Kings', shortName: 'CSK' },
      team2: { id: 'tm_mi', name: 'Mumbai Indians', shortName: 'MI' },
      liveDetails: {
        inningsId: 1,
        firstRuns: 185,
        firstWickets: 5,
        firstOvers: '20.0',
        firstTeamName: 'Chennai Super Kings',
      },
    };

    const normalized = normalizeMatch(rawT20Match);
    assert.equal(normalized.homeTeam.latestScore, '185/5');
    assert.equal(normalized.homeTeam.hasBatted, true);

    assert.equal(normalized.awayTeam.latestScore, '—');
    assert.equal(normalized.awayTeam.hasBatted, false);
    assert.equal(normalized.awayTeam.innings.length, 0);

    const resolved = resolveCricketTeamScores(rawT20Match, rawT20Match.liveDetails);
    assert.equal(resolved.team1.displayScore, '185/5');
    assert.equal(resolved.team2.displayScore, '');
  });

  test('5. T10 Format Scoring (10 Overs Completed)', () => {
    const rawT10Match = {
      id: 'match_t10_ad_del',
      sport: 'cricket',
      format: 'T10',
      team1: { id: 'tm_ad', name: 'Team Abu Dhabi', shortName: 'TAD' },
      team2: { id: 'tm_del', name: 'Delhi Bulls', shortName: 'DB' },
      liveDetails: {
        inningsId: 2,
        firstRuns: 110,
        firstWickets: 3,
        firstOvers: '10.0',
        firstTeamName: 'Team Abu Dhabi',
        chaseRuns: 112,
        chaseWickets: 2,
        chaseOvers: '8.4',
        chaseTeamName: 'Delhi Bulls',
      },
    };

    const normalized = normalizeMatch(rawT10Match);
    assert.equal(normalized.homeTeam.latestScore, '110/3');
    assert.equal(normalized.awayTeam.latestScore, '112/2');
  });

  test('6. 4-Innings Full Test Match', () => {
    const raw4InnMatch = {
      id: 'match_test_ind_eng_4inn',
      sport: 'cricket',
      format: 'TEST',
      team1: { id: 'tm_eng', name: 'England', shortName: 'ENG' },
      team2: { id: 'tm_ind', name: 'India', shortName: 'IND' },
      liveDetails: {
        matchFormat: 'TEST',
        inningsId: 4,
        testInnings: [
          { inningsId: 1, batTeamId: 'tm_eng', batTeam: 'England', runs: 350, wickets: 10, overs: '102.4' },
          { inningsId: 2, batTeamId: 'tm_ind', batTeam: 'India', runs: 300, wickets: 10, overs: '90.0' },
          { inningsId: 3, batTeamId: 'tm_eng', batTeam: 'England', runs: 220, wickets: 8, overs: '60.0', declared: true },
          { inningsId: 4, batTeamId: 'tm_ind', batTeam: 'India', runs: 195, wickets: 4, overs: '55.2' },
        ],
      },
    };

    const normalized = normalizeMatch(raw4InnMatch);

    assert.equal(normalized.homeTeam.innings.length, 2);
    assert.equal(normalized.homeTeam.innings[0].runs, 350);
    assert.equal(normalized.homeTeam.innings[1].runs, 220);
    assert.equal(normalized.homeTeam.innings[1].declared, true);
    assert.equal(normalized.homeTeam.latestScore, '220/8d');
    assert.equal(normalized.homeTeam.fullInningsSummary, '350 & 220/8d');

    assert.equal(normalized.awayTeam.innings.length, 2);
    assert.equal(normalized.awayTeam.innings[0].runs, 300);
    assert.equal(normalized.awayTeam.innings[1].runs, 195);
    assert.equal(normalized.awayTeam.latestScore, '195/4');
    assert.equal(normalized.awayTeam.fullInningsSummary, '300 & 195/4');

    assert.equal(normalized.currentInnings.batTeam, 'India');
    assert.equal(normalized.currentInnings.runs, 195);
    assert.equal(normalized.currentInnings.wickets, 4);
    assert.equal(normalized.currentInnings.isChase, true);
  });
});
