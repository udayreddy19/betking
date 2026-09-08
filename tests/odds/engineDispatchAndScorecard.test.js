/**
 * Engine dispatch + scorecard — positive and negative routing cases.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generatePublicMatchOddsSnapshot } from '../../lib/odds-v4/engineDispatch.mjs';
import {
  _resetEngineModeControlForTests,
  setRuntimeEngineMode,
  clearRuntimeEngineMode,
} from '../../lib/odds-v4/EngineModeControl.mjs';
import {
  _resetOtherSportsEngineModeControlForTests,
  setRuntimeOtherSportsEngineMode,
  clearRuntimeOtherSportsEngineMode,
} from '../../lib/other-sports-v4/EngineModeControl.mjs';
import { getOddsEngineScorecard, ODDS_ENGINE_SCORECARD } from '../../lib/oddsEngineScorecard.mjs';

function cricketLive() {
  return {
    id: 'disp-c1',
    sport: 'cricket',
    status: 'LIVE',
    isLive: true,
    matchState: 'in',
    matchType: 'T20',
    team1: { name: 'A', id: 'a' },
    team2: { name: 'B', id: 'b' },
    liveDetails: {
      firstRuns: 150,
      firstWickets: 6,
      firstOvers: '20.0',
      chaseRuns: 80,
      chaseWickets: 2,
      chaseOvers: '10.0',
      battingTeam: 'B',
      innings: 2,
    },
  };
}

function soccerLive() {
  return {
    id: 'disp-s1',
    sport: 'soccer',
    isLive: true,
    matchState: 'in',
    team1: { name: 'Home' },
    team2: { name: 'Away' },
    liveDetails: { score1: 0, score2: 0, minute: 15 },
    odds: { home: 2.2, draw: 3.2, away: 3.3 },
  };
}

describe('engine dispatch positive cases', () => {
  beforeEach(() => {
    _resetEngineModeControlForTests();
    _resetOtherSportsEngineModeControlForTests();
    delete process.env.ODDS_ENGINE;
    delete process.env.OTHER_SPORTS_ENGINE;
  });

  afterEach(async () => {
    _resetEngineModeControlForTests();
    _resetOtherSportsEngineModeControlForTests();
    await clearRuntimeEngineMode().catch(() => null);
    await clearRuntimeOtherSportsEngineMode().catch(() => null);
  });

  it('routes cricket to OddsEngineV4 when mode is v4', async () => {
    await setRuntimeEngineMode('v4', { updatedBy: 'test' });
    const { rawSnapshot, mode } = generatePublicMatchOddsSnapshot(cricketLive(), { winnerOnly: true });
    expect(mode).toBe('v4');
    expect(rawSnapshot?.engine).toBe('OddsEngineV4');
    expect(rawSnapshot?.engineVersion).toBe('4.8.7');
  });

  it('routes soccer to OtherSportsEngineV4 when other-sports mode is v4', async () => {
    await setRuntimeOtherSportsEngineMode('v4', { updatedBy: 'test' });
    const { rawSnapshot } = generatePublicMatchOddsSnapshot(soccerLive(), { winnerOnly: true });
    expect(rawSnapshot?.engine).toBe('OtherSportsEngineV4');
    expect(rawSnapshot?.engineVersion).toBe('4.8.7');
  });

  it('scorecard lists both primary engines at 10.0', () => {
    const card = getOddsEngineScorecard();
    expect(card).toHaveLength(ODDS_ENGINE_SCORECARD.length);
    expect(card.find((r) => r.engine === 'OddsEngineV4')).toMatchObject({
      version: '4.8.7',
      score: 10.0,
    });
    expect(card.find((r) => r.engine === 'OtherSportsEngineV4')).toMatchObject({
      version: '4.8.7',
      score: 10.0,
    });
  });
});

describe('engine dispatch negative cases', () => {
  beforeEach(() => {
    _resetEngineModeControlForTests();
    _resetOtherSportsEngineModeControlForTests();
  });

  afterEach(async () => {
    await clearRuntimeEngineMode().catch(() => null);
    await clearRuntimeOtherSportsEngineMode().catch(() => null);
  });

  it('does not treat cricket as OtherSportsEngineV4', async () => {
    await setRuntimeOtherSportsEngineMode('v4', { updatedBy: 'test' });
    await setRuntimeEngineMode('v4', { updatedBy: 'test' });
    const { rawSnapshot } = generatePublicMatchOddsSnapshot(cricketLive(), { winnerOnly: true });
    expect(rawSnapshot?.engine).not.toBe('OtherSportsEngineV4');
    expect(rawSnapshot?.engine).toBe('OddsEngineV4');
  });

  it('scorecard is immutable snapshot (mutations do not leak)', () => {
    const a = getOddsEngineScorecard();
    a[0].score = 0;
    const b = getOddsEngineScorecard();
    expect(b[0].score).toBe(10.0);
  });
});
