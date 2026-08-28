import { describe, it, expect, beforeEach } from 'vitest';
import { globalProviderHealth, PROVIDER_STATES } from '../../../lib/odds-v3/providers/providerHealthEngine.mjs';
import { routeDataAvailability, DATA_ROUTING_DECISIONS } from '../../../lib/odds-v3/pricing/dataAvailabilityRouter.mjs';
import { generate } from '../../../lib/odds-v3/OddsEngineV3.mjs';
import { createCanonicalMatchState } from '../../../lib/odds-v3/models/CanonicalMatchState.mjs';
import { assertServerOddsBettable } from '../../../lib/oddsPlacementValidation.mjs';

describe('OddsEngineV3 — Unified Real Data Availability & Fallback Suite', () => {
  beforeEach(() => {
    // Reset provider health states
    globalProviderHealth.recordSuccess('cricbuzz', { latencyMs: 50, schemaValid: true });
    globalProviderHealth.recordSuccess('crex', { latencyMs: 60, schemaValid: true });
  });

  it('1. should classify a fast, valid tick as HEALTHY', () => {
    const health = globalProviderHealth.recordSuccess('cricbuzz', { latencyMs: 120, schemaValid: true });
    expect(health.status).toBe(PROVIDER_STATES.HEALTHY);
    expect(health.confidenceScore).toBe(1.0);
  });

  it('2. should mark a provider DEGRADED on timeout latency', () => {
    const health = globalProviderHealth.recordSuccess('cricbuzz', { latencyMs: 3000, schemaValid: true });
    expect(health.status).toBe(PROVIDER_STATES.DEGRADED);
    expect(health.confidenceScore).toBeLessThan(1.0);
  });

  it('3. should mark a provider STALE when tick age exceeds max stale threshold', () => {
    const p = globalProviderHealth.getOrCreateProvider('cricbuzz');
    p.lastSuccessfulTickAt = Date.now() - 10000; // 10s old
    const evaluated = globalProviderHealth.evaluateHealth('cricbuzz');
    expect(evaluated.status).toBe(PROVIDER_STATES.STALE);
    expect(evaluated.confidenceScore).toBe(0.0);
  });

  it('4. should mark provider INVALID on corrupt or malformed schema', () => {
    const health = globalProviderHealth.recordSuccess('cricbuzz', { latencyMs: 50, schemaValid: false });
    expect(health.status).toBe(PROVIDER_STATES.INVALID);
    expect(health.confidenceScore).toBe(0.0);
  });

  it('5. should failover to secondary provider when primary is UNAVAILABLE', () => {
    globalProviderHealth.recordFailure('cricbuzz');
    globalProviderHealth.recordFailure('cricbuzz');
    globalProviderHealth.recordFailure('cricbuzz');

    const routing = routeDataAvailability({
      sport: 'cricket',
      marketType: 'match_winner',
      primaryProvider: 'cricbuzz',
      secondaryProvider: 'crex',
    });

    expect(routing.decision).toBe(DATA_ROUTING_DECISIONS.SECONDARY_PROVIDER);
    expect(routing.provider).toBe('crex');
    expect(routing.fallbackUsed).toBe(true);
    expect(routing.fallbackLevel).toBe(2);
  });

  it('6. should fall back to warm cache when both primary and secondary are down', () => {
    globalProviderHealth.recordFailure('cricbuzz');
    globalProviderHealth.recordFailure('cricbuzz');
    globalProviderHealth.recordFailure('cricbuzz');
    globalProviderHealth.recordFailure('crex');
    globalProviderHealth.recordFailure('crex');
    globalProviderHealth.recordFailure('crex');

    const cachedSnapshot = {
      generatedAt: new Date(Date.now() - 500).toISOString(), // 500ms old
      status: 'OK',
    };

    const routing = routeDataAvailability({
      sport: 'cricket',
      marketType: 'match_winner',
      primaryProvider: 'cricbuzz',
      secondaryProvider: 'crex',
      cachedSnapshot,
      maxCacheAgeMs: 2000,
    });

    expect(routing.decision).toBe(DATA_ROUTING_DECISIONS.CACHE);
    expect(routing.fallbackLevel).toBe(3);
  });

  it('7. should reject expired cache (> 2,000ms)', () => {
    globalProviderHealth.recordFailure('cricbuzz');
    globalProviderHealth.recordFailure('cricbuzz');
    globalProviderHealth.recordFailure('cricbuzz');
    globalProviderHealth.recordFailure('crex');
    globalProviderHealth.recordFailure('crex');
    globalProviderHealth.recordFailure('crex');

    const cachedSnapshot = {
      generatedAt: new Date(Date.now() - 3500).toISOString(), // 3.5s old
      status: 'OK',
    };

    const routing = routeDataAvailability({
      sport: 'cricket',
      marketType: 'match_winner',
      primaryProvider: 'cricbuzz',
      secondaryProvider: 'crex',
      cachedSnapshot,
      maxCacheAgeMs: 2000,
      canonicalState: { sport: 'cricket', isLive: true },
    });

    expect(routing.decision).toBe(DATA_ROUTING_DECISIONS.DETERMINISTIC_MODEL);
    expect(routing.fallbackLevel).toBe(4);
  });

  it('8. should allow deterministic fallback for cricket match winner chase', () => {
    globalProviderHealth.recordFailure('cricbuzz');
    globalProviderHealth.recordFailure('cricbuzz');
    globalProviderHealth.recordFailure('cricbuzz');
    globalProviderHealth.recordFailure('crex');
    globalProviderHealth.recordFailure('crex');
    globalProviderHealth.recordFailure('crex');

    const routing = routeDataAvailability({
      sport: 'cricket',
      marketType: 'match_winner',
      primaryProvider: 'cricbuzz',
      secondaryProvider: 'crex',
      canonicalState: { sport: 'cricket', isLive: true },
    });

    expect(routing.decision).toBe(DATA_ROUTING_DECISIONS.DETERMINISTIC_MODEL);
    expect(routing.fallbackLevel).toBe(4);
  });

  it('9. should SUSPEND delivery / ball-by-ball markets when real feed is unavailable', () => {
    globalProviderHealth.recordFailure('cricbuzz');
    globalProviderHealth.recordFailure('cricbuzz');
    globalProviderHealth.recordFailure('cricbuzz');
    globalProviderHealth.recordFailure('crex');
    globalProviderHealth.recordFailure('crex');
    globalProviderHealth.recordFailure('crex');

    const routing = routeDataAvailability({
      sport: 'cricket',
      marketType: 'delivery_markets',
      primaryProvider: 'cricbuzz',
      secondaryProvider: 'crex',
      canonicalState: { sport: 'cricket', isLive: true },
    });

    expect(routing.decision).toBe(DATA_ROUTING_DECISIONS.SUSPEND);
    expect(routing.fallbackLevel).toBe(5);
    expect(routing.reason).toBe('REAL_FEED_REQUIRED_FOR_SPECIALIZED_MARKET');
  });

  it('10. should suspend market when all sources are exhausted and canonical state is null', () => {
    globalProviderHealth.recordFailure('cricbuzz');
    globalProviderHealth.recordFailure('cricbuzz');
    globalProviderHealth.recordFailure('cricbuzz');
    globalProviderHealth.recordFailure('crex');
    globalProviderHealth.recordFailure('crex');
    globalProviderHealth.recordFailure('crex');

    const routing = routeDataAvailability({
      sport: 'cricket',
      marketType: 'match_winner',
      primaryProvider: 'cricbuzz',
      secondaryProvider: 'crex',
      canonicalState: null,
    });

    expect(routing.decision).toBe(DATA_ROUTING_DECISIONS.SUSPEND);
    expect(routing.fallbackLevel).toBe(5);
  });

  it('11. should enforce 2 consecutive healthy ticks before fully recovering from UNAVAILABLE', () => {
    globalProviderHealth.recordFailure('cricbuzz');
    globalProviderHealth.recordFailure('cricbuzz');
    globalProviderHealth.recordFailure('cricbuzz');

    // Tick 1
    const tick1 = globalProviderHealth.recordSuccess('cricbuzz', { latencyMs: 50, schemaValid: true });
    expect(tick1.status).toBe(PROVIDER_STATES.RECOVERING);
    expect(tick1.consecutiveHealthyTicks).toBe(1);

    // Tick 2
    const tick2 = globalProviderHealth.recordSuccess('cricbuzz', { latencyMs: 50, schemaValid: true });
    expect(tick2.status).toBe(PROVIDER_STATES.HEALTHY);
    expect(tick2.consecutiveHealthyTicks).toBe(2);
  });

  it('12. should reject betting on locked / suspended odds (< 1.01)', () => {
    expect(() => {
      assertServerOddsBettable(1.00);
    }).toThrow(/ODDS_LOCKED/);
  });

  it('13. should ensure OddsEngineV3 operates authoritatively without candidate intrusion', () => {
    const state = createCanonicalMatchState({
      matchId: 'match_v3_fallback_test',
      sport: 'CRICKET',
      format: 'THE_HUNDRED',
      status: 'LIVE',
      team1: { id: 'IND', name: 'India', runs: 180, wickets: 4, balls: 100 },
      team2: { id: 'AUS', name: 'Australia', runs: 140, wickets: 2, balls: 60 },
      currentInnings: 2,
      battingTeamId: 'AUS',
      bowlingTeamId: 'IND',
      target: 181,
      runsRequired: 41,
      ballsPerInnings: 100,
      ballsCompleted: 60,
      ballsRemaining: 40,
      providerTimestamp: Date.now(),
      stateVersion: 1,
    });

    const snapshot = generate(state);
    expect(snapshot).toBeDefined();
    expect(snapshot.engine).toBe('OddsEngineV3');
    expect(snapshot.engineVersion).toBe('3.0.0');
    expect(snapshot.markets.length).toBeGreaterThan(0);
  });
});
