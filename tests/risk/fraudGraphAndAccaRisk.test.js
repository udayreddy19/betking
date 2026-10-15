import { describe, it, expect, beforeEach } from 'vitest';
import { fraudGraphEngine } from '../../lib/fraudGraphEngine.mjs';
import { assertHierarchicalRiskLimits, RISK_REASON } from '../../lib/risk/riskHierarchy.mjs';

describe('fraudGraphEngine persistence shape', () => {
  beforeEach(() => {
    fraudGraphEngine._resetForTests();
  });

  it('records user signals and scores multi-device risk', () => {
    const uid = 'usr_fraud_test';
    fraudGraphEngine.recordUserSignal(uid, { deviceId: 'd1', ipAddress: '1.1.1.1' });
    fraudGraphEngine.recordUserSignal(uid, { deviceId: 'd2', ipAddress: '1.1.1.2' });
    fraudGraphEngine.recordUserSignal(uid, { deviceId: 'd3', ipAddress: '1.1.1.3' });
    const risk = fraudGraphEngine.recordUserSignal(uid, { deviceId: 'd4', ipAddress: '1.1.1.4' });
    expect(risk.score).toBeGreaterThanOrEqual(30);
    expect(risk.persisted).toBe(true);
  });

  it('restricts flagged accounts', () => {
    const acc = fraudGraphEngine.restrictAccount('acc_1', { category: 'Test', operatorNotes: 'unit' });
    expect(acc.status).toBe('RESTRICTED');
  });
});

describe('acca combined payout hierarchy', () => {
  it('rejects acca when combined payout exceeds maxPayout', () => {
    expect(() => assertHierarchicalRiskLimits({
      stake: 50_000,
      odds: 30, // combined
      sport: 'cricket',
      marketId: 'accumulator',
      hierarchy: {
        GLOBAL: { maxStake: 100_000, minStake: 10, maxPayout: 100_000, maxLiability: 5_000_000 },
        SPORT: {},
        COMPETITION: {},
        EVENT: {},
        MARKET: {},
        USER: { defaultMaxStake: 100_000 },
      },
    })).toThrow(/payout/i);
  });

  it('accepts single within payout limit', () => {
    const r = assertHierarchicalRiskLimits({
      stake: 1000,
      odds: 2.0,
      sport: 'cricket',
      marketId: 'match_winner',
    });
    expect(r.ok).toBe(true);
    expect(r.potentialPayout).toBe(2000);
  });
});
