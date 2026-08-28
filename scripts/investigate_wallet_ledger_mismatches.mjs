#!/usr/bin/env node
/**
 * Read-only wallet↔ledger mismatch investigation.
 * NEVER mutates wallets or ledger. Writes JSON evidence for ops review.
 *
 * Usage:
 *   node scripts/investigate_wallet_ledger_mismatches.mjs
 *   node scripts/investigate_wallet_ledger_mismatches.mjs --limit=50
 *   DATABASE_URL=... node scripts/investigate_wallet_ledger_mismatches.mjs --out=docs/evidence/...
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { query } from '../db/pg.js';
import { isKnownTestFundingUser, KNOWN_TEST_FUNDING_ACCEPTANCE } from '../lib/knownTestFundingExclusions.mjs';
import { assertAutoRepairDisabled } from '../lib/testEnvGuard.mjs';

dotenv.config();

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function isFixtureLike(userId) {
  return /^(usr_|user_)(dfb|tdfb|g2e|dbg|conc|ref_|mc_|idem|stress|val_test|payout|test)/i.test(userId)
    || /_(test|conc|stress|idem|g2e|dbg)_/i.test(userId);
}

/**
 * Classify mismatch. Prefer CASH_VS_FULL_LEDGER when buckets explain cash≠ledger.
 * Never implies auto-repair.
 */
export function classifyMismatch({
  userId,
  cashBalance,
  ledgerSum,
  entryCount,
  bucketTotal,
  cashVsLedgerDelta,
  bucketVsLedgerDelta,
  reservedBalance = 0,
  txByType = {},
}) {
  const fixtureLike = isFixtureLike(userId);
  const cashDelta = Number(cashVsLedgerDelta ?? (cashBalance - ledgerSum));
  const bucketDelta = Number(bucketVsLedgerDelta ?? (bucketTotal - ledgerSum));
  const absCash = Math.abs(cashDelta);
  const absBucket = Math.abs(bucketDelta);

  // Buckets explain cash-vs-ledger — not a cash defect
  if (absCash > 0.01 && absBucket < 0.01) {
    return {
      mismatchType: 'CASH_VS_FULL_LEDGER',
      likelyCause: 'BUCKET_METHODOLOGY',
      financialRisk: 'LOW',
      investigationStatus: 'BUCKET_METHODOLOGY',
      autoRepair: false,
      displayPolicy: 'NO AUTO-REPAIR',
    };
  }

  if (Number(reservedBalance) > 0.01 && absCash > 0.01
    && Math.abs(cashDelta - Number(reservedBalance)) < 0.01) {
    return {
      mismatchType: 'ACTIVE_WITHDRAWAL_HOLD',
      likelyCause: 'RESERVED_BALANCE_HOLD',
      financialRisk: 'LOW',
      investigationStatus: 'ACTIVE_TRANSACTION',
      autoRepair: false,
      displayPolicy: 'NO AUTO-REPAIR',
    };
  }

  if (entryCount === 0 && cashBalance > 0.01) {
    return {
      mismatchType: 'EMPTY_LEDGER_POSITIVE_WALLET',
      likelyCause: fixtureLike ? 'FIXTURE_OR_SEED_WITHOUT_LEDGER' : 'LEGACY_PRE_LEDGER_OR_MIGRATION',
      financialRisk: fixtureLike ? 'LOW' : 'MEDIUM',
      investigationStatus: fixtureLike ? 'ACCEPTED_WITH_EVIDENCE' : 'OPENING_BALANCE_GAP',
      autoRepair: false,
      displayPolicy: 'NO AUTO-REPAIR',
    };
  }

  if (entryCount > 0 && cashBalance === 0 && ledgerSum > 0.01) {
    return {
      mismatchType: 'WALLET_ZERO_LEDGER_POSITIVE',
      likelyCause: fixtureLike
        ? 'TEST_FIXTURE_RESET_WALLET_WITHOUT_LEDGER_REVERSAL'
        : 'MISSING_WALLET_UPDATE_OR_EXTRA_LEDGER_CREDIT',
      financialRisk: fixtureLike ? 'LOW' : 'HIGH',
      investigationStatus: 'OPEN',
      autoRepair: false,
      displayPolicy: 'NO AUTO-REPAIR',
    };
  }

  if (ledgerSum < -0.01) {
    const debitHeavy = (txByType.BET_STAKE || 0) > 0 && !(txByType.DEPOSIT > 0);
    return {
      mismatchType: 'NEGATIVE_LEDGER_SUM',
      likelyCause: fixtureLike
        ? 'TEST_DEBIT_WITHOUT_MATCHING_CREDIT_OR_BALANCE_RESET'
        : (debitHeavy ? 'POSSIBLE_MISSING_CREDIT' : 'POSSIBLE_DUPLICATE_DEBIT'),
      financialRisk: fixtureLike ? 'LOW' : 'HIGH',
      investigationStatus: debitHeavy ? 'DUPLICATE_OR_MISSING_ENTRY' : 'OPEN',
      autoRepair: false,
      displayPolicy: 'NO AUTO-REPAIR',
    };
  }

  if (cashDelta > 0.01) {
    const openingHint = entryCount > 0 && absBucket > absCash * 0.5;
    return {
      mismatchType: 'WALLET_GT_LEDGER',
      likelyCause: fixtureLike
        ? 'TEST_FIXTURE_IMBALANCE'
        : (openingHint ? 'OPENING_BALANCE_GAP' : 'MISSING_LEDGER_EVENT_OR_OPENING_BALANCE'),
      financialRisk: fixtureLike ? 'LOW' : 'HIGH',
      investigationStatus: openingHint ? 'HISTORICAL_OPENING_BALANCE' : 'OPEN',
      autoRepair: false,
      displayPolicy: 'NO AUTO-REPAIR',
    };
  }

  return {
    mismatchType: 'WALLET_LT_LEDGER',
    likelyCause: fixtureLike ? 'TEST_FIXTURE_IMBALANCE' : 'EXTRA_LEDGER_OR_UNAPPLIED_WALLET_DEBIT',
    financialRisk: fixtureLike ? 'LOW' : 'HIGH',
    investigationStatus: 'OPEN',
    autoRepair: false,
    displayPolicy: 'NO AUTO-REPAIR',
  };
}

async function main() {
  assertAutoRepairDisabled(process.argv);
  const AUTO_REPAIR = false;
  if (AUTO_REPAIR) throw new Error("AUTO_REPAIR_FORBIDDEN");
  const limit = Math.min(500, Math.max(1, Number(arg('limit', '100')) || 100));
  const outPath = arg('out', path.join(process.cwd(), 'docs', 'evidence', `wallet_ledger_mismatch_${new Date().toISOString().replace(/[:.]/g, '-')}.json`));

  const rows = await query(`
    SELECT w.user_id, w.wallet_id,
           COALESCE(w.balance,0)::float AS cash_balance,
           COALESCE(w.balance,0)::float AS wallet_balance,
           COALESCE(w.bonus_balance,0)::float AS bonus_balance,
           COALESCE(w.freebet_balance,0)::float AS freebet_balance,
           COALESCE(w.reserved_balance,0)::float AS reserved_balance,
           (COALESCE(w.balance,0) + COALESCE(w.bonus_balance,0)
             + COALESCE(w.freebet_balance,0) + COALESCE(w.reserved_balance,0))::float AS bucket_total,
           COALESCE(l.ledger_sum,0)::float AS ledger_sum,
           (COALESCE(w.balance,0) - COALESCE(l.ledger_sum,0))::float AS cash_vs_ledger_delta,
           ((COALESCE(w.balance,0) + COALESCE(w.bonus_balance,0)
             + COALESCE(w.freebet_balance,0) + COALESCE(w.reserved_balance,0))
             - COALESCE(l.ledger_sum,0))::float AS bucket_vs_ledger_delta,
           COALESCE(l.entry_count,0)::int AS ledger_entry_count,
           COALESCE(l.entry_count,0)::int AS ledger_rows
    FROM wallets w
    LEFT JOIN (
      SELECT wallet_id,
             COALESCE(SUM(CASE WHEN type='CREDIT' THEN amount WHEN type='DEBIT' THEN -amount ELSE 0 END),0) AS ledger_sum,
             COUNT(*)::int AS entry_count
      FROM ledger_entries GROUP BY wallet_id
    ) l ON l.wallet_id = w.wallet_id
    WHERE ABS(COALESCE(w.balance,0) - COALESCE(l.ledger_sum,0)) > 0.01
    ORDER BY ABS(COALESCE(w.balance,0) - COALESCE(l.ledger_sum,0)) DESC
    LIMIT $1
  `, [limit]);

  const totalRes = await query(`
    SELECT COUNT(*)::int AS c from wallets w
    LEFT JOIN (
      SELECT wallet_id,
             COALESCE(SUM(CASE WHEN type='CREDIT' THEN amount WHEN type='DEBIT' THEN -amount ELSE 0 END),0) AS ledger_sum
      FROM ledger_entries GROUP BY wallet_id
    ) l ON l.wallet_id = w.wallet_id
    WHERE ABS(COALESCE(w.balance,0) - COALESCE(l.ledger_sum,0)) > 0.01
  `);

  const investigated = [];
  for (const row of rows.rows) {
    const tx = await query(
      `SELECT type, COUNT(*)::int AS c, COALESCE(SUM(amount),0)::float AS sum
       FROM transactions WHERE user_id = $1 GROUP BY type ORDER BY type`,
      [row.user_id],
    ).catch(() => ({ rows: [] }));

    const txByType = {};
    let deposits = 0;
    let withdrawals = 0;
    let bets = 0;
    let settlements = 0;
    let promotionCredits = 0;
    for (const t of tx.rows) {
      txByType[t.type] = t.sum;
      const typ = String(t.type || '').toUpperCase();
      if (typ === 'DEPOSIT') deposits = t.sum;
      if (typ.includes('WITHDRAW')) withdrawals += t.sum;
      if (typ === 'BET_STAKE') bets = t.sum;
      if (typ.includes('WIN') || typ.includes('SETTLE') || typ === 'CASHOUT') settlements += t.sum;
      if (typ.includes('BONUS') || typ.includes('PROMO') || typ.includes('FREEBET') || typ.includes('REFERRAL')) {
        promotionCredits += t.sum;
      }
    }

    const wdHold = await query(
      `SELECT COUNT(*)::int AS c FROM withdrawals
       WHERE user_id = $1 AND UPPER(status) IN ('PENDING','PENDING_REVIEW','HOLD','ON_HOLD','PENDING_CHECKER')`,
      [row.user_id],
    ).catch(() => ({ rows: [{ c: 0 }] }));

    const cls = classifyMismatch({
      userId: row.user_id,
      cashBalance: row.cash_balance,
      ledgerSum: row.ledger_sum,
      entryCount: row.ledger_entry_count,
      bucketTotal: row.bucket_total,
      cashVsLedgerDelta: row.cash_vs_ledger_delta,
      bucketVsLedgerDelta: row.bucket_vs_ledger_delta,
      reservedBalance: row.reserved_balance,
      txByType,
    });

    if (isKnownTestFundingUser(row.user_id)) {
      cls.mismatchType = cls.mismatchType || 'WALLET_GT_LEDGER';
      cls.likelyCause = 'KNOWN_OPERATOR_TEST_FUNDING';
      cls.investigationStatus = 'ACCEPTED_WITH_EVIDENCE';
      cls.financialRisk = 'LOW';
      cls.acceptedExclusion = KNOWN_TEST_FUNDING_ACCEPTANCE;
    }

    if (Number(wdHold.rows[0]?.c) > 0 && cls.mismatchType !== 'CASH_VS_FULL_LEDGER') {
      if (Number(row.reserved_balance) > 0.01) {
        cls.mismatchType = 'ACTIVE_WITHDRAWAL_HOLD';
        cls.investigationStatus = 'ACTIVE_TRANSACTION';
        cls.financialRisk = 'LOW';
      }
    }

    investigated.push({
      userId: row.user_id,
      walletId: row.wallet_id,
      cashBalance: row.cash_balance,
      bonusBalance: row.bonus_balance,
      freebetBalance: row.freebet_balance,
      reservedBalance: row.reserved_balance,
      bucketTotal: row.bucket_total,
      ledgerSum: row.ledger_sum,
      cashVsLedgerDelta: row.cash_vs_ledger_delta,
      bucketVsLedgerDelta: row.bucket_vs_ledger_delta,
      ledgerEntryCount: row.ledger_entry_count,
      deposits,
      withdrawals,
      bets,
      settlements,
      promotionCredits,
      openingBalanceIndicator: cls.investigationStatus === 'HISTORICAL_OPENING_BALANCE'
        || cls.investigationStatus === 'OPENING_BALANCE_GAP'
        || cls.mismatchType === 'EMPTY_LEDGER_POSITIVE_WALLET',
      activeWithdrawalHolds: Number(wdHold.rows[0]?.c) || 0,
      delta: row.cash_vs_ledger_delta,
      ...cls,
      methodologyNote: Math.abs(Number(row.bucket_vs_ledger_delta) || 0) < 0.01
        ? 'CASH_VS_FULL_LEDGER_EXPLAINED_BY_BUCKETS'
        : (Math.abs(Number(row.bucket_vs_ledger_delta) || 0) < Math.abs(Number(row.cash_vs_ledger_delta) || 0)
          ? 'PARTIAL_BUCKET_EXPLANATION'
          : 'OPENING_OR_TRUE_GAP'),
      autoRepair: false,
      displayPolicy: 'NO AUTO-REPAIR',
      transactionsByType: tx.rows,
      note: 'Flag-only investigation. Do not auto-repair wallet or rewrite ledger history.',
    });
  }

  const acceptedSample = investigated.filter((r) => isKnownTestFundingUser(r.userId)
    || r.investigationStatus === 'ACCEPTED_WITH_EVIDENCE');
  const actionableSample = investigated.filter((r) => !isKnownTestFundingUser(r.userId)
    && r.investigationStatus !== 'ACCEPTED_WITH_EVIDENCE');
  const summary = {
    event: 'WALLET_LEDGER_MISMATCH_INVESTIGATION',
    scannedAt: new Date().toISOString(),
    AUTO_REPAIR: false,
    totalMismatches: Number(totalRes.rows[0].c),
    RAW_MISMATCH_COUNT: Number(totalRes.rows[0].c),
    ACTIONABLE_MISMATCH_COUNT: actionableSample.length,
    ACCEPTED_MISMATCH_COUNT: acceptedSample.length,
    sampleSize: investigated.length,
    note: 'Accepted exclusions affect readiness classification only; raw evidence always retained',
    byType: investigated.reduce((acc, r) => {
      acc[r.mismatchType] = (acc[r.mismatchType] || 0) + 1;
      return acc;
    }, {}),
    byCause: investigated.reduce((acc, r) => {
      acc[r.likelyCause] = (acc[r.likelyCause] || 0) + 1;
      return acc;
    }, {}),
    byInvestigationStatus: investigated.reduce((acc, r) => {
      acc[r.investigationStatus] = (acc[r.investigationStatus] || 0) + 1;
      return acc;
    }, {}),
    policy: 'FLAG_ONLY_NO_AUTO_REPAIR',
    displayPolicy: 'NO AUTO-REPAIR',
    relatedTools: [
      'scripts/document-ledger-opening-gaps.mjs',
      'scripts/dr_restore_isolated.mjs',
      'lib/reconciliationEngine.mjs',
    ],
    rows: investigated,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({
    event: summary.event,
    totalMismatches: summary.totalMismatches,
    RAW_MISMATCH_COUNT: summary.RAW_MISMATCH_COUNT,
    ACTIONABLE_MISMATCH_COUNT: summary.ACTIONABLE_MISMATCH_COUNT,
    ACCEPTED_MISMATCH_COUNT: summary.ACCEPTED_MISMATCH_COUNT,
    sampleSize: summary.sampleSize,
    byType: summary.byType,
    byCause: summary.byCause,
    byInvestigationStatus: summary.byInvestigationStatus,
    evidenceFile: outPath,
    AUTO_REPAIR: false,
    autoRepair: false,
    displayPolicy: 'NO AUTO-REPAIR',
  }, null, 2));
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(JSON.stringify({ event: 'WALLET_LEDGER_INVESTIGATION_ERROR', message: err.message }));
    process.exit(1);
  });
}
