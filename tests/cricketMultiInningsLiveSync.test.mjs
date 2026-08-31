import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCanonicalMatchSnapshot, deriveSelectedInningsView } from '../src/utils/cricketSnapshot.js';
import { enrichLivePlayersFromScorecard } from '../src/utils/scorecardLivePlayers.js';
import { normalizeMatch } from '../src/utils/cricketMatchNormalizer.js';

test('Multi-Innings Test Match Live Score & Scorecard Synchronization (BAN-A vs SA-A)', () => {
  const match = {
    id: 'cb_match_test_saa_baa_101',
    sport: 'cricket',
    league: 'Bangladesh A tour of South Africa, 2026',
    format: 'TEST',
    matchFormat: 'TEST',
    isLive: true,
    matchState: 'in',
    team1: {
      id: 'tm_saa',
      name: 'South Africa A',
      shortName: 'SAA',
      runs: 78,
      wickets: 2,
      overs: '22.0',
    },
    team2: {
      id: 'tm_baa',
      name: 'Bangladesh A',
      shortName: 'BA',
      runs: 512,
      wickets: 10,
      overs: '115.1',
    },
    liveDetails: {
      inningsId: 2,
      runs: 78,
      wickets: 2,
      overs: '22.0',
      batter1: { name: 'Tony de Zorzi', runs: 35, balls: 54, fours: 4, sixes: 0 },
      batter2: { name: 'Migael Pretorius', runs: 28, balls: 41, fours: 3, sixes: 1 },
      bowler: { name: 'Hasan Murad', overs: '6.0', maidens: 1, runs: 18, wickets: 1 },
    },
    // Scorecard API only has completed 1st innings of Bangladesh A
    scorecardInnings: [
      {
        inningsId: 1,
        batTeamId: 'tm_baa',
        batTeamName: 'Bangladesh A',
        batTeamShortName: 'BA',
        scoreDetails: { runs: 512, wickets: 10, overs: '115.1' },
        batters: [
          { name: 'Anamul Haque', runs: 120, balls: 190, dismissal: 'c de Zorzi b Subrayen', notOut: false },
          { name: 'Mohammad I', runs: 31, balls: 71, fours: 4, sixes: 0, dismissal: 'not out', notOut: true },
        ],
        bowlers: [
          { name: 'Migael Pretorius', overs: '24.1', runs: 95, wickets: 3 },
        ],
      },
    ],
  };

  // 1. Check player enrichment does not corrupt SA-A live players with BA-A players
  const enrichedLd = enrichLivePlayersFromScorecard(match.liveDetails, match.scorecardInnings);
  assert.equal(enrichedLd.batter1.name, 'Tony de Zorzi', 'Live striker must not be overwritten with previous innings tailender');
  assert.equal(enrichedLd.batter2.name, 'Migael Pretorius', 'Live non-striker must be preserved');
  assert.equal(enrichedLd.bowler.name, 'Hasan Murad', 'Live bowler must be preserved');

  // 2. Check canonical match snapshot assembly
  const snapshot = buildCanonicalMatchSnapshot(match);
  assert.ok(snapshot, 'Snapshot must be generated');
  assert.equal(snapshot.innings.length, 2, 'Snapshot must contain both completed and active innings');

  // 3. Verify header scores
  assert.equal(snapshot.headerScores.team1HasBatted, true, 'South Africa A must be marked as having batted');
  assert.equal(snapshot.headerScores.team2HasBatted, true, 'Bangladesh A must be marked as having batted');
  assert.equal(snapshot.headerScores.team1ScoreText, '78/2 (22.0)');
  assert.equal(snapshot.headerScores.team2ScoreText, '512/10 (115.1)');

  // 4. Verify current innings selection defaults to active 2nd innings
  const selectedView = deriveSelectedInningsView(snapshot);
  assert.ok(selectedView, 'Selected view must exist');
  assert.equal(selectedView.battingTeamName, 'South Africa A', 'Default innings must be the active South Africa A innings');
  assert.equal(selectedView.score, 78);
  assert.equal(selectedView.wickets, 2);
  assert.equal(selectedView.overs, '22.0');
  assert.equal(selectedView.striker.name, 'Tony de Zorzi');
  assert.equal(selectedView.nonStriker.name, 'Migael Pretorius');
  assert.equal(selectedView.currentBowler.name, 'Hasan Murad');

  // 5. Verify normalizer produces consistent home and away innings
  const normalized = normalizeMatch(match);
  assert.equal(normalized.homeTeam.score, '78/2');
  assert.equal(normalized.awayTeam.score, '512/10');
  assert.equal(normalized.currentInnings.batTeam, 'South Africa A');
  assert.equal(normalized.currentInnings.runs, 78);
  assert.equal(normalized.currentInnings.wickets, 2);
  assert.equal(normalized.currentInnings.overs, '22.0');

  console.log('✅ ALL TEST MATCH LIVE SYNC ASSERTIONS PASSED!');
});
