/**
 * Cricket Format, Banner & Score Statistics Comprehensive Test Suite (27 Test Cases)
 */
import assert from 'node:assert';
import {
  buildCanonicalMatchSnapshot,
  deriveSelectedInningsView,
  detectCricketMatchFormat,
  getCricketFormatBanner,
} from '../lib/cricketSnapshot.mjs';

console.log('🧪 RUNNING CRICKET FORMAT, BANNER & SCORE STATISTICS TEST SUITE (27 TESTS)...\n');

let passedTests = 0;
function test(name, fn) {
  try {
    fn();
    passedTests++;
    console.log(`✅ Test ${passedTests}: ${name} PASS`);
  } catch (err) {
    console.error(`❌ Test FAILED: ${name}`);
    throw err;
  }
}

// ==========================================
// FORMAT TESTS (1 - 5)
// ==========================================

test('Test match displays TEST MATCH banner', () => {
  const match = {
    id: 'cb_test_1',
    format: 'TEST',
    team1: { name: 'Australia' },
    team2: { name: 'England' },
  };
  const format = detectCricketMatchFormat(match);
  assert.strictEqual(format, 'TEST');
  const banner = getCricketFormatBanner(format);
  assert.strictEqual(banner, 'TEST MATCH');

  const snapshot = buildCanonicalMatchSnapshot(match);
  assert.strictEqual(snapshot.match.matchFormat, 'TEST');
  assert.strictEqual(snapshot.match.formatBanner, 'TEST MATCH');
});

test('ODI displays ODI', () => {
  const match = {
    id: 'cb_odi_1',
    matchType: 'ODI',
    league: 'ICC Men\'s Cricket World Cup',
    team1: { name: 'India' },
    team2: { name: 'South Africa' },
  };
  const format = detectCricketMatchFormat(match);
  assert.strictEqual(format, 'ODI');
  const banner = getCricketFormatBanner(format);
  assert.strictEqual(banner, 'ODI');
});

test('T20 displays T20', () => {
  const match = {
    id: 'cb_t20_1',
    league: 'Indian Premier League',
    matchFormat: 'T20',
    team1: { name: 'Chennai Super Kings' },
    team2: { name: 'Mumbai Indians' },
  };
  const format = detectCricketMatchFormat(match);
  assert.strictEqual(format, 'T20');
  const banner = getCricketFormatBanner(format);
  assert.strictEqual(banner, 'T20');
});

test('T10 displays T10', () => {
  const match = {
    id: 'cb_t10_1',
    league: 'European Cricket Series T10',
    team1: { name: 'Rome CC' },
    team2: { name: 'Milan Kings' },
  };
  const format = detectCricketMatchFormat(match);
  assert.strictEqual(format, 'T10');
  const banner = getCricketFormatBanner(format);
  assert.strictEqual(banner, 'T10');
});

test('Unknown format has safe fallback', () => {
  const match = {
    id: 'cb_unknown_1',
    team1: { name: 'Local Club A' },
    team2: { name: 'Local Club B' },
  };
  const format = detectCricketMatchFormat(match);
  assert.ok(format);
  const banner = getCricketFormatBanner(format);
  assert.ok(banner);
});

// ==========================================
// LIVE STATUS TESTS (6 - 8)
// ==========================================

test('Test match can show TEST MATCH + LIVE', () => {
  const match = {
    id: 'cb_test_live',
    format: 'TEST',
    isLive: true,
    matchState: 'in',
    team1: { name: 'Warwickshire' },
    team2: { name: 'Nottinghamshire' },
    liveDetails: { runs: 299, wickets: 7, overs: '82.0' },
  };
  const snapshot = buildCanonicalMatchSnapshot(match);
  assert.strictEqual(snapshot.match.formatBanner, 'TEST MATCH');
  assert.strictEqual(snapshot.match.isLive, true);
  assert.strictEqual(snapshot.match.statusChip, 'LIVE');
});

test('Completed match shows COMPLETED', () => {
  const match = {
    id: 'cb_completed_1',
    matchFormat: 'T20',
    status: 'COMPLETED',
    isLive: false,
    matchState: 'post',
    team1: { name: 'India' },
    team2: { name: 'Pakistan' },
  };
  const snapshot = buildCanonicalMatchSnapshot(match);
  assert.strictEqual(snapshot.match.isLive, false);
  assert.strictEqual(snapshot.match.statusChip, 'COMPLETED');
});

test('Upcoming match shows UPCOMING', () => {
  const match = {
    id: 'cb_upcoming_1',
    matchFormat: 'ODI',
    status: 'SCHEDULED',
    isLive: false,
    matchState: 'pre',
    time: 'Tomorrow 14:00',
    team1: { name: 'New Zealand' },
    team2: { name: 'Sri Lanka' },
  };
  const snapshot = buildCanonicalMatchSnapshot(match);
  assert.strictEqual(snapshot.match.isLive, false);
  assert.strictEqual(snapshot.match.statusChip, 'UPCOMING');
});

// ==========================================
// TEST INNINGS TESTS (9 - 10)
// ==========================================

test('Test match supports 4 innings', () => {
  const match = {
    id: 'cb_test_4inns',
    format: 'TEST',
    isLive: true,
    team1: { name: 'Warwickshire' },
    team2: { name: 'Nottinghamshire' },
    scorecardInnings: [
      { inningsId: 1, batTeamName: 'Nottinghamshire', runs: 299, wickets: 10, overs: '82.0', batters: [{ name: 'Joe Clarke', runs: 100, fours: 12, sixes: 2 }], extras: 15 },
      { inningsId: 2, batTeamName: 'Warwickshire', runs: 250, wickets: 10, overs: '75.0', batters: [{ name: 'Alex Davies', runs: 80, fours: 10, sixes: 1 }], extras: 10 },
      { inningsId: 3, batTeamName: 'Nottinghamshire', runs: 180, wickets: 4, overs: '50.0', batters: [{ name: 'Haseeb Hameed', runs: 70, fours: 8, sixes: 0 }], extras: 12 },
      { inningsId: 4, batTeamName: 'Warwickshire', runs: 0, wickets: 0, overs: '0.0', batters: [], extras: 0 },
    ],
  };
  const snapshot = buildCanonicalMatchSnapshot(match);
  assert.strictEqual(snapshot.innings.length, 4);
  assert.strictEqual(snapshot.innings[0].inningsLabel, 'Nottinghamshire — 1st INNS');
  assert.strictEqual(snapshot.innings[1].inningsLabel, 'Warwickshire — 1st INNS');
  assert.strictEqual(snapshot.innings[2].inningsLabel, 'Nottinghamshire — 2nd INNS');
  assert.strictEqual(snapshot.innings[3].inningsLabel, 'Warwickshire — 2nd INNS');
});

test('Switching Test innings updates all statistics atomically', () => {
  const match = {
    id: 'cb_test_4inns',
    format: 'TEST',
    isLive: true,
    team1: { name: 'Warwickshire' },
    team2: { name: 'Nottinghamshire' },
    scorecardInnings: [
      { inningsId: 1, batTeamName: 'Nottinghamshire', runs: 299, wickets: 10, overs: '82.0', batters: [{ name: 'Joe Clarke', runs: 100, fours: 12, sixes: 2 }], extras: 15 },
      { inningsId: 2, batTeamName: 'Warwickshire', runs: 250, wickets: 10, overs: '75.0', batters: [{ name: 'Alex Davies', runs: 80, fours: 10, sixes: 1 }], extras: 10 },
      { inningsId: 3, batTeamName: 'Nottinghamshire', runs: 180, wickets: 4, overs: '50.0', batters: [{ name: 'Haseeb Hameed', runs: 70, fours: 8, sixes: 0 }], extras: 12 },
    ],
  };
  const snapshot = buildCanonicalMatchSnapshot(match);

  // Select 1st innings
  const view1 = deriveSelectedInningsView(snapshot, 1);
  assert.strictEqual(view1.battingTeamName, 'Nottinghamshire');
  assert.strictEqual(view1.score, 299);
  assert.strictEqual(view1.wickets, 10);
  assert.strictEqual(view1.overs, '82.0');
  assert.strictEqual(view1.fours, 12);
  assert.strictEqual(view1.sixes, 2);
  assert.strictEqual(view1.extras.total, 15);
  assert.strictEqual(view1.batters[0].name, 'Joe Clarke');

  // Select 2nd innings (Warwickshire 1st)
  const view2 = deriveSelectedInningsView(snapshot, 2);
  assert.strictEqual(view2.battingTeamName, 'Warwickshire');
  assert.strictEqual(view2.score, 250);
  assert.strictEqual(view2.wickets, 10);
  assert.strictEqual(view2.overs, '75.0');
  assert.strictEqual(view2.fours, 10);
  assert.strictEqual(view2.sixes, 1);
  assert.strictEqual(view2.extras.total, 10);
  assert.strictEqual(view2.batters[0].name, 'Alex Davies');

  // Select 3rd innings (Nottinghamshire 2nd)
  const view3 = deriveSelectedInningsView(snapshot, 3);
  assert.strictEqual(view3.battingTeamName, 'Nottinghamshire');
  assert.strictEqual(view3.score, 180);
  assert.strictEqual(view3.wickets, 4);
  assert.strictEqual(view3.overs, '50.0');
  assert.strictEqual(view3.fours, 8);
  assert.strictEqual(view3.sixes, 0);
  assert.strictEqual(view3.extras.total, 12);
  assert.strictEqual(view3.batters[0].name, 'Haseeb Hameed');
});

// ==========================================
// SCORE TESTS (11 - 14)
// ==========================================

test('Valid score 0/0 displays correctly', () => {
  const match = {
    id: 'cb_score_zero',
    matchFormat: 'T20',
    isLive: true,
    team1: { name: 'Team A' },
    team2: { name: 'Team B' },
    liveDetails: {
      runs: 0,
      wickets: 0,
      overs: '0.0',
      firstRuns: 0,
      firstWickets: 0,
      firstOvers: '0.0',
      firstTeamName: 'Team A',
    },
  };
  const snapshot = buildCanonicalMatchSnapshot(match);
  const view = deriveSelectedInningsView(snapshot, 1);
  assert.strictEqual(view.score, 0);
  assert.strictEqual(view.wickets, 0);
  assert.strictEqual(view.overs, '0.0');
  assert.strictEqual(snapshot.headerScores.team1HasBatted, true);
  assert.strictEqual(snapshot.headerScores.team1ScoreText, '0/0');
});

test('Missing score displays unavailable state', () => {
  const match = {
    id: 'cb_score_unbatted',
    matchFormat: 'T20',
    isLive: true,
    team1: { name: 'Team A' },
    team2: { name: 'Team B' },
    scorecardInnings: [
      { inningsId: 1, batTeamName: 'Team A', runs: 150, wickets: 4, overs: '20.0', batters: [] },
    ],
  };
  const snapshot = buildCanonicalMatchSnapshot(match);
  assert.strictEqual(snapshot.headerScores.team1ScoreText, '150/4 (20.0)');
  assert.strictEqual(snapshot.headerScores.team2ScoreText, 'Yet to bat');
  assert.strictEqual(snapshot.headerScores.team2HasBatted, false);
});

test('Live score displays correctly', () => {
  const match = {
    id: 'cb_score_live',
    matchFormat: 'T20',
    isLive: true,
    team1: { name: 'India' },
    team2: { name: 'Australia' },
    liveDetails: { runs: 185, wickets: 3, overs: '17.4', firstRuns: 185, firstWickets: 3, firstOvers: '17.4', firstTeamName: 'India' },
  };
  const snapshot = buildCanonicalMatchSnapshot(match);
  const view = deriveSelectedInningsView(snapshot, 1);
  assert.strictEqual(view.score, 185);
  assert.strictEqual(view.wickets, 3);
  assert.strictEqual(view.overs, '17.4');
});

test('Completed score displays correctly', () => {
  const match = {
    id: 'cb_score_completed',
    matchFormat: 'ODI',
    status: 'COMPLETED',
    isLive: false,
    team1: { name: 'England' },
    team2: { name: 'Pakistan' },
    scorecardInnings: [
      { inningsId: 1, batTeamName: 'England', runs: 310, wickets: 7, overs: '50.0', batters: [] },
      { inningsId: 2, batTeamName: 'Pakistan', runs: 285, wickets: 10, overs: '47.2', batters: [] },
    ],
  };
  const snapshot = buildCanonicalMatchSnapshot(match);
  assert.strictEqual(snapshot.headerScores.team1ScoreText, '310/7 (50.0)');
  assert.strictEqual(snapshot.headerScores.team2ScoreText, '285/10 (47.2)');
});

// ==========================================
// STATISTICS TESTS (15 - 21)
// ==========================================

test('Extras display correctly', () => {
  const match = {
    id: 'cb_stats_extras',
    matchFormat: 'T20',
    team1: { name: 'Team A' },
    team2: { name: 'Team B' },
    scorecardInnings: [
      {
        inningsId: 1,
        batTeamName: 'Team A',
        runs: 160,
        wickets: 4,
        overs: '20.0',
        extrasData: { total: 14, byes: 2, legByes: 4, wides: 6, noBalls: 2, penaltyRuns: 0 },
        batters: [],
      },
    ],
  };
  const snapshot = buildCanonicalMatchSnapshot(match);
  const view = deriveSelectedInningsView(snapshot, 1);
  assert.strictEqual(view.extras.total, 14);
  assert.strictEqual(view.extras.byes, 2);
  assert.strictEqual(view.extras.legByes, 4);
  assert.strictEqual(view.extras.wides, 6);
  assert.strictEqual(view.extras.noBalls, 2);
});

test('Fours display correctly', () => {
  const match = {
    id: 'cb_stats_fours',
    matchFormat: 'T20',
    team1: { name: 'Team A' },
    team2: { name: 'Team B' },
    scorecardInnings: [
      {
        inningsId: 1,
        batTeamName: 'Team A',
        runs: 180,
        batters: [
          { name: 'Rohit Sharma', runs: 60, fours: 6, sixes: 2 },
          { name: 'Virat Kohli', runs: 50, fours: 4, sixes: 3 },
          { name: 'KL Rahul', runs: 40, fours: 5, sixes: 1 },
        ],
      },
    ],
  };
  const snapshot = buildCanonicalMatchSnapshot(match);
  const view = deriveSelectedInningsView(snapshot, 1);
  assert.strictEqual(view.fours, 15);
});

test('Sixes display correctly', () => {
  const match = {
    id: 'cb_stats_sixes',
    matchFormat: 'T20',
    team1: { name: 'Team A' },
    team2: { name: 'Team B' },
    scorecardInnings: [
      {
        inningsId: 1,
        batTeamName: 'Team A',
        runs: 180,
        batters: [
          { name: 'Rohit Sharma', runs: 60, fours: 6, sixes: 4 },
          { name: 'Virat Kohli', runs: 50, fours: 4, sixes: 3 },
          { name: 'KL Rahul', runs: 40, fours: 5, sixes: 2 },
        ],
      },
    ],
  };
  const snapshot = buildCanonicalMatchSnapshot(match);
  const view = deriveSelectedInningsView(snapshot, 1);
  assert.strictEqual(view.sixes, 9);
});

test('Explicit zero extras displays 0', () => {
  const match = {
    id: 'cb_stats_zero_extras',
    matchFormat: 'T20',
    team1: { name: 'Team A' },
    team2: { name: 'Team B' },
    scorecardInnings: [
      { inningsId: 1, batTeamName: 'Team A', runs: 100, extras: 0, batters: [] },
    ],
  };
  const snapshot = buildCanonicalMatchSnapshot(match);
  const view = deriveSelectedInningsView(snapshot, 1);
  assert.strictEqual(view.extras.total, 0);
});

test('Explicit zero fours displays 0', () => {
  const match = {
    id: 'cb_stats_zero_fours',
    matchFormat: 'T20',
    team1: { name: 'Team A' },
    team2: { name: 'Team B' },
    scorecardInnings: [
      {
        inningsId: 1,
        batTeamName: 'Team A',
        runs: 10,
        batters: [
          { name: 'Rohit Sharma', runs: 5, fours: 0, sixes: 0 },
          { name: 'Virat Kohli', runs: 5, fours: 0, sixes: 0 },
        ],
      },
    ],
  };
  const snapshot = buildCanonicalMatchSnapshot(match);
  const view = deriveSelectedInningsView(snapshot, 1);
  assert.strictEqual(view.fours, 0);
});

test('Explicit zero sixes displays 0', () => {
  const match = {
    id: 'cb_stats_zero_sixes',
    matchFormat: 'T20',
    team1: { name: 'Team A' },
    team2: { name: 'Team B' },
    scorecardInnings: [
      {
        inningsId: 1,
        batTeamName: 'Team A',
        runs: 10,
        batters: [
          { name: 'Rohit Sharma', runs: 5, fours: 1, sixes: 0 },
          { name: 'Virat Kohli', runs: 5, fours: 1, sixes: 0 },
        ],
      },
    ],
  };
  const snapshot = buildCanonicalMatchSnapshot(match);
  const view = deriveSelectedInningsView(snapshot, 1);
  assert.strictEqual(view.sixes, 0);
});

test('Missing values do not incorrectly display 0', () => {
  const match = {
    id: 'cb_stats_missing',
    matchFormat: 'T20',
    team1: { name: 'Team A' },
    team2: { name: 'Team B' },
    liveDetails: { runs: 120, wickets: 2, overs: '12.0' },
  };
  const snapshot = buildCanonicalMatchSnapshot(match);
  const view = deriveSelectedInningsView(snapshot, 1);
  assert.strictEqual(view.fours, null);
  assert.strictEqual(view.sixes, null);
  assert.strictEqual(view.extras.total, null);
});

// ==========================================
// CONSISTENCY TESTS (22 - 27)
// ==========================================

test('Statistics belong to selected innings', () => {
  const match = {
    id: 'cb_inns_stats_belong',
    matchFormat: 'ODI',
    team1: { name: 'India' },
    team2: { name: 'Australia' },
    scorecardInnings: [
      { inningsId: 1, batTeamName: 'India', runs: 300, extras: 15, batters: [{ name: 'Rohit Sharma', runs: 120, fours: 12, sixes: 5 }] },
      { inningsId: 2, batTeamName: 'Australia', runs: 280, extras: 10, batters: [{ name: 'David Warner', runs: 90, fours: 8, sixes: 2 }] },
    ],
  };
  const snapshot = buildCanonicalMatchSnapshot(match);
  const v1 = deriveSelectedInningsView(snapshot, 1);
  const v2 = deriveSelectedInningsView(snapshot, 2);

  assert.strictEqual(v1.fours, 12);
  assert.strictEqual(v1.sixes, 5);
  assert.strictEqual(v1.extras.total, 15);

  assert.strictEqual(v2.fours, 8);
  assert.strictEqual(v2.sixes, 2);
  assert.strictEqual(v2.extras.total, 10);
});

test('No cross-innings data', () => {
  const match = {
    id: 'cb_no_cross_inns',
    matchFormat: 'T20',
    team1: { name: 'Team 1' },
    team2: { name: 'Team 2' },
    scorecardInnings: [
      { inningsId: 1, batTeamName: 'Team 1', runs: 160, batters: [{ name: 'T1 Batter', runs: 50, fours: 5, sixes: 2 }] },
      { inningsId: 2, batTeamName: 'Team 2', runs: 120, batters: [{ name: 'T2 Batter', runs: 30, fours: 3, sixes: 1 }] },
    ],
  };
  const snapshot = buildCanonicalMatchSnapshot(match);
  const v1 = deriveSelectedInningsView(snapshot, 1);
  assert.ok(!v1.batters.some((b) => b.name === 'T2 Batter'));
  const v2 = deriveSelectedInningsView(snapshot, 2);
  assert.ok(!v2.batters.some((b) => b.name === 'T1 Batter'));
});

test('No stale snapshot data', () => {
  const snap1 = buildCanonicalMatchSnapshot({
    id: 'cb_match_time',
    fetchedAt: '2026-08-29T10:00:00Z',
    team1: { name: 'Team 1' },
    team2: { name: 'Team 2' },
    liveDetails: { runs: 100, wickets: 2, overs: '10.0' },
  });
  const snap2 = buildCanonicalMatchSnapshot({
    id: 'cb_match_time',
    fetchedAt: '2026-08-29T10:05:00Z',
    team1: { name: 'Team 1' },
    team2: { name: 'Team 2' },
    liveDetails: { runs: 130, wickets: 2, overs: '13.0' },
  });
  assert.notStrictEqual(snap1.snapshotId, snap2.snapshotId);
  assert.strictEqual(snap1.innings[0].score, 100);
  assert.strictEqual(snap2.innings[0].score, 130);
});

test('Refresh remains consistent', () => {
  const raw = {
    id: 'cb_match_refresh',
    format: 'TEST',
    team1: { name: 'Warwickshire' },
    team2: { name: 'Nottinghamshire' },
    scorecardInnings: [
      { inningsId: 1, batTeamName: 'Nottinghamshire', runs: 299, wickets: 7, overs: '82.0', batters: [{ name: 'Joe Clarke', runs: 38 }] },
    ],
  };
  const snapA = buildCanonicalMatchSnapshot(raw);
  const snapB = buildCanonicalMatchSnapshot(raw);
  const vA = deriveSelectedInningsView(snapA, 1);
  const vB = deriveSelectedInningsView(snapB, 1);
  assert.strictEqual(vA.score, vB.score);
  assert.strictEqual(vA.batters[0].name, vB.batters[0].name);
});

test('Redis expiry remains consistent', () => {
  const snap = buildCanonicalMatchSnapshot({
    id: 'cb_redis_exp',
    format: 'T20',
    team1: { name: 'Team A' },
    team2: { name: 'Team B' },
    liveDetails: { runs: 150, wickets: 5, overs: '18.0' },
  });
  const serialized = JSON.stringify(snap);
  const deserialized = JSON.parse(serialized);
  const view = deriveSelectedInningsView(deserialized, 1);
  assert.strictEqual(view.score, 150);
  assert.strictEqual(view.formatBanner, 'T20');
});

test('20 repeated loads remain consistent', () => {
  const raw = {
    id: 'cb_20_loads',
    format: 'TEST',
    isLive: true,
    team1: { name: 'Warwickshire' },
    team2: { name: 'Nottinghamshire' },
    scorecardInnings: [
      {
        inningsId: 1,
        batTeamName: 'Nottinghamshire',
        runs: 299,
        wickets: 7,
        overs: '82.0',
        extras: 12,
        batters: [
          { name: 'Joe Clarke', runs: 38, balls: 63, fours: 4, sixes: 0 },
          { name: 'Fraser Sheat', runs: 28, balls: 46, fours: 3, sixes: 1 },
        ],
        bowlers: [
          { name: 'Oliver Hannon-Dalby', overs: '18.0', wickets: 2, runs: 65 },
        ],
      },
    ],
  };

  for (let i = 0; i < 20; i++) {
    const snap = buildCanonicalMatchSnapshot(raw);
    const view = deriveSelectedInningsView(snap, 1);
    assert.strictEqual(view.matchFormat, 'TEST');
    assert.strictEqual(view.formatBanner, 'TEST MATCH');
    assert.strictEqual(view.battingTeamName, 'Nottinghamshire');
    assert.strictEqual(view.score, 299);
    assert.strictEqual(view.wickets, 7);
    assert.strictEqual(view.overs, '82.0');
    assert.strictEqual(view.fours, 7);
    assert.strictEqual(view.sixes, 1);
    assert.strictEqual(view.extras.total, 12);
    assert.strictEqual(view.currentBowler.name, 'Oliver Hannon-Dalby');
  }
});

console.log('\n🎉 ALL 27 CRICKET FORMAT, BANNER & SCORE STATISTICS TESTS PASSED WITH ZERO FAILURES!\n');
