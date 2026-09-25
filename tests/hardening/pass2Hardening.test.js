import { describe, it, expect, beforeEach } from 'vitest';
import {
  assertBetVelocity,
  recordAcceptedBetVelocity,
  _resetBetVelocityBreakerForTests,
  VELOCITY_DEFAULTS,
} from '../../lib/risk/betVelocityBreaker.mjs';
import { simulateBetRisk } from '../../lib/risk/riskSimulation.mjs';
import { buildPlacementSnapshot } from '../../lib/placementSnapshot.mjs';
import { ProviderRegistry } from '../../lib/providers/ProviderRegistry.mjs';
import {
  createCasinoSession,
  processCasinoCallbackTransaction,
  getCasinoAggregatorStatus,
  _resetCasinoAggregatorForTests,
  CASINO_SCOPE,
} from '../../lib/casinoAggregator.mjs';
import crypto from 'crypto';

describe('Pass-2 hardening', () => {
  beforeEach(() => {
    _resetBetVelocityBreakerForTests();
    _resetCasinoAggregatorForTests();
  });

  it('trips user velocity stake limit', () => {
    const cfg = { ...VELOCITY_DEFAULTS, userMaxStake: 1000, windowMs: 60_000 };
    recordAcceptedBetVelocity({ userId: 'u1', matchId: 'm1', stake: 800 });
    expect(() => assertBetVelocity({ userId: 'u1', matchId: 'm1', stake: 300, config: cfg })).toThrow(
      /BET_VELOCITY_USER_STAKE|velocity/,
    );
  });

  it('simulates risk with same liability helpers', async () => {
    const sim = await simulateBetRisk({
      matchId: 'm-sim',
      marketId: 'match_winner',
      stake: 100,
      odds: 2.0,
      sport: 'cricket',
    });
    expect(sim.potentialPayout).toBe(200);
    expect(sim.potentialLiability).toBe(100);
    expect(['NORMAL', 'ELEVATED', 'HIGH', 'CRITICAL']).toContain(sim.riskLevel);
  });

  it('persists engine metadata on placement snapshot', () => {
    const snap = buildPlacementSnapshot({
      betType: 'SINGLE',
      validatedSelections: [{
        matchId: 'm1',
        marketId: 'match_winner',
        selectionId: '1',
        odds: 1.9,
      }],
      engine: 'OddsEngineV4',
      engineVersion: '4.9.0',
      fairProbability: 0.52,
      riskDecision: 'ACCEPT',
    });
    expect(snap.engine).toBe('OddsEngineV4');
    expect(snap.engineVersion).toBe('4.9.0');
    expect(snap.fairProbability).toBe(0.52);
    expect(snap.legs[0].marketId).toBe('match_winner');
  });

  it('provider health progresses HEALTHY → DEGRADED → UNHEALTHY → FAILED', () => {
    const id = 'espn';
    ProviderRegistry.recordSuccess(id);
    expect(ProviderRegistry.getAllProviders().find((p) => p.id === id).healthStatus).toBe('HEALTHY');
    ProviderRegistry.recordError(id, new Error('x'));
    expect(ProviderRegistry.getAllProviders().find((p) => p.id === id).healthStatus).toBe('DEGRADED');
    ProviderRegistry.recordError(id, new Error('x'));
    ProviderRegistry.recordError(id, new Error('x'));
    expect(ProviderRegistry.getAllProviders().find((p) => p.id === id).healthStatus).toBe('UNHEALTHY');
    ProviderRegistry.recordError(id, new Error('x'));
    ProviderRegistry.recordError(id, new Error('x'));
    expect(ProviderRegistry.getAllProviders().find((p) => p.id === id).healthStatus).toBe('FAILED');
    ProviderRegistry.recordSuccess(id);
  });

  it('casino aggregator verifies signature and dedupes provider txn', () => {
    process.env.CASINO_CALLBACK_SECRET = 'test_secret';
    const session = createCasinoSession({ userId: 'u1', gameId: 'aviator', providerId: 'spribe' });
    expect(getCasinoAggregatorStatus().scope).toBe(CASINO_SCOPE);
    expect(getCasinoAggregatorStatus().houseCasinoEngine).toBe(false);

    const body = JSON.stringify({ amount: 10, type: 'BET' });
    const sig = crypto.createHmac('sha256', 'test_secret').update(body).digest('hex');
    const first = processCasinoCallbackTransaction({
      providerId: 'spribe',
      providerTxnId: 'ptx_1',
      sessionId: session.sessionId,
      userId: 'u1',
      type: 'BET',
      amount: 10,
      rawBody: body,
      signature: sig,
    });
    expect(first.code).toBe('ACCEPTED');
    const dup = processCasinoCallbackTransaction({
      providerId: 'spribe',
      providerTxnId: 'ptx_1',
      sessionId: session.sessionId,
      userId: 'u1',
      type: 'BET',
      amount: 10,
      rawBody: body,
      signature: sig,
    });
    expect(dup.code).toBe('IGNORED_DUPLICATE');
  });
});
