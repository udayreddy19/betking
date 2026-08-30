import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMatch,
  detectCanonicalFormat,
  CRICKET_FORMATS,
  validateInningsPartition,
  matchesTeamIdentifier,
} from '../../src/utils/cricketMatchNormalizer.js';
import {
  buildCanonicalMatchSnapshot,
  deriveSelectedInningsView,
  isPlaceholderPlayer,
} from '../../src/utils/cricketSnapshot.js';
import { resolveCricketTeamScores } from '../../src/utils/cricketScores.js';

test('ODDSYRA — CRICKET SCORES, SCORECARD & ROSTER PRODUCTION READINESS AUDIT', async (t) => {

  await t.test('1. Score Partition Invariant: Opposing teams NEVER share identical mirrored score objects', () => {
    // Simulate raw provider payload where only Team 1 has batted
    const rawPayload = {
      id: 'cb_test_001',
      sport: 'cricket',
      format: 'TEST',
      team1: { id: 'tm_sus', name: 'Sussex', shortName: 'SUS' },
      team2: { id: 'tm_som', name: 'Somerset', shortName: 'SOM' },
      isLive: true,
      matchState: 'in',
      liveDetails: {
        firstTeamName: 'Sussex',
        firstRuns: 300,
        firstWickets: 10,
        firstOvers: '85.2',
        // chase team has not batted yet
        chaseRuns: null,
        chaseWickets: null,
        chaseOvers: null,
      },
    };

    const normalized = normalizeMatch(rawPayload);

    // Verify Sussex has 1 innings of 300/10
    assert.equal(normalized.homeTeam.innings.length, 1);
    assert.equal(normalized.homeTeam.score, '300/10');
    assert.equal(normalized.homeTeam.hasBatted, true);

    // Verify Somerset has NOT batted and is NOT assigned Sussex score
    assert.equal(normalized.awayTeam.innings.length, 0);
    assert.equal(normalized.awayTeam.score, '—');
    assert.equal(normalized.awayTeam.hasBatted, false);

    // Verify mutual exclusivity
    assert.doesNotThrow(() => {
      validateInningsPartition(normalized.homeTeam.innings, normalized.awayTeam.innings);
    });
  });

  await t.test('2. Multi-Innings Test Match: Sussex vs Somerset 4-innings correctly mapped and partitioned', () => {
    const rawTestMatch = {
      id: 'test_eng_county_01',
      sport: 'cricket',
      matchFormat: 'TEST',
      team1: { id: '101', name: 'Sussex', shortName: 'SUS' },
      team2: { id: '102', name: 'Somerset', shortName: 'SOM' },
      isLive: true,
      matchState: 'in',
      scorecardInnings: [
        { inningsId: 1, batTeamId: '101', batTeamName: 'Sussex', runs: 300, wickets: 10, overs: '85.4' },
        { inningsId: 2, batTeamId: '102', batTeamName: 'Somerset', runs: 350, wickets: 10, overs: '92.1' },
        { inningsId: 3, batTeamId: '101', batTeamName: 'Sussex', runs: 250, wickets: 5, overs: '68.0', declared: true },
        { inningsId: 4, batTeamId: '102', batTeamName: 'Somerset', runs: 120, wickets: 3, overs: '35.2' },
      ],
    };

    const normalized = normalizeMatch(rawTestMatch);

    // Sussex innings: Innings 1 (300/10) & Innings 3 (250/5d)
    assert.equal(normalized.homeTeam.innings.length, 2);
    assert.equal(normalized.homeTeam.innings[0].runs, 300);
    assert.equal(normalized.homeTeam.innings[0].wickets, 10);
    assert.equal(normalized.homeTeam.innings[1].runs, 250);
    assert.equal(normalized.homeTeam.innings[1].wickets, 5);
    assert.equal(normalized.homeTeam.innings[1].declared, true);
    assert.equal(normalized.homeTeam.score, '250/5d'); // Latest compact score
    assert.equal(normalized.homeTeam.fullInningsSummary, '300 & 250/5d');

    // Somerset innings: Innings 2 (350/10) & Innings 4 (120/3)
    assert.equal(normalized.awayTeam.innings.length, 2);
    assert.equal(normalized.awayTeam.innings[0].runs, 350);
    assert.equal(normalized.awayTeam.innings[0].wickets, 10);
    assert.equal(normalized.awayTeam.innings[1].runs, 120);
    assert.equal(normalized.awayTeam.innings[1].wickets, 3);
    assert.equal(normalized.awayTeam.score, '120/3'); // Latest compact score
    assert.equal(normalized.awayTeam.fullInningsSummary, '350 & 120/3');

    // Active innings must be Innings 4 (Somerset 120/3)
    assert.equal(normalized.currentInnings.number, 4);
    assert.equal(normalized.currentInnings.batTeam, 'Somerset');
    assert.equal(normalized.currentInnings.runs, 120);
    assert.equal(normalized.currentInnings.wickets, 3);
    assert.equal(normalized.currentInnings.isChase, true);
  });

  await t.test('3. Match Format Detection & No Naive Overs (Never /50 OV for Test matches)', () => {
    const testMatch = { matchFormat: 'TEST', league: 'ICC World Test Championship' };
    const odiMatch = { matchFormat: 'ODI', league: 'ICC Cricket World Cup' };
    const t20Match = { matchFormat: 'T20', league: 'Indian Premier League' };
    const t10Match = { matchFormat: 'T10', league: 'Abu Dhabi T10' };

    assert.equal(detectCanonicalFormat(testMatch), CRICKET_FORMATS.TEST);
    assert.equal(detectCanonicalFormat(odiMatch), CRICKET_FORMATS.ODI);
    assert.equal(detectCanonicalFormat(t20Match), CRICKET_FORMATS.T20);
    assert.equal(detectCanonicalFormat(t10Match), CRICKET_FORMATS.T10);

    const normTest = normalizeMatch(testMatch);
    assert.equal(normTest.isTest, true);
    assert.equal(normTest.maxOvers, null); // Test matches have no fixed overs limit

    const normT20 = normalizeMatch(t20Match);
    assert.equal(normT20.isTest, false);
    assert.equal(normT20.maxOvers, 20);
  });

  await t.test('4. Score Monotonicity & Stale Response Rejection', () => {
    const validCurrent = {
      id: 'm_123',
      matchId: 'm_123',
      providerUpdatedAt: 1700000100000,
      homeTeam: { id: 't1', name: 'India', innings: [{ runs: 180, wickets: 4, overs: '19.2' }] },
      awayTeam: { id: 't2', name: 'Australia', innings: [] },
    };

    // Delayed stale response with older timestamp and lower score
    const staleOlderResponse = {
      id: 'm_123',
      providerUpdatedAt: 1700000050000, // 50 seconds older
      liveDetails: {
        runs: 150,
        wickets: 3,
        overs: '16.4',
      },
    };

    const result = normalizeMatch(staleOlderResponse, validCurrent);
    // Must reject stale response and keep current valid state
    assert.equal(result.homeTeam.innings[0].runs, 180);
    assert.equal(result.homeTeam.innings[0].overs, '19.2');
  });

  await t.test('5. Player Retention: Live batters and bowler are NOT replaced with null or placeholders', () => {
    const richScorecard = {
      id: 'cb_players_01',
      sport: 'cricket',
      team1: { name: 'India' },
      team2: { name: 'England' },
      scorecardInnings: [
        {
          inningsId: 1,
          batTeamName: 'India',
          runs: 210,
          wickets: 2,
          overs: '35.0',
          batters: [
            { id: 'p_1', name: 'Virat Kohli', runs: 85, balls: 90, fours: 9, sixes: 2, notOut: true },
            { id: 'p_2', name: 'KL Rahul', runs: 45, balls: 50, fours: 4, sixes: 1, notOut: true },
          ],
          bowlers: [
            { id: 'b_1', name: 'James Anderson', overs: '12.0', maidens: 2, runs: 40, wickets: 1 },
          ],
          extras: { total: 10, byes: 2, legByes: 1, wides: 5, noBalls: 2 },
        },
      ],
    };

    const snapshot = buildCanonicalMatchSnapshot(richScorecard);
    const inn1 = snapshot.innings[0];

    assert.equal(inn1.batters.length, 2);
    assert.equal(inn1.batters[0].name, 'Virat Kohli');
    assert.equal(inn1.batters[0].runs, 85);
    assert.equal(inn1.batters[0].fours, 9);
    assert.equal(inn1.batters[0].sixes, 2);
    assert.equal(inn1.bowlers[0].name, 'James Anderson');
    assert.equal(inn1.extras.total, 10);
    assert.equal(inn1.extras.wides, 5);

    // Verify placeholder filtering
    assert.equal(isPlaceholderPlayer('Batter 1'), true);
    assert.equal(isPlaceholderPlayer('Bowler'), true);
    assert.equal(isPlaceholderPlayer('Virat Kohli'), false);
  });

  await t.test('6. Extras, Fours & Sixes Calculation without cross-innings contamination', () => {
    const rawInningsData = {
      id: 'm_extras_test',
      scorecardInnings: [
        {
          inningsId: 1,
          batTeamName: 'Team A',
          runs: 150,
          wickets: 4,
          overs: '20.0',
          batters: [
            { name: 'Player A1', runs: 60, fours: 6, sixes: 3 },
            { name: 'Player A2', runs: 70, fours: 8, sixes: 2 },
          ],
          extras: { total: 20, wides: 12, noBalls: 4, byes: 4, legByes: 0 },
        },
        {
          inningsId: 2,
          batTeamName: 'Team B',
          runs: 140,
          wickets: 3,
          overs: '18.4',
          batters: [
            { name: 'Player B1', runs: 80, fours: 10, sixes: 4 },
          ],
          extras: { total: 8, wides: 6, noBalls: 2, byes: 0, legByes: 0 },
        },
      ],
    };

    const snapshot = buildCanonicalMatchSnapshot(rawInningsData);
    assert.equal(snapshot.innings[0].fours, 14); // 6 + 8
    assert.equal(snapshot.innings[0].sixes, 5);  // 3 + 2
    assert.equal(snapshot.innings[0].extras.total, 20);

    assert.equal(snapshot.innings[1].fours, 10);
    assert.equal(snapshot.innings[1].sixes, 4);
    assert.equal(snapshot.innings[1].extras.total, 8);
  });

  await t.test('7. Single Source of Truth: resolveCricketTeamScores mirrors canonical normalizer output', () => {
    const match = {
      id: 'm_unified_01',
      sport: 'cricket',
      team1: { id: 't1', name: 'England', shortName: 'ENG' },
      team2: { id: 't2', name: 'India', shortName: 'IND' },
      isLive: true,
      liveDetails: {
        firstTeamName: 'England',
        firstRuns: 185,
        firstWickets: 6,
        firstOvers: '20.0',
        chaseTeamName: 'India',
        chaseRuns: 186,
        chaseWickets: 4,
        chaseOvers: '18.2',
        inningsId: 2,
      },
    };

    const scores = resolveCricketTeamScores(match, match.liveDetails);

    assert.equal(scores.team1.runs, 185);
    assert.equal(scores.team1.wickets, 6);
    assert.equal(scores.team1.displayScore, '185/6');
    assert.equal(scores.team1.hasBatted, true);

    assert.equal(scores.team2.runs, 186);
    assert.equal(scores.team2.wickets, 4);
    assert.equal(scores.team2.displayScore, '186/4');
    assert.equal(scores.team2.hasBatted, true);

    assert.equal(scores.currentInnings.batTeam, 'India');
    assert.equal(scores.currentInnings.runs, 186);
    assert.equal(scores.currentInnings.wickets, 4);
  });
});
