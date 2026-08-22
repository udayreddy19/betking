#!/usr/bin/env node
/**
 * Legacy wallet ↔ ledger opening-balance reconciliation workflow.
 *
 * DEFAULT: dry-run (never mutates).
 *
 * Usage:
 *   node scripts/reconcile-legacy-opening-balances.mjs
 *   node scripts/reconcile-legacy-opening-balances.mjs --user=usr_xxx
 *   node scripts/reconcile-legacy-opening-balances.mjs --user=usr_xxx --dry-run
 *   node scripts/reconcile-legacy-opening-balances.mjs --user=usr_xxx --apply-opening-ledger --actor=admin@x --reason='ops approval ticket-123'
 *   node scripts/reconcile-legacy-opening-balances.mjs --user=usr_xxx --accept-exception --actor=admin@x --reason='accepted legacy seed'
 *
 * Rules:
 * - Never auto-repair.
 * - Never mutate wallets.balance.
 * - Opening ledger CREDIT is immutable audit of pre-ledger cash only.
 * - --accept-exception records reconciliation_cases ACCEPTED without ledger mutation.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, withTransaction } from '../db/pg.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArg(name) {
  const flag = process.argv.find((a) => a.startsWith(`--${name}=`));
  return flag ? flag.split('=').slice(1).join('=') : null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function investigate(userId) {
  const wRes = await query(
    `SELECT wallet_id, user_id, balance,
            COALESCE(reserved_balance,0) AS reserved_balance,
            COALESCE(winnings_balance,0) AS winnings_balance,
            COALESCE(locked_deposit_balance,0) AS locked_deposit_balance
     FROM wallets WHERE user_id = $1`,
    [userId],
  );
  if (!wRes.rows.length) return null;
  const w = wRes.rows[0];
  const lRes = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE 0 END), 0)::float AS credits,
       COALESCE(SUM(CASE WHEN type = 'DEBIT' THEN amount ELSE 0 END), 0)::float AS debits
     FROM ledger_entries WHERE wallet_id = $1`,
    [w.wallet_id],
  );
  const credits = Number(lRes.rows[0].credits);
  const debits = Number(lRes.rows[0].debits);
  const ledgerSum = parseFloat((credits - debits).toFixed(2));
  const stored = Number(w.balance);
  const difference = parseFloat((stored - ledgerSum).toFixed(2));
  let classification = 'RECONCILED';
  if (Math.abs(difference) > 0.009) {
    classification = ledgerSum === 0 && stored > 0
      ? 'LEGACY_PRE_LEDGER_SEED'
      : 'LEGACY_PRE_LEDGER_OPENING_CASH';
  }
  return {
    userId,
    walletId: w.wallet_id,
    storedBalance: stored,
    ledgerSum,
    difference,
    classification,
  };
}

async function acceptException({ row, actor, reason }) {
  const caseId = `recon_accept_${row.walletId}_${Date.now()}`;
  await query(
    `INSERT INTO reconciliation_cases (
       id, reconciliation_type, entity_type, entity_id,
       expected_value, actual_value, difference, currency,
       severity, status, notes
     ) VALUES ($1, 'FINANCIAL_LEDGER', 'WALLET', $2, $3, $4, $5, 'INR', 'HIGH', 'ACCEPTED', $6)`,
    [
      caseId,
      row.walletId,
      row.ledgerSum,
      row.storedBalance,
      row.difference,
      JSON.stringify({
        classification: row.classification,
        accepted_exception: true,
        actor,
        reason,
        timestamp: new Date().toISOString(),
        auto_repair: false,
        balance_mutated: false,
      }),
    ],
  );
  return { caseId };
}

async function applyOpeningLedger({ row, actor, reason }) {
  if (!(row.difference > 0.009)) {
    throw new Error('Opening ledger only applies when stored balance exceeds ledger sum');
  }
  const txId = `tx_opening_${row.walletId}_${Date.now()}`;
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
       VALUES ($1, $2, 'ADJUSTMENT', $3, 'SUCCESS', NOW())`,
      [txId, row.userId, row.difference],
    );
    await client.query(
      `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
       VALUES ($1, $2, 'CREDIT', $3, $4, $5, NOW())`,
      [
        row.walletId,
        txId,
        row.difference,
        row.storedBalance,
        `OPENING_BALANCE_RECONCILIATION actor=${actor} reason=${reason}`,
      ],
    );
    // Explicitly do NOT update wallets.balance
  });
  return { transactionId: txId, credited: row.difference, balanceMutated: false };
}

async function main() {
  const userId = parseArg('user');
  const actor = parseArg('actor');
  const reason = parseArg('reason');
  const apply = hasFlag('apply-opening-ledger');
  const accept = hasFlag('accept-exception');
  const dryRun = !apply && !accept; // default dry-run

  if ((apply || accept) && (!actor || !reason)) {
    console.error(JSON.stringify({
      error: 'actor and reason required for --apply-opening-ledger or --accept-exception',
    }));
    process.exit(1);
  }

  if (!userId) {
    // Delegate scan listing to existing document script (read-only).
    const doc = path.join(__dirname, 'document-ledger-opening-gaps.mjs');
    const r = spawnSync(process.execPath, [doc], { stdio: 'inherit' });
    process.exit(r.status ?? 1);
  }

  const row = await investigate(userId);
  if (!row) {
    console.error(JSON.stringify({ error: 'wallet_not_found', userId }));
    process.exit(1);
  }

  console.log(JSON.stringify({
    event: 'LEGACY_OPENING_BALANCE_INVESTIGATION',
    dryRun,
    apply,
    acceptException: accept,
    ...row,
  }, null, 2));

  if (dryRun) {
    console.log(JSON.stringify({
      event: 'LEGACY_OPENING_BALANCE_DRY_RUN',
      nextSteps: [
        'Ops review classification',
        'Either --apply-opening-ledger --actor= --reason= OR --accept-exception --actor= --reason=',
        'Re-run financial:reconcile --user=...',
      ],
    }, null, 2));
    process.exit(Math.abs(row.difference) > 0.009 ? 2 : 0);
  }

  if (accept) {
    const res = await acceptException({ row, actor, reason });
    console.log(JSON.stringify({ event: 'LEGACY_EXCEPTION_ACCEPTED', ...res, ...row }, null, 2));
    process.exit(0);
  }

  if (apply) {
    const res = await applyOpeningLedger({ row, actor, reason });
    const after = await investigate(userId);
    console.log(JSON.stringify({
      event: 'LEGACY_OPENING_LEDGER_APPLIED',
      ...res,
      before: row,
      after,
    }, null, 2));
    process.exit(Math.abs(after.difference) > 0.009 ? 2 : 0);
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
