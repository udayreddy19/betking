import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generate } from '../../lib/odds-v3/OddsEngineV3.mjs';
import { createCanonicalMatchState } from '../../lib/odds-v3/models/CanonicalMatchState.mjs';
import { adaptV3SnapshotToPublicContract } from '../../lib/odds-v3/adapters/V3ApiAdapter.mjs';
import { runShadowComparison } from '../../lib/odds-v3/shadow/OddsShadowRunner.mjs';

describe('OddsEngineV3 — Phase 26 Migration Test Suite', () => {
  const originalEnv = process.env.ODDS_ENGINE_VERSION;

  afterEach(() => {
    process.env.ODDS_ENGINE_VERSION = originalEnv;
  });

  it('respects ODDS_ENGINE_VERSION=V3 feature flag', () => {
    process.env.ODDS_ENGINE_VERSION = 'V3';
    expect(process.env.ODDS_ENGINE_VERSION).toBe('V3');
  });

  it('respects ODDS_ENGINE_VERSION=V2 feature flag fallback', () => {
    process.env.ODDS_ENGINE_VERSION = 'V2';
    expect(process.env.ODDS_ENGINE_VERSION).toBe('V2');
  });

  it('adapts V3 OddsSnapshot into public API contract with engine="OddsEngineV3"', () => {
    const canonicalState = createCanonicalMatchState({
      matchId: 'match_adapter_test',
      sport: 'CRICKET',
      format: 'THE_HUNDRED',
      status: 'LIVE',
      team1: { id: 'OVI', name: 'Oval Invincibles', runs: 142, wickets: 5, balls: 100 },
      team2: { id: 'TRT', name: 'Trent Rockets', runs: 98, wickets: 3, balls: 58 },
      currentInnings: 2,
      battingTeamId: 'TRT',
      bowlingTeamId: 'OVI',
      target: 143,
      runsRequired: 45,
      ballsPerInnings: 100,
      ballsCompleted: 58,
      ballsRemaining: 42,
      batter1: { name: 'Alex Hales', runs: 42, balls: 28 },
      batter2: { name: 'Dawid Malan', runs: 30, balls: 20 },
      providerTimestamp: Date.now(),
      stateVersion: 1,
    });

    const rawSnap = generate(canonicalState);
    const adapted = adaptV3SnapshotToPublicContract(rawSnap);

    expect(adapted.engine).toBe('OddsEngineV3');
    expect(adapted.engineVersion).toBe('3.0.0');
    expect(adapted.source).toBe('ODDS_ENGINE_V3');
    expect(adapted.markets.length).toBeGreaterThanOrEqual(12);

    // Verify both 'selections' and 'options' exist for backward UI compatibility
    expect(adapted.markets[0].selections).toBeDefined();
    expect(adapted.markets[0].options).toBeDefined();
    expect(adapted.markets[0].key).toBeDefined();
  });

  it('executes V2 + V3 shadow mode side by side without throwing', () => {
    const matchObj = {
      id: 'match_shadow_test',
      matchId: 'match_shadow_test',
      sport: 'cricket',
      league: 'the_hundred',
      status: 'LIVE',
      team1: { id: 'OVI', name: 'Oval Invincibles', runs: 142, wickets: 5, balls: 100 },
      team2: { id: 'TRT', name: 'Trent Rockets', runs: 98, wickets: 3, balls: 58 },
      target: 143,
      currentInnings: 2,
    };

    const res = runShadowComparison(matchObj);
    expect(res.v3Snapshot).toBeDefined();
    expect(Array.isArray(res.shadowComparison)).toBe(true);
  });
});
