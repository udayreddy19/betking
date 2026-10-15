/**
 * OddsEngine V4.10 — quality gate, Monte Carlo blend, score distribution, calibration link.
 */
import { describe, it, expect } from 'vitest';
import { evaluateStateQuality } from '../../lib/odds-v5/state/StateQualityGate.mjs';
import {
  chaseWinProbability,
  monteCarloChaseWinProbability,
} from '../../lib/odds-v5/models/WinExpectancyEngine.mjs';
import {
  normalCdf,
  pOverUnderFromDistribution,
  teamTotalDistribution,
  nextOverRunsDistribution,
} from '../../lib/odds-v5/models/ScoreDistributionEngine.mjs';
import { ProductionObservationRecorder } from '../../lib/odds-v5/calibration/ProductionObservationRecorder.mjs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { V4_ENGINE_VERSION } from '../../lib/odds-v5/OddsEngineV4.mjs';

describe('V4.10 version', () => {
  it('stamps 4.10.0', () => {
    expect(V4_ENGINE_VERSION).toBe('4.10.0');
  });
});

describe('StateQualityGate', () => {
  it('suspends incomplete live chase', () => {
    const gate = evaluateStateQuality({
      status: 'LIVE',
      format: 'T20',
      currentInnings: 2,
      team1: { id: 'a', runs: 120 },
      team2: { id: 'b', runs: 40 },
      battingTeamId: 'b',
      // missing target / runsRequired / ballsRemaining
    });
    expect(gate.action).toBe('SUSPEND');
    expect(gate.reasons.length).toBeGreaterThan(0);
  });

  it('opens complete live chase', () => {
    const gate = evaluateStateQuality({
      status: 'LIVE',
      format: 'T20',
      currentInnings: 2,
      team1: { id: 'a', runs: 160 },
      team2: { id: 'b', runs: 80, wickets: 3 },
      battingTeamId: 'b',
      target: 161,
      runsRequired: 81,
      ballsRemaining: 48,
      timestamp: new Date().toISOString(),
    });
    expect(gate.ok).toBe(true);
    expect(gate.action).toBe('OPEN');
  });
});

describe('Late-chase Monte Carlo', () => {
  it('is deterministic for same inputs', () => {
    const a = monteCarloChaseWinProbability({
      runsRequired: 24,
      ballsRemaining: 12,
      wicketsRemaining: 5,
      format: 'T20',
      simulations: 300,
    });
    const b = monteCarloChaseWinProbability({
      runsRequired: 24,
      ballsRemaining: 12,
      wicketsRemaining: 5,
      format: 'T20',
      simulations: 300,
    });
    expect(a.pChase).toBe(b.pChase);
    expect(a.pChase).toBeGreaterThan(0.02);
    expect(a.pChase).toBeLessThan(0.98);
  });

  it('blends MC into chaseWinProbability for late chase', () => {
    const r = chaseWinProbability({
      runsRequired: 18,
      ballsRemaining: 12,
      wicketsRemaining: 6,
      ballsPerInnings: 120,
      format: 'T20',
    });
    expect(r.method).toBe('resource_mc_blend');
    expect(r.debug?.mc?.pChase).toBeTypeOf('number');
  });
});

describe('ScoreDistributionEngine', () => {
  it('normalCdf is ~0.5 at 0', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 2);
  });

  it('team total over probability rises when mean >> line', () => {
    const dist = teamTotalDistribution({
      currentScore: 100,
      format: 'T20',
      wicketsInHand: 8,
      ballsRemaining: 60,
      ballsPerInnings: 120,
    });
    const { pOver } = pOverUnderFromDistribution(dist, dist.mean - 20);
    expect(pOver).toBeGreaterThan(0.7);
  });

  it('next over distribution is in a sensible band', () => {
    const d = nextOverRunsDistribution({ format: 'T20' });
    expect(d.mean).toBeGreaterThan(4);
    expect(d.mean).toBeLessThan(14);
  });
});

describe('Calibration bet-id linking', () => {
  it('links settlement by bet id even when many bets share market', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v4cal-'));
    const storePath = path.join(dir, 'production_observations.json');
    const rec = new ProductionObservationRecorder({ storagePath: storePath });
    rec.clear();

    const a = rec.recordPrediction({
      providerEventId: 'match_1',
      internalEventId: 'bet_A',
      sport: 'cricket',
      market: 'match_winner',
      selection: 'sel_1',
      fairProbability: 0.55,
      fairOdds: 1 / 0.55,
      publishedOdds: 1.72,
      publishedImpliedProbability: 1 / 1.72,
      predictionTimestamp: '2026-10-01T10:00:00.000Z',
      matchState: { status: 'live' },
    });
    const b = rec.recordPrediction({
      providerEventId: 'match_1',
      internalEventId: 'bet_B',
      sport: 'cricket',
      market: 'match_winner',
      selection: 'sel_1',
      fairProbability: 0.60,
      fairOdds: 1 / 0.60,
      publishedOdds: 1.55,
      publishedImpliedProbability: 1 / 1.55,
      predictionTimestamp: '2026-10-01T10:01:00.000Z',
      matchState: { status: 'live' },
    });
    expect(a.observationId).not.toBe(b.observationId);

    const linkA = rec.linkAuthoritativeSettlement({
      providerEventId: 'match_1',
      internalEventId: 'bet_A',
      market: 'match_winner',
      selection: 'sel_1',
      actualOutcome: 'WON',
      outcomeTimestamp: '2026-10-01T12:00:00.000Z',
    });
    expect(linkA.linked).toBe(true);
    expect(linkA.observationId).toBe(a.observationId);
    expect(linkA.fairProbability).toBeCloseTo(0.55, 5);

    const linkB = rec.linkAuthoritativeSettlement({
      providerEventId: 'match_1',
      internalEventId: 'bet_B',
      market: 'match_winner',
      selection: 'sel_1',
      actualOutcome: 'LOST',
      outcomeTimestamp: '2026-10-01T12:00:00.000Z',
    });
    expect(linkB.linked).toBe(true);
    expect(linkB.observationId).toBe(b.observationId);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
