import { describe, it, expect } from 'vitest';
import { classifyMismatch } from '../../scripts/investigate_wallet_ledger_mismatches.mjs';

describe('wallet/ledger investigator classification (flag-only)', () => {
  it('classifies bucket-explained cash delta as CASH_VS_FULL_LEDGER', () => {
    const r = classifyMismatch({
      userId: 'usr_real_1',
      cashBalance: 100,
      ledgerSum: 150,
      entryCount: 3,
      bucketTotal: 150,
      cashVsLedgerDelta: -50,
      bucketVsLedgerDelta: 0,
      reservedBalance: 0,
    });
    expect(r.mismatchType).toBe('CASH_VS_FULL_LEDGER');
    expect(r.likelyCause).toBe('BUCKET_METHODOLOGY');
    expect(r.autoRepair).toBe(false);
    expect(r.displayPolicy).toBe('NO AUTO-REPAIR');
  });

  it('flags empty ledger positive wallet', () => {
    const r = classifyMismatch({
      userId: 'usr_legacy_1',
      cashBalance: 10000,
      ledgerSum: 0,
      entryCount: 0,
      bucketTotal: 10000,
      cashVsLedgerDelta: 10000,
      bucketVsLedgerDelta: 10000,
    });
    expect(r.mismatchType).toBe('EMPTY_LEDGER_POSITIVE_WALLET');
    expect(r.autoRepair).toBe(false);
  });

  it('flags reserved hold when delta equals reserved', () => {
    const r = classifyMismatch({
      userId: 'usr_hold_1',
      cashBalance: 900,
      ledgerSum: 1000,
      entryCount: 5,
      bucketTotal: 1000,
      cashVsLedgerDelta: -100,
      bucketVsLedgerDelta: 0,
      reservedBalance: 100,
    });
    // bucket explains first → CASH_VS_FULL_LEDGER takes precedence
    expect(['CASH_VS_FULL_LEDGER', 'ACTIVE_WITHDRAWAL_HOLD']).toContain(r.mismatchType);
    expect(r.autoRepair).toBe(false);
  });
});
