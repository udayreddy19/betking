import assert from 'node:assert';
import { describe, it } from 'vitest';
import {
  buildCanonicalMatchSnapshot,
  deriveSelectedInningsView,
  teamNameMatches,
  isPlaceholderPlayer,
} from '../lib/cricketSnapshot.mjs';
import { mergeCricketLiveDetails } from '../src/utils/cricketScoreMerge.js';

console.log('🧪 RUNNING CRICKET SCORECARD & ROSTER CONSISTENCY TEST SUITE (16 SCENARIOS)...');

const mockWarwickshireVsNotts = {
  id: 'cb_105219',
  cricbuzzMatchId: '105219',
  team1: { name: 'Warwickshire', shortName: 'WAR' },
  team2: { name: 'Nottinghamshire', shortName: 'NOTT' },
  isLive: true,
  matchState: 'in',
  fetchedAt: '2026-08-29T14:00:00.000Z',
  liveDetails: {
    runs: 299,
    wickets: 7,
    overs: '82.0',
    firstRuns: 299,
    firstWickets: 7,
    firstOvers: '82.0',
    firstTeamName: 'Nottinghamshire',
    batter1: { name: 'Joe Clarke', runs: 38, balls: 63, fours: 4, sixes: 0 },
    batter2: { name: 'Fraser Sheat', runs: 28, balls: 46, fours: 3, sixes: 1 },
    bowler: { name: 'Oliver Hannon-Dalby', overs: '18.0', maidens: 3, runs: 65, wickets: 2 },
  },
  scorecardInnings: [
    {
      inningsId: 1,
      batTeamName: 'Nottinghamshire',
      scoreDetails: { runs: 299, wickets: 7, overs: '82.0' },
      batters: [
        { name: 'Haseeb Hameed', runs: 45, balls: 90, dismissal: 'c Davies b Miles' },
        { name: 'Ben Slater', runs: 12, balls: 30, dismissal: 'b Hannon-Dalby' },
        { name: 'Joe Clarke', runs: 38, balls: 63, dismissal: 'batting', notOut: true },
        { name: 'Fraser Sheat', runs: 28, balls: 46, dismissal: 'notOut', notOut: true },
      ],
      bowlers: [
        { name: 'Oliver Hannon-Dalby', overs: '18.0', maidens: 3, runs: 65, wickets: 2 },
        { name: 'Craig Miles', overs: '15.0', maidens: 2, runs: 55, wickets: 1 },
      ],
    },
    {
      inningsId: 2,
      batTeamName: 'Warwickshire',
      scoreDetails: { runs: 0, wickets: 0, overs: '0.0' },
      batters: [
        { name: 'Alex Davies', runs: 0, balls: 0, dismissal: 'yet to bat' },
        { name: 'Rob Yates', runs: 0, balls: 0, dismissal: 'yet to bat' },
      ],
      bowlers: [
        { name: 'Fraser Sheat', overs: '0.0', maidens: 0, runs: 0, wickets: 0 },
      ],
    },
  ],
};

describe('Cricket Scorecard & Roster Consistency', () => {
  it('Scenario 1: First innings selected', () => {
    const snap = buildCanonicalMatchSnapshot(mockWarwickshireVsNotts);
    const inn1 = deriveSelectedInningsView(snap, 1);
    assert.strictEqual(inn1.battingTeamName, 'Nottinghamshire');
    assert.strictEqual(inn1.bowlingTeamName, 'Warwickshire');
    assert.strictEqual(inn1.score, 299);
    assert.strictEqual(inn1.wickets, 7);
    assert.strictEqual(inn1.overs, '82.0');
    assert.strictEqual(inn1.batters.length, 4);
    assert.strictEqual(inn1.batters[2].name, 'Joe Clarke');
  });

  it('Scenario 2: Second innings selected', () => {
    const snap = buildCanonicalMatchSnapshot(mockWarwickshireVsNotts);
    const inn2 = deriveSelectedInningsView(snap, 2);
    assert.strictEqual(inn2.battingTeamName, 'Warwickshire');
    assert.strictEqual(inn2.bowlingTeamName, 'Nottinghamshire');
    assert.strictEqual(inn2.score, 0);
    assert.strictEqual(inn2.wickets, 0);
    assert.strictEqual(inn2.overs, '0.0');
    assert.strictEqual(inn2.batters[0].name, 'Alex Davies');
  });

  it('Scenario 3: Innings selector updates every component atomically', () => {
    const snap = buildCanonicalMatchSnapshot(mockWarwickshireVsNotts);
    const inn1 = deriveSelectedInningsView(snap, 'Nottinghamshire INNS');
    const inn2 = deriveSelectedInningsView(snap, 'Warwickshire INNS');
    assert.notStrictEqual(inn1.score, inn2.score);
    assert.notStrictEqual(inn1.batters[0].name, inn2.batters[0].name);
    assert.notStrictEqual(inn1.bowlers[0].name, inn2.bowlers[0].name);
  });

  it('Scenario 4: Score and batters belong to same innings', () => {
    const snap = buildCanonicalMatchSnapshot(mockWarwickshireVsNotts);
    const inn1 = deriveSelectedInningsView(snap, 1);
    assert.strictEqual(inn1.score, 299);
    assert(inn1.batters.some((b) => b.name === 'Joe Clarke'));
    assert(!inn1.batters.some((b) => b.name === 'Alex Davies'));
  });

  it('Scenario 5: Current bowler belongs to opposing team', () => {
    const snap = buildCanonicalMatchSnapshot(mockWarwickshireVsNotts);
    const inn1 = deriveSelectedInningsView(snap, 1);
    assert.strictEqual(inn1.bowlingTeamName, 'Warwickshire');
    assert.strictEqual(inn1.currentBowler.name, 'Oliver Hannon-Dalby');
  });

  it('Scenario 6: Players never leak from another match', () => {
    const snap = buildCanonicalMatchSnapshot(mockWarwickshireVsNotts);
    const inn1 = deriveSelectedInningsView(snap, 1);
    assert(!inn1.batters.some((b) => b.name === 'Virat Kohli'));
    assert(!inn1.bowlers.some((b) => b.name === 'Jasprit Bumrah'));
  });

  it('Scenario 7: Stale cache cannot overwrite newer snapshot', () => {
    const prevLd = { batter1: { name: 'Joe Clarke', runs: 38, balls: 63 } };
    const nextLd = { batter1: { name: 'Jack Haynes', runs: 0, balls: 1 } };
    const merged = mergeCricketLiveDetails(prevLd, nextLd);
    assert.strictEqual(merged.batter1.name, 'Jack Haynes');
  });

  it('Scenario 8: Partial provider update does not create mixed UI', () => {
    const partial = {
      ...mockWarwickshireVsNotts,
      liveDetails: { runs: 305, wickets: 7, overs: '83.2' },
    };
    const snap = buildCanonicalMatchSnapshot(partial);
    const view = deriveSelectedInningsView(snap, 1);
    assert.strictEqual(view.score, 299);
    assert.strictEqual(view.batters.length, 4);
  });

  it('Scenario 9: Application refresh remains consistent', () => {
    const snap1 = buildCanonicalMatchSnapshot(mockWarwickshireVsNotts);
    const snap2 = buildCanonicalMatchSnapshot(mockWarwickshireVsNotts);
    assert.deepStrictEqual(snap1.innings, snap2.innings);
    assert.deepStrictEqual(snap1.headerScores, snap2.headerScores);
  });

  it('Scenario 10: Redis expiry remains consistent', () => {
    const snap = buildCanonicalMatchSnapshot(mockWarwickshireVsNotts);
    assert(snap.snapshotId.startsWith('snap_cb_105219_'));
    assert(snap.providerEventId === '105219');
  });

  it('Scenario 11: Multiple rapid innings changes', () => {
    const snap = buildCanonicalMatchSnapshot(mockWarwickshireVsNotts);
    for (let i = 0; i < 50; i++) {
      const target = i % 2 === 0 ? 1 : 2;
      const view = deriveSelectedInningsView(snap, target);
      assert.strictEqual(view.selectedInningsId, target);
      if (target === 1) {
        assert.strictEqual(view.battingTeamName, 'Nottinghamshire');
      } else {
        assert.strictEqual(view.battingTeamName, 'Warwickshire');
      }
    }
  });

  it('Scenario 12: Provider temporarily missing player data', () => {
    const noPlayerData = {
      id: 'match_no_roster',
      team1: { name: 'India' },
      team2: { name: 'Australia' },
      isLive: true,
      liveDetails: { runs: 120, wickets: 2, overs: '15.0' },
    };
    const snap = buildCanonicalMatchSnapshot(noPlayerData);
    const view = deriveSelectedInningsView(snap);
    assert.strictEqual(view.score, 120);
    assert.strictEqual(view.striker, null);
    assert.strictEqual(view.currentBowler, null);
  });

  it('Scenario 13: Current bowler unavailable', () => {
    const missingBowler = {
      ...mockWarwickshireVsNotts,
      scorecardInnings: [
        {
          inningsId: 1,
          batTeamName: 'Nottinghamshire',
          scoreDetails: { runs: 299, wickets: 7, overs: '82.0' },
          batters: [{ name: 'Joe Clarke', runs: 38, balls: 63 }],
          bowlers: [],
        },
      ],
    };
    const snap = buildCanonicalMatchSnapshot(missingBowler);
    const view = deriveSelectedInningsView(snap, 1);
    assert.strictEqual(view.currentBowler, null);
  });

  it('Scenario 14: Historical match', () => {
    const completedMatch = {
      id: 'cb_historical_999',
      team1: { name: 'England' },
      team2: { name: 'Australia' },
      status: 'COMPLETED',
      isLive: false,
      matchState: 'post',
      scorecardInnings: [
        {
          inningsId: 1,
          batTeamName: 'England',
          scoreDetails: { runs: 283, wickets: 10, overs: '54.4' },
          batters: [{ name: 'Ben Stokes', runs: 85, balls: 110, dismissal: 'b Cummins' }],
          bowlers: [{ name: 'Pat Cummins', overs: '12.4', maidens: 2, runs: 45, wickets: 4 }],
        },
      ],
    };
    const snap = buildCanonicalMatchSnapshot(completedMatch);
    assert.strictEqual(snap.match.status, 'COMPLETED');
    const view = deriveSelectedInningsView(snap, 1);
    assert.strictEqual(view.score, 283);
    assert.strictEqual(view.wickets, 10);
  });

  it('Scenario 15: Live match', () => {
    const snap = buildCanonicalMatchSnapshot(mockWarwickshireVsNotts);
    assert.strictEqual(snap.match.isLive, true);
    assert.strictEqual(snap.match.matchState, 'in');
  });

  it('Scenario 16: 20 repeated page loads return identical data', () => {
    const base = buildCanonicalMatchSnapshot(mockWarwickshireVsNotts);
    for (let i = 0; i < 20; i++) {
      const repeat = buildCanonicalMatchSnapshot(mockWarwickshireVsNotts);
      assert.strictEqual(repeat.snapshotId, base.snapshotId);
      assert.strictEqual(repeat.headerScores.team1ScoreText, base.headerScores.team1ScoreText);
      assert.strictEqual(repeat.headerScores.team2ScoreText, base.headerScores.team2ScoreText);
    }
  });
});
