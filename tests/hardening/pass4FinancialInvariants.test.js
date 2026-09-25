/**
 * Pass 4 — consolidated financial invariant assertions (UNIT + light INTEGRATION helpers).
 * Classified: UNIT unless noted.
 */

import { describe, it, expect } from 'vitest';
import {
  assertPaymentTransition,
  canTransitionPayment,
  PAYMENT_ALLOWED_TRANSITIONS,
} from '../../lib/paymentStateMachine.mjs';
import {
  AUTHORITATIVE_EXPOSURE_SOURCE,
  calculateAuthoritativeExposureRisk,
} from '../../lib/persistedMarketLiability.mjs';
import { resolveEffectiveRiskLimits, assertHierarchicalRiskLimits } from '../../lib/risk/riskHierarchy.mjs';
import { IdempotencyEngine } from '../../lib/idempotencyEngine.mjs';
import {
  setRuntimeEngineMode,
  resolveOddsEngineMode,
  _resetEngineModeControlForTests,
} from '../../lib/odds-v4/EngineModeControl.mjs';
import { simulateBetRisk } from '../../lib/risk/riskSimulation.mjs';
import { liabilityLimitForMarket } from '../../lib/houseProtectionEngine.mjs';

describe('Pass-4 financial invariants', () => {
  it('exposure source of truth is open_bets_postgres only', () => {
    expect(AUTHORITATIVE_EXPOSURE_SOURCE).toBe('open_bets_postgres');
  });

  it('payment success path allows exactly one credit transition chain', () => {
    expect(canTransitionPayment('CREATED', 'PENDING')).toBe(true);
    expect(canTransitionPayment('PENDING', 'SUCCESS')).toBe(true);
    expect(canTransitionPayment('SUCCESS', 'CREDITED')).toBe(true);
    // No double-credit from CREDITED
    expect(canTransitionPayment('CREDITED', 'CREDITED')).toBe(true); // noop same status
    expect(canTransitionPayment('CREDITED', 'SUCCESS')).toBe(false);
    expect(PAYMENT_ALLOWED_TRANSITIONS.SUCCESS).toContain('CREDITED');
    expect(PAYMENT_ALLOWED_TRANSITIONS.CREDITED).not.toContain('PENDING');
  });

  it('illegal payment transitions throw', () => {
    expect(() => assertPaymentTransition('FAILED', 'CREDITED')).toThrow(/ILLEGAL_PAYMENT_TRANSITION/);
    expect(() => assertPaymentTransition('REFUNDED', 'SUCCESS')).toThrow(/ILLEGAL_PAYMENT_TRANSITION/);
  });

  it('hierarchy child cannot loosen parent max stake', () => {
    const lim = resolveEffectiveRiskLimits({
      sport: 'cricket',
      marketId: 'match_winner',
      userMaxStake: 999_999,
      hierarchy: {
        GLOBAL: { maxStake: 10_000, minStake: 10 },
        SPORT: { cricket: { maxStake: 8_000 } },
        COMPETITION: {},
        EVENT: {},
        MARKET: { match_winner: { maxStake: 5_000 } },
        USER: { defaultMaxStake: 50_000 },
      },
    });
    expect(lim.maxStake).toBe(5_000);
  });

  it('idempotency rejects payload reuse', async () => {
    const eng = new IdempotencyEngine();
    eng.memoryCache.set('inv_k', {
      idempotencyKey: 'inv_k',
      status: 'COMPLETED',
      result: { ok: true },
      requestHash: 'h1',
    });
    await expect(eng.checkOrLock('inv_k', 'BET_PLACE', 'h2')).rejects.toThrow(/IDEMPOTENCY_KEY_REUSE/);
  });

  it('V3 override expires back to V4', async () => {
    _resetEngineModeControlForTests();
    await setRuntimeEngineMode('v3', {
      reason: 'pass4 invariant',
      expiresAt: new Date(Date.now() - 2000).toISOString(),
    });
    expect(resolveOddsEngineMode({ ODDS_ENGINE: undefined })).toBe('v4');
    _resetEngineModeControlForTests();
  });

  it('risk simulate uses same authoritative exposure source as production', async () => {
    const matchId = 'm_inv_sim';
    const marketId = 'match_winner';
    const stake = 50;
    const odds = 2;
    const limit = liabilityLimitForMarket(marketId, { isSrl: false });
    const prod = await calculateAuthoritativeExposureRisk({
      matchId,
      stake,
      odds,
      maxLiabilityLimit: limit,
      exec: async () => ({ rows: [{ liability: 0 }] }),
    });
    const sim = await simulateBetRisk({ matchId, marketId, stake, odds, sport: 'cricket' });
    expect(prod.authoritativeExposureSource).toBe('open_bets_postgres');
    expect(sim.authoritativeExposureSource).toBe('open_bets_postgres');
    expect(sim.potentialLiability).toBe(Math.max(0, stake * odds - stake));
  });

  it('assertHierarchicalRiskLimits rejects over-limit stake', () => {
    expect(() =>
      assertHierarchicalRiskLimits({
        stake: 1_000_000,
        odds: 2,
        sport: 'cricket',
        marketId: 'match_winner',
        userMaxStake: 100,
      }),
    ).toThrow(/RISK_REJECTED/);
  });
});
