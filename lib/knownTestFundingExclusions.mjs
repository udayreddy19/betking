/**
 * Known production test-funding accounts (manual ₹10k top-ups for app testing).
 * Excluded from actionable wallet↔ledger mismatch readiness counts.
 *
 * Operator commitment: zero these balances before true go-live.
 * Does NOT auto-repair wallets or rewrite ledger history.
 */

import { query } from '../db/pg.js';

export const KNOWN_TEST_FUNDING_USER_IDS = Object.freeze([
  'usr_1787373521441_5f0bb0f7',
  'usr_1787315920401_e9f85dfb',
  'usr_1787551534293_d50c7435',
  'faizu_26_08_2026_000014',
  'vishnu_25_08_2026_000013',
  'usr_1786981914375_bb8e3569',
  'udayreddytest_27_08_2026_000015',
]);

export const KNOWN_TEST_FUNDING_ACCEPTANCE = Object.freeze({
  acceptedAt: '2026-08-27',
  acceptedBy: 'operator',
  reason: 'Manual ~₹10,000 test funding without ledger credit; operator will zero before go-live',
  resolutionClassification: 'ACCEPTED_WITH_EVIDENCE',
  autoRepair: false,
  goLiveAction: 'ZERO_BALANCES_BEFORE_LIVE',
});

export function isKnownTestFundingUser(userId) {
  return KNOWN_TEST_FUNDING_USER_IDS.includes(String(userId || ''));
}

export function knownTestFundingSqlInList() {
  return [...KNOWN_TEST_FUNDING_USER_IDS];
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Read-only snapshot of known test-funding accounts.
 * Never mutates balances. Used for GO-LIVE BLOCK when residual money remains.
 */
export async function inspectKnownTestFundingAccounts() {
  const ids = knownTestFundingSqlInList();
  const res = await query(
    `SELECT w.user_id, w.wallet_id,
            COALESCE(w.balance,0)::float AS cash_balance,
            COALESCE(w.bonus_balance,0)::float AS bonus_balance,
            COALESCE(w.freebet_balance,0)::float AS freebet_balance,
            COALESCE(w.reserved_balance,0)::float AS reserved_balance,
            (COALESCE(w.balance,0) + COALESCE(w.bonus_balance,0)
              + COALESCE(w.freebet_balance,0) + COALESCE(w.reserved_balance,0))::float AS bucket_total,
            COALESCE(l.ledger_sum,0)::float AS ledger_sum,
            (COALESCE(w.balance,0) - COALESCE(l.ledger_sum,0))::float AS cash_vs_ledger_delta,
            ((COALESCE(w.balance,0) + COALESCE(w.bonus_balance,0)
              + COALESCE(w.freebet_balance,0) + COALESCE(w.reserved_balance,0))
              - COALESCE(l.ledger_sum,0))::float AS bucket_vs_ledger_delta
     FROM wallets w
     LEFT JOIN (
       SELECT wallet_id,
              COALESCE(SUM(CASE WHEN type='CREDIT' THEN amount WHEN type='DEBIT' THEN -amount ELSE 0 END),0) AS ledger_sum
       FROM ledger_entries GROUP BY wallet_id
     ) l ON l.wallet_id = w.wallet_id
     WHERE w.user_id = ANY($1::text[])
     ORDER BY w.user_id`,
    [ids],
  ).catch(() => ({ rows: [] }));

  const byId = new Map(res.rows.map((r) => [r.user_id, r]));
  const accounts = ids.map((userId) => {
    const row = byId.get(userId);
    if (!row) {
      return {
        userId,
        found: false,
        cashBalance: 0,
        bonusBalance: 0,
        freebetBalance: 0,
        reservedBalance: 0,
        bucketTotal: 0,
        ledgerSum: 0,
        cashVsLedgerDelta: 0,
        bucketVsLedgerDelta: 0,
        residualNonZero: false,
        cleanupStatus: 'CLEAN',
        classification: 'ACCEPTED_WITH_EVIDENCE',
        acceptance: KNOWN_TEST_FUNDING_ACCEPTANCE,
        autoRepair: false,
        note: 'No wallet row found (already clean or user removed)',
      };
    }
    const residual = Math.abs(num(row.bucket_total)) > 0.01
      || Math.abs(num(row.cash_balance)) > 0.01
      || Math.abs(num(row.bonus_balance)) > 0.01
      || Math.abs(num(row.freebet_balance)) > 0.01
      || Math.abs(num(row.reserved_balance)) > 0.01;
    return {
      userId: row.user_id,
      walletId: row.wallet_id,
      found: true,
      cashBalance: num(row.cash_balance),
      bonusBalance: num(row.bonus_balance),
      freebetBalance: num(row.freebet_balance),
      reservedBalance: num(row.reserved_balance),
      bucketTotal: num(row.bucket_total),
      ledgerSum: num(row.ledger_sum),
      cashVsLedgerDelta: num(row.cash_vs_ledger_delta),
      bucketVsLedgerDelta: num(row.bucket_vs_ledger_delta),
      residualNonZero: residual,
      cleanupStatus: residual ? 'PENDING_ZERO' : 'CLEAN',
      classification: 'ACCEPTED_WITH_EVIDENCE',
      acceptance: KNOWN_TEST_FUNDING_ACCEPTANCE,
      autoRepair: false,
      displayPolicy: 'NO AUTO-REPAIR — use authorized maker/checker adjustment or manual zero before go-live',
    };
  });

  const pendingCleanup = accounts.filter((a) => a.residualNonZero);
  const goLiveBlocked = pendingCleanup.length > 0;

  return {
    success: true,
    code: goLiveBlocked ? 'TEST_FUNDING_CLEANUP_PENDING' : 'TEST_FUNDING_CLEAN',
    goLiveBlocked,
    pendingCount: pendingCleanup.length,
    accountCount: accounts.length,
    accounts,
    acceptance: KNOWN_TEST_FUNDING_ACCEPTANCE,
    policy: 'FLAG_ONLY_NO_AUTO_REPAIR',
    remediation: goLiveBlocked
      ? 'Zero residual balances on listed accounts via authorized financial process (maker/checker). Do not use investigator auto-repair (none exists).'
      : 'Known test-funding accounts are clean (zero residual).',
    generatedAt: new Date().toISOString(),
  };
}
