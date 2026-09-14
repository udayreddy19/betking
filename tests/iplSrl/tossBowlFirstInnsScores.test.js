import { afterEach, describe, expect, it } from 'vitest';
import {
  getIplSrlMatches,
  resolveSrlBatFirstTeams,
  getSrlPlayingXINames,
} from '../../lib/iplSrlSimulator.mjs';
import {
  resetAllSrlOperatorSessions,
  setSrlTossAndLineup,
} from '../../lib/iplSrlOperatorState.mjs';
import {
  resolveCricketTeamScores,
  isCricketSecondInnings,
} from '../../src/utils/cricketScores.js';
import { isCricketMatchCompleted } from '../../src/utils/cricketMatchComplete.js';
import { buildCanonicalMatchSnapshot } from '../../src/utils/cricketSnapshot.js';
import { formatTeamShortName } from '../../src/utils/teamShortName.js';

describe('SRL toss bowl → bat-first scores', () => {
  afterEach(() => {
    resetAllSrlOperatorSessions();
  });

  it('does not mirror first-innings score onto both teams (SRH vs LSG early overs)', () => {
    const now = Date.parse('2026-09-14T19:31:00+05:30');
    const match = getIplSrlMatches(now, { publicBoard: true }).find((m) => m.id === 'srl_ipl_6');
    expect(match).toBeTruthy();
    expect(match.matchState).toBe('in');

    const ld = match.liveDetails || {};
    expect(ld.phase).toBe('first');
    expect(ld.score2).toBeUndefined();
    expect(ld.wickets2).toBeUndefined();

    const scores = resolveCricketTeamScores(match, ld);
    const batted = [scores.team1, scores.team2].filter((t) => t.hasBatted);
    expect(batted).toHaveLength(1);
    expect(batted[0].runs).toBeGreaterThan(0);
    expect(!!scores.team1.displayScore && scores.team1.displayScore === scores.team2.displayScore).toBe(false);

    const snap = buildCanonicalMatchSnapshot(match);
    expect(snap.headerScores.team1HasBatted !== snap.headerScores.team2HasBatted).toBe(true);
    expect(snap.headerScores.team1ScoreText === snap.headerScores.team2ScoreText).toBe(false);
    expect(isCricketSecondInnings(match, ld)).toBe(false);
    expect(isCricketMatchCompleted(match)).toBe(false);
  });

  it('when fixture team1 bowls, bat-first scorecard uses chase-side roster', () => {
    const now = Date.parse('2026-09-14T19:31:00+05:30');
    setSrlTossAndLineup('srl_ipl_6', {
      tossWinnerKey: 'srh',
      tossDecision: 'BOWL',
      winnerName: 'Sunrisers Hyderabad OddsYra SRL',
      locked: true,
      userPublished: true,
    });
    const match = getIplSrlMatches(now, { publicBoard: true }).find((m) => m.id === 'srl_ipl_6');
    const { batFirst } = resolveSrlBatFirstTeams(match.team1, match.team2, match.toss, match.operator?.toss);
    expect(batFirst.key).toBe('lsg');

    const inns = match.liveDetails?.scorecardInnings?.[0]
      || match.scorecardInnings?.[0];
    expect(String(inns?.batTeamName || inns?.battingTeamName || '')).toMatch(/Lucknow/i);
    const batterNames = (inns?.batters || []).map((b) => b.name);
    const lsgXi = getSrlPlayingXINames('lsg');
    expect(batterNames.length).toBeGreaterThan(0);
    expect(batterNames.some((n) => lsgXi.some((x) => String(x).includes(n) || n.includes(String(x))))).toBe(true);

    const scores = resolveCricketTeamScores(match, match.liveDetails || {});
    expect(scores.team2.hasBatted).toBe(true);
    expect(scores.team1.hasBatted).toBe(false);
  });
});

describe('SRL short names', () => {
  it('strips OddsYra SRL so LSG is not LSGOS', () => {
    expect(formatTeamShortName('Lucknow Super Giants OddsYra SRL')).toBe('LSG');
    expect(formatTeamShortName('Sunrisers Hyderabad OddsYra SRL', 'SRH')).toBe('SRH');
  });
});

describe('mirrored first-innings corruption', () => {
  it('snapshot does not paint equal totals on both sides during first inns', () => {
    const now = Date.parse('2026-09-14T19:31:00+05:30');
    const base = getIplSrlMatches(now, { publicBoard: true }).find((m) => m.id === 'srl_ipl_6');
    const lsg = base.team2.name;
    const srh = base.team1.name;
    const ld = {
      phase: 'first',
      inningsId: 1,
      firstTeamName: srh,
      runs: 4,
      wickets: 1,
      overs: '0.2',
      firstRuns: 4,
      firstWickets: 1,
      firstOvers: '0.2',
      commentary: `${lsg} batting · 1st innings (20 ov)`,
      scorecardInnings: [{
        inningsId: 1,
        batTeamName: lsg,
        score: 4,
        runs: 4,
        wickets: 1,
        overs: '0.2',
        batters: [{ name: 'Pooran', runs: 4, balls: 2, dismissal: 'not out', notOut: true }],
      }],
    };
    const match = {
      ...base,
      liveDetails: ld,
      scorecardInnings: ld.scorecardInnings,
      team1: { ...base.team1, runs: 4, wickets: 1 },
      team2: { ...base.team2, runs: 4, wickets: 1 },
    };

    const snap = buildCanonicalMatchSnapshot(match);
    const bothShowSame = snap.headerScores.team1HasBatted
      && snap.headerScores.team2HasBatted
      && snap.headerScores.team1ScoreText.startsWith('4/1')
      && snap.headerScores.team2ScoreText.startsWith('4/1');
    expect(bothShowSame).toBe(false);
    expect(isCricketMatchCompleted(match)).toBe(false);
  });
});
