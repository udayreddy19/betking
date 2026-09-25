import { describe, it, expect, beforeEach } from 'vitest';
import {
  AUTHORITATIVE_EXPOSURE_SOURCE,
  calculateAuthoritativeExposureRisk,
} from '../../lib/persistedMarketLiability.mjs';
import {
  resolveEffectiveRiskLimits,
  assertHierarchicalRiskLimits,
  RISK_REASON,
} from '../../lib/risk/riskHierarchy.mjs';
import { simulateBetRisk } from '../../lib/risk/riskSimulation.mjs';
import {
  setRuntimeEngineMode,
  getEngineModeStatus,
  resolveOddsEngineMode,
  _resetEngineModeControlForTests,
} from '../../lib/odds-v4/EngineModeControl.mjs';
import {
  setRuntimeOtherSportsEngineMode,
  getOtherSportsEngineModeStatus,
  _resetOtherSportsEngineModeControlForTests,
} from '../../lib/other-sports-v4/EngineModeControl.mjs';
import {
  assertPaymentTransition,
  canTransitionPayment,
  PAYMENT_ALLOWED_TRANSITIONS,
} from '../../lib/paymentStateMachine.mjs';
import {
  resolveProviderConflict,
  selectProviderWithFailover,
  _resetProviderConflictAuditsForTests,
  CONFLICT_SEVERITY,
} from '../../lib/providers/providerConflictResolver.mjs';
import { buildPlacementSnapshot } from '../../lib/placementSnapshot.mjs';
import { IdempotencyEngine } from '../../lib/idempotencyEngine.mjs';

describe('Pass-3 financial + risk unification', () => {
  beforeEach(() => {
    _resetEngineModeControlForTests();
    _resetOtherSportsEngineModeControlForTests();
    _resetProviderConflictAuditsForTests();
  });

  it('declares open_bets_postgres as authoritative exposure source', () => {
    expect(AUTHORITATIVE_EXPOSURE_SOURCE).toBe('open_bets_postgres');
  });

  it('authoritative exposure uses injected exec (no mem SoT)', async () => {
    const exec = async () => ({ rows: [{ liability: 1000 }] });
    const risk = await calculateAuthoritativeExposureRisk({
      matchId: 'm1',
      stake: 100,
      odds: 2,
      maxLiabilityLimit: 5000,
      exec,
    });
    expect(risk.authoritativeExposureSource).toBe('open_bets_postgres');
    expect(risk.currentLiability).toBe(1000);
    expect(risk.projectedLiability).toBe(1100);
    expect(risk.exceedsMaxLiability).toBe(false);
  });

  it('hierarchy takes tightest max stake (child cannot loosen parent)', () => {
    const lim = resolveEffectiveRiskLimits({
      sport: 'cricket',
      marketId: 'match_winner',
      userMaxStake: 2500,
      hierarchy: {
        GLOBAL: { maxStake: 100_000, minStake: 10, maxPayout: 1_000_000, maxLiability: 5_000_000 },
        SPORT: { cricket: { maxStake: 50_000 } },
        COMPETITION: {},
        EVENT: {},
        MARKET: { match_winner: { maxStake: 5_000 } },
        USER: { defaultMaxStake: 25_000 },
      },
    });
    expect(lim.maxStake).toBe(2500);
  });

  it('rejects stake above hierarchical limit with reason code', () => {
    expect(() => assertHierarchicalRiskLimits({
      stake: 100_000,
      odds: 2,
      sport: 'cricket',
      marketId: 'match_winner',
      userMaxStake: 2500,
    })).toThrow(/RISK_REJECTED/);
    try {
      assertHierarchicalRiskLimits({
        stake: 100_000,
        odds: 2,
        sport: 'cricket',
        marketId: 'match_winner',
        userMaxStake: 2500,
      });
    } catch (err) {
      expect(err.reasonCode).toBe(RISK_REASON.USER_LIMIT);
    }
  });

  it('risk simulation uses same authoritative source flag', async () => {
    const sim = await simulateBetRisk({
      matchId: 'm-sim-pass3',
      marketId: 'match_winner',
      stake: 100,
      odds: 2.0,
      sport: 'cricket',
    });
    expect(sim.authoritativeExposureSource).toBe('open_bets_postgres');
    expect(sim.potentialPayout).toBe(200);
    expect(sim.hierarchy).toBeTruthy();
  });

  it('V3 engine override requires reason and sets expiry', async () => {
    await expect(setRuntimeEngineMode('v3', { updatedBy: 'test' })).rejects.toThrow(/Reason required/);
    const status = await setRuntimeEngineMode('v3', {
      updatedBy: 'test',
      reason: 'incident rollback drill',
      ttlHours: 2,
    });
    expect(status.runtimeOverride).toBe('v3');
    expect(status.overrideExpiresAt).toBeTruthy();
    expect(status.overrideReason).toBe('incident rollback drill');
    expect(resolveOddsEngineMode()).toBe('v3');
  });

  it('expired V3 override falls back to V4 default', async () => {
    await setRuntimeEngineMode('v3', {
      updatedBy: 'test',
      reason: 'expired test',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(resolveOddsEngineMode({ ODDS_ENGINE: undefined })).toBe('v4');
    expect(getEngineModeStatus().runtimeOverride).toBeNull();
  });

  it('other-sports V3 override also requires reason + expiry', async () => {
    await expect(setRuntimeOtherSportsEngineMode('v3', {})).rejects.toThrow(/Reason required/);
    const st = await setRuntimeOtherSportsEngineMode('v3', {
      reason: 'os failover drill',
      ttlHours: 1,
    });
    expect(st.overrideExpiresAt).toBeTruthy();
    expect(getOtherSportsEngineModeStatus().runtimeOverride).toBe('v3');
  });

  it('payment state machine rejects illegal transitions', () => {
    expect(canTransitionPayment('CREATED', 'PENDING')).toBe(true);
    expect(canTransitionPayment('PENDING', 'SUCCESS')).toBe(true);
    expect(canTransitionPayment('SUCCESS', 'CREDITED')).toBe(true);
    expect(canTransitionPayment('FAILED', 'SUCCESS')).toBe(false);
    expect(() => assertPaymentTransition('CREDITED', 'PENDING')).toThrow(/ILLEGAL_PAYMENT_TRANSITION/);
    expect(PAYMENT_ALLOWED_TRANSITIONS.PENDING).toContain('FAILED');
  });

  it('provider conflict resolves with audit and severity', () => {
    const now = Date.now();
    const result = resolveProviderConflict([
      { providerId: 'a', state: { score: '1-0' }, timestamp: now, confidence: 0.9 },
      { providerId: 'b', state: { score: '0-0' }, timestamp: now - 1000, confidence: 0.5 },
      { providerId: 'c', state: { score: '1-0' }, timestamp: now - 500, confidence: 0.8 },
    ]);
    expect(result.canonicalState).toEqual({ score: '1-0' });
    expect(result.conflictSeverity).not.toBe(CONFLICT_SEVERITY.NONE);
    expect(result.auditId).toBeTruthy();
    expect(result.resolutionReason).toMatch(/MAJORITY|FRESHNESS|UNANIMOUS/);
  });

  it('provider failover uses cooldown hysteresis', () => {
    const step1 = selectProviderWithFailover({
      primaryId: 'primary',
      secondaryId: 'secondary',
      primaryHealthy: false,
      secondaryHealthy: true,
    });
    expect(step1.selected).toBe('secondary');
    expect(step1.cooldownMs).toBeGreaterThan(0);

    const hold = selectProviderWithFailover({
      primaryId: 'primary',
      secondaryId: 'secondary',
      primaryHealthy: true,
      secondaryHealthy: true,
      lastSelected: 'secondary',
      cooldownUntil: Date.now() + 10_000,
    });
    expect(hold.reason).toBe('COOLDOWN_HYSTERESIS');
    expect(hold.selected).toBe('secondary');
  });

  it('placement snapshot includes reproducibility fields', () => {
    const snap = buildPlacementSnapshot({
      betType: 'SINGLE',
      validatedSelections: [{
        matchId: 'm1',
        marketId: 'match_winner',
        selectionId: 'home',
        odds: 1.85,
      }],
      engine: 'OddsEngineV4',
      engineVersion: '4.9.0',
      modelVersion: '4.9.0',
      fairProbability: 0.51,
      riskDecision: 'ACCEPT',
      provider: 'espn',
      providerTimestamp: '2026-09-25T00:00:00.000Z',
      canonicalStateVersion: 12,
      quoteTimestamp: '2026-09-25T00:00:01.000Z',
    });
    expect(snap.engine).toBe('OddsEngineV4');
    expect(snap.engineVersion).toBe('4.9.0');
    expect(snap.modelVersion).toBe('4.9.0');
    expect(snap.fairProbability).toBe(0.51);
    expect(snap.provider).toBe('espn');
    expect(snap.providerTimestamp).toBeTruthy();
    expect(snap.canonicalStateVersion).toBe(12);
    expect(snap.quoteTimestamp).toBeTruthy();
    expect(snap.odds).toBe(1.85);
    expect(snap.market).toBe('match_winner');
    expect(snap.selection).toBe('home');
  });

  it('idempotency engine rejects same key with different payload hash (in-memory)', async () => {
    const eng = new IdempotencyEngine();
    // Force memory-only path by pre-seeding cache
    eng.memoryCache.set('k1', {
      idempotencyKey: 'k1',
      status: 'COMPLETED',
      result: { betId: 'b1' },
      requestHash: 'hash_a',
    });
    await expect(eng.checkOrLock('k1', 'BET_PLACE', 'hash_b', 'u1')).rejects.toThrow(/IDEMPOTENCY_KEY_REUSE/);
    const same = await eng.checkOrLock('k1', 'BET_PLACE', 'hash_a', 'u1');
    expect(same.isDuplicate).toBe(true);
    expect(same.result.betId).toBe('b1');
  });
});
