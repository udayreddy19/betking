import { describe, it, expect } from 'vitest';
import { mapHealth, healthSlice, buildProductionReadiness } from '../../lib/productionReadinessEngine.mjs';
import { assertAutoRepairDisabled, assertSafeTestDatabase, classifyDatabaseTarget } from '../../lib/testEnvGuard.mjs';
import { classifyMismatch } from '../../scripts/investigate_wallet_ledger_mismatches.mjs';

describe('Phase 7 readiness / safety', () => {
  it('mapHealth reads nested status objects (opsProductionHealth shape)', () => {
    expect(mapHealth({ status: 'HEALTHY' })).toBe('GREEN');
    expect(mapHealth({ status: 'DEGRADED' })).toBe('YELLOW');
    expect(mapHealth({ status: 'DOWN' })).toBe('RED');
    expect(mapHealth({})).toBe('NOT VERIFIED');
  });

  it('healthSlice maps backgroundJobs and redisStatus', () => {
    const hs = healthSlice({
      application: { status: 'HEALTHY' },
      database: { status: 'HEALTHY', redisStatus: 'HEALTHY' },
      backgroundJobs: { status: 'WARNING', pending: 5 },
    });
    expect(hs.application).toBe('GREEN');
    expect(hs.database).toBe('GREEN');
    expect(hs.workers).toBe('YELLOW');
    expect(hs.outbox).toBe('YELLOW');
    expect(hs.redis).toBe('GREEN');
  });

  it('production claim never GREEN and includes expanded gates + whyNotGreen', async () => {
    const res = await buildProductionReadiness({ environment: 'production' });
    expect(res.overall).not.toBe('GREEN');
    expect(res.goNoGo.productionClaimAllowed).toBe(false);
    expect(res.goNoGo.decision).toBe('NO-GO');
    const ids = res.gates.map((g) => g.id);
    expect(ids).toContain('TEST_FUNDING');
    expect(ids).toContain('PRODUCTION_SMOKE');
    expect(ids).toContain('RATE_LIMITING');
    expect(ids).toContain('WALLET');
    expect(Array.isArray(res.whyNotGreen)).toBe(true);
    expect(res.whyNotGreen.length).toBeGreaterThan(0);
    expect(res.gates.every((g) => g.severity && g.evidence?.checkedAt)).toBe(true);
    expect(res.autoRepair).toBe(false);
    expect(Array.isArray(res.goNoGo.mandatoryBlockers)).toBe(true);
    expect(res.goNoGo.mandatoryBlockers.length).toBeGreaterThan(0);
    expect(res.goNoGo.stagingClaimAllowed).toBe(false);
  });

  it('refuses auto-repair CLI flags', () => {
    expect(() => assertAutoRepairDisabled(['node', 'x', '--auto-repair=true'])).toThrow(/AUTO_REPAIR_FORBIDDEN/);
    expect(assertAutoRepairDisabled(['node', 'x', '--limit=10'])).toBe(true);
  });

  it('classifies production-like DB targets', () => {
    const cls = classifyDatabaseTarget('postgresql://u:p@200.234.38.230:5432/oddsyra');
    expect(cls.looksProductionLike).toBe(true);
    const local = classifyDatabaseTarget('postgresql://u:p@127.0.0.1:5432/oddsyra');
    expect(local.hostClass).toBe('local');
  });

  it('assertSafeTestDatabase blocks NODE_ENV=production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => assertSafeTestDatabase()).toThrow(/TEST_DB_FORBIDDEN/);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('classifyMismatch never implies auto-repair and covers hold/bucket', () => {
    const bucket = classifyMismatch({
      userId: 'u1', cashBalance: 100, ledgerSum: 150, entryCount: 3,
      bucketTotal: 150, cashVsLedgerDelta: -50, bucketVsLedgerDelta: 0,
    });
    expect(bucket.mismatchType).toBe('CASH_VS_FULL_LEDGER');
    expect(bucket.autoRepair).toBe(false);

    const hold = classifyMismatch({
      userId: 'u2', cashBalance: 80, ledgerSum: 100, entryCount: 2,
      bucketTotal: 100, cashVsLedgerDelta: -20, bucketVsLedgerDelta: 0,
      reservedBalance: 20,
    });
    // bucket explains first
    expect(hold.autoRepair).toBe(false);
  });
});
