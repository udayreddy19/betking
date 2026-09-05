/**
 * OddsEngineV4 — unit tests for MW resource model, D50/ODI format, totals, gates, cutover.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createCanonicalMatchStateV4 } from '../../lib/odds-v4/state/CanonicalMatchStateV4.mjs';
import { evaluateStateQuality } from '../../lib/odds-v4/state/StateQualityGate.mjs';
import { buildCanonicalFromMatchV4 } from '../../lib/odds-v4/state/buildCanonicalFromMatchV4.mjs';
import { generate, generateFromState } from '../../lib/odds-v4/OddsEngineV4.mjs';
import { chaseWinProbability, matchWinnerFairProbs, deconvolveProviderFair } from '../../lib/odds-v4/models/WinExpectancyEngine.mjs';
import { clearShadowRing, runShadowCompare, getShadowMetrics } from '../../lib/odds-v4/shadow/ShadowHarness.mjs';
import {
  evaluateCutoverReadiness,
  resolveOddsEngineMode,
  CUTOVER_THRESHOLDS,
} from '../../lib/odds-v4/shadow/CutoverGate.mjs';
import { validateMarketSettlementCompatibility } from '../../lib/settlement/marketSettlementContract.mjs';

function baseChaseState(overrides = {}) {
  return createCanonicalMatchStateV4({
    matchId: 'test_chase_1',
    sport: 'cricket',
    format: 'T20',
    status: 'LIVE',
    phase: 'CHASE',
    team1: { id: 't1', name: 'Team A', runs: 145, wickets: 10, balls: 120 },
    team2: { id: 't2', name: 'Team B', runs: 80, wickets: 2, balls: 72 },
    currentInnings: 2,
    battingTeamId: 't2',
    bowlingTeamId: 't1',
    target: 146,
    runsRequired: 66,
    ballsPerInnings: 120,
    ballsCompleted: 72,
    ballsRemaining: 48,
    wicketsInHand: 8,
    battingRuns: 80,
    battingWickets: 2,
    firstInningsRuns: 145,
    hasBallFeed: true,
    hasNamedBatters: true,
    ballFeedAgeMs: 1000,
    formatConfidence: 'high',
    batter1: { name: 'Batter One', runs: 40, balls: 30 },
    batter2: { name: 'Batter Two', runs: 25, balls: 20 },
    ...overrides,
  });
}

describe('OddsEngineV4 — WinExpectancy + Match Winner', () => {
  it('prices chase with resource model (not RR-only flat)', () => {
    const state = baseChaseState();
    const fair = matchWinnerFairProbs(state);
    expect(fair.method).toBe('resource_table');
    expect(fair.pTeam2).toBeGreaterThan(0.15);
    expect(fair.pTeam2).toBeLessThan(0.95);

    const snap = generateFromState(state, { winnerOnly: true });
    const mw = snap.markets.find((m) => m.marketId === 'match_winner');
    expect(mw?.status).toBe('OPEN');
    expect(mw.selections).toHaveLength(2);
    const odds = mw.selections.map((s) => Number(s.odds));
    expect(odds.every((o) => o > 1 && o < 100)).toBe(true);
    // Overround ~8% → sum of implied > 1.05
    const implied = odds.reduce((s, o) => s + 1 / o, 0);
    expect(implied).toBeGreaterThan(1.05);
    expect(implied).toBeLessThan(1.15);
  });

  it('does not emit silent 1.90/1.90 when chase state is complete', () => {
    const snap = generateFromState(baseChaseState(), { winnerOnly: true });
    const mw = snap.markets.find((m) => m.marketId === 'match_winner');
    const o1 = Number(mw.selections[0].odds);
    const o2 = Number(mw.selections[1].odds);
    expect(!(o1 === 1.9 && o2 === 1.9)).toBe(true);
  });

  it('makes extreme chase shorts when chase is nearly impossible', () => {
    const chase = chaseWinProbability(baseChaseState({
      runsRequired: 90,
      ballsRemaining: 12,
      wicketsInHand: 2,
    }));
    expect(chase.pChase).toBeLessThan(0.2);
  });

  it('prematch uses independent prior (not provider republish)', () => {
    const state = baseChaseState({
      status: 'SCHEDULED',
      phase: 'PREMATCH',
      currentInnings: 1,
      providerOdds: { home: 1.25, away: 3.8 },
    });
    const fair = matchWinnerFairProbs(state);
    expect(fair.method).toBe('flat_prior');
    expect(fair.pTeam1).toBeCloseTo(0.52, 2);
    const decon = deconvolveProviderFair({ home: 1.25, away: 3.8 });
    expect(decon.pTeam1).toBeGreaterThan(0.7);
  });
});

describe('OddsEngineV4 — D50 / ODI format gate', () => {
  it('maps Oman D50 league + 50-over first innings to ODI balls', () => {
    const match = {
      id: 'oman_d50',
      sport: 'cricket',
      league: 'Oman D50 League',
      matchType: 'T20',
      status: 'LIVE',
      isLive: true,
      matchState: 'in',
      team1: { name: 'MUT', id: 'mut' },
      team2: { name: 'IAI', id: 'iai' },
      liveDetails: {
        firstRuns: 248,
        firstWickets: 8,
        firstOvers: '50.0',
        chaseRuns: 120,
        chaseWickets: 3,
        chaseOvers: '28.2',
        battingTeam: 'IAI',
        innings: 2,
      },
    };
    const state = buildCanonicalFromMatchV4(match);
    expect(state.format).toBe('ODI');
    expect(state.ballsPerInnings).toBe(300);
    expect(state.phase).toBe('CHASE');
  });
});

describe('OddsEngineV4 — P0 totals + settlement contract', () => {
  it('emits team_total and match_total with settlement-compatible IDs', () => {
    const snap = generateFromState(baseChaseState(), { winnerOnly: false });
    const teamTotal = snap.markets.find((m) => m.marketId === 'team_total');
    const matchTotal = snap.markets.find((m) => m.marketId === 'match_total');
    expect(teamTotal?.status).toBe('OPEN');
    expect(matchTotal?.status).toBe('OPEN');
    expect(validateMarketSettlementCompatibility(teamTotal).compatible).toBe(true);
    expect(validateMarketSettlementCompatibility(matchTotal).compatible).toBe(true);
    expect(teamTotal.line).toBeGreaterThan(0);
  });
});

describe('OddsEngineV4 — P1 overs behind ball feed', () => {
  it('emits next_over total when ball feed present', () => {
    const snap = generateFromState(baseChaseState({ hasBallFeed: true, ballFeedAgeMs: 500 }), {});
    const over = snap.markets.find((m) => /next_over_\d+_total$/i.test(m.marketId));
    expect(over).toBeTruthy();
    expect(validateMarketSettlementCompatibility(over).compatible).toBe(true);
  });

  it('skips over markets without ball feed', () => {
    const snap = generateFromState(baseChaseState({
      hasBallFeed: false,
      hasNamedBatters: false,
      batter1: null,
      batter2: null,
      ballFeedAgeMs: 0,
    }), {});
    const over = snap.markets.find((m) => /next_over_/i.test(m.marketId));
    expect(over).toBeFalsy();
  });
});

describe('OddsEngineV4 — P2/P3 quality gates', () => {
  it('emits player markets when named batters present', () => {
    const snap = generateFromState(baseChaseState(), {});
    const player = snap.markets.find((m) => /^player_/i.test(m.marketId));
    expect(player).toBeTruthy();
  });

  it('P3 markets require enableP3', () => {
    const off = generateFromState(baseChaseState(), { enableP3: false });
    expect(off.markets.some((m) => /odd_even|method_of_next|runs_exact/i.test(m.marketId))).toBe(false);
    const on = generateFromState(baseChaseState(), { enableP3: true });
    expect(on.markets.some((m) => /odd_even|method_of_next|runs_exact/i.test(m.marketId))).toBe(true);
  });
});

describe('OddsEngineV4 — StateQualityGate', () => {
  it('suspends all on unknown format', () => {
    const q = evaluateStateQuality(baseChaseState({ format: 'FOO' }));
    expect(q.suspendAll).toBe(true);
  });

  it('suspends winner when chase target missing', () => {
    const q = evaluateStateQuality(baseChaseState({
      target: null,
      runsRequired: null,
      firstInningsRuns: null,
    }));
    expect(q.suspendWinner).toBe(true);
  });
});

describe('OddsEngineV4 — Shadow + cutover', () => {
  beforeEach(async () => {
    clearShadowRing();
    delete process.env.ODDS_ENGINE;
    const { _resetEngineModeControlForTests } = await import('../../lib/odds-v4/shadow/EngineModeControl.mjs');
    _resetEngineModeControlForTests();
  });

  it('resolveOddsEngineMode defaults to v3', () => {
    expect(resolveOddsEngineMode({})).toBe('v3');
    expect(resolveOddsEngineMode({ ODDS_ENGINE: 'shadow' })).toBe('shadow');
    expect(resolveOddsEngineMode({ ODDS_ENGINE: 'v4' })).toBe('v4');
  });

  it('admin runtime toggle overrides env and is exclusive', async () => {
    const {
      setRuntimeEngineMode,
      clearRuntimeEngineMode,
      _resetEngineModeControlForTests,
    } = await import('../../lib/odds-v4/shadow/EngineModeControl.mjs');
    process.env.ODDS_ENGINE = 'shadow';
    _resetEngineModeControlForTests();
    await setRuntimeEngineMode('v4', { updatedBy: 'test' });
    expect(resolveOddsEngineMode()).toBe('v4');
    await setRuntimeEngineMode('v3', { updatedBy: 'test' });
    expect(resolveOddsEngineMode()).toBe('v3');
    await clearRuntimeEngineMode({ updatedBy: 'test' });
    expect(resolveOddsEngineMode()).toBe('shadow');
  });

  it('shadow compare records metrics against reference', () => {
    const match = {
      id: 'shadow_1',
      sport: 'cricket',
      status: 'LIVE',
      isLive: true,
      matchState: 'in',
      team1: { name: 'Alpha', id: 'a' },
      team2: { name: 'Beta', id: 'b' },
      liveDetails: {
        firstRuns: 160,
        firstWickets: 7,
        firstOvers: '20.0',
        chaseRuns: 90,
        chaseWickets: 2,
        chaseOvers: '12.0',
        battingTeam: 'Beta',
        innings: 2,
      },
      marketReferenceData: { providerOdds: { home: 2.1, away: 1.75 } },
    };
    const row = runShadowCompare(match);
    expect(row.v4).toBeTruthy();
    expect(row.ref?.team2).toBe(1.75);
    const metrics = getShadowMetrics();
    expect(metrics.ringSize).toBeGreaterThanOrEqual(1);
  });

  it('cutover gate fails until thresholds met', () => {
    const gate = evaluateCutoverReadiness({
      metrics: { samples: 10, sameFavRate: 0.5, medianShortDelta: 0.5 },
    });
    expect(gate.ready).toBe(false);
    expect(gate.recommendedEngine).toBe('v3');
  });

  it('cutover gate ready when metrics pass', () => {
    const gate = evaluateCutoverReadiness({
      metrics: {
        samples: CUTOVER_THRESHOLDS.minSamples,
        sameFavRate: 0.95,
        medianShortDelta: 0.1,
      },
    });
    expect(gate.ready).toBe(true);
    expect(gate.recommendedEngine).toBe('v4');
  });

  it('generate() accepts match blob via adapter', () => {
    const snap = generate({
      id: 'blob_1',
      sport: 'cricket',
      status: 'LIVE',
      isLive: true,
      matchState: 'in',
      team1: { name: 'A', id: 'a' },
      team2: { name: 'B', id: 'b' },
      liveDetails: {
        firstRuns: 150,
        firstOvers: '20.0',
        chaseRuns: 60,
        chaseWickets: 1,
        chaseOvers: '8.0',
        battingTeam: 'B',
        innings: 2,
      },
    }, { winnerOnly: true });
    expect(snap.engine).toBe('OddsEngineV4');
    expect(snap.markets.some((m) => m.marketId === 'match_winner')).toBe(true);
  });
});
