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
import dotenv from 'dotenv';
import { query } from '../db/pg.js';

dotenv.config();

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function classify(userId, bal, ledgerSum, entryCount) {
  const delta = bal - ledgerSum;
  const fixtureLike = /^(usr_|user_)(dfb|tdfb|g2e|dbg|conc|ref_|mc_|idem|stress|val_test|payout|test)/i.test(userId)
    || /_(test|conc|stress|idem|g2e|dbg)_/i.test(userId);
  if (entryCount === 0 && bal > 0.01) {
    return {
      mismatchType: 'EMPTY_LEDGER_POSITIVE_WALLET',
      likelyCause: fixtureLike ? 'FIXTURE_OR_SEED_WITHOUT_LEDGER' : 'LEGACY_PRE_LEDGER_OR_MIGRATION',
      financialRisk: fixtureLike ? 'LOW' : 'MEDIUM',
    };
  }
  if (entryCount > 0 && bal === 0 && ledgerSum > 0.01) {
    return {
      mismatchType: 'WALLET_ZERO_LEDGER_POSITIVE',
      likelyCause: fixtureLike
        ? 'TEST_FIXTURE_RESET_WALLET_WITHOUT_LEDGER_REVERSAL'
        : 'MISSING_WALLET_UPDATE_OR_EXTRA_LEDGER_CREDIT',
      financialRisk: fixtureLike ? 'LOW' : 'HIGH',
    };
  }
  if (ledgerSum < -0.01) {
    return {
      mismatchType: 'NEGATIVE_LEDGER_SUM',
      likelyCause: fixtureLike
        ? 'TEST_DEBIT_WITHOUT_MATCHING_CREDIT_OR_BALANCE_RESET'
        : 'MISSING_LEDGER_CREDIT_OR_DUPLICATE_DEBIT',
      financialRisk: fixtureLike ? 'LOW' : 'HIGH',
    };
  }
  if (delta > 0.01) {
    return {
      mismatchType: 'WALLET_GT_LEDGER',
      likelyCause: fixtureLike ? 'TEST_FIXTURE_IMBALANCE' : 'MISSING_LEDGER_EVENT_OR_OPENING_BALANCE',
      financialRisk: fixtureLike ? 'LOW' : 'HIGH',
    };
  }
  return {
    mismatchType: 'WALLET_LT_LEDGER',
    likelyCause: fixtureLike ? 'TEST_FIXTURE_IMBALANCE' : 'EXTRA_LEDGER_OR_UNAPPLIED_WALLET_DEBIT',
    financialRisk: fixtureLike ? 'LOW' : 'HIGH',
  };
}

async function main() {
  const limit = Math.min(500, Math.max(1, Number(arg('limit', '100')) || 100));
  const outPath = arg('out', path.join(process.cwd(), 'docs', 'evidence', `wallet_ledger_mismatch_${new Date().toISOString().replace(/[:.]/g, '-')}.json`));

  const rows = await query(`
    SELECT w.user_id, w.wallet_id,
           COALESCE(w.balance,0)::float AS wallet_balance,
           COALESCE(l.ledger_sum,0)::float AS ledger_sum,
           (COALESCE(w.balance,0) - COALESCE(l.ledger_sum,0))::float AS delta,
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
    SELECT COUNT(*)::int AS c FROM wallets w
    LEFT JOIN (
      SELECT wallet_id,
             COALESCE(SUM(CASE WHEN type='CREDIT' THEN amount WHEN type='DEBIT' THEN -amount ELSE 0 END),0) AS ledger_sum
      FROM ledger_entries GROUP BY wallet_id
    ) l ON l.wallet_id = w.wallet_id
    WHERE ABS(COALESCE(w.balance,0) - COALESCE(l.ledger_sum,0)) > 0.01
  `);

  const investigated = [];
  for (const row of rows.rows) {
    const cls = classify(row.user_id, row.wallet_balance, row.ledger_sum, row.ledger_rows);
    const tx = await query(
      `SELECT type, COUNT(*)::int AS c, COALESCE(SUM(amount),0)::float AS sum
       FROM transactions WHERE user_id = $1 GROUP BY type ORDER BY type`,
      [row.user_id],
    ).catch(() => ({ rows: [] }));
    investigated.push({
      ...row,
      ...cls,
      autoRepair: false,
      transactionsByType: tx.rows,
      note: 'Flag-only investigation. Do not auto-repair wallet or rewrite ledger history.',
    });
  }

  const summary = {
    event: 'WALLET_LEDGER_MISMATCH_INVESTIGATION',
    scannedAt: new Date().toISOString(),
    totalMismatches: Number(totalRes.rows[0].c),
    sampleSize: investigated.length,
    byType: investigated.reduce((acc, r) => {
      acc[r.mismatchType] = (acc[r.mismatchType] || 0) + 1;
      return acc;
    }, {}),
    byCause: investigated.reduce((acc, r) => {
      acc[r.likelyCause] = (acc[r.likelyCause] || 0) + 1;
      return acc;
    }, {}),
    policy: 'FLAG_ONLY_NO_AUTO_REPAIR',
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
    sampleSize: summary.sampleSize,
    byType: summary.byType,
    byCause: summary.byCause,
    evidenceFile: outPath,
    autoRepair: false,
  }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(JSON.stringify({ event: 'WALLET_LEDGER_INVESTIGATION_ERROR', message: err.message }));
  process.exit(1);
});
