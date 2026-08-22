#!/usr/bin/env node
/**
 * Document (do NOT silently repair) wallet↔ledger opening-balance gaps.
 *
 * Usage (read-only by default):
 *   node scripts/document-ledger-opening-gaps.mjs
 *   node scripts/document-ledger-opening-gaps.mjs --user=usr_xxx
 *
 * Optional immutable opening-balance ledger credit (operator only):
 *   node scripts/document-ledger-opening-gaps.mjs --user=usr_xxx --apply-opening-ledger --actor=admin@oddsyra
 *
 * --apply-opening-ledger inserts ONE CREDIT ledger row:
 *   type=OPENING_BALANCE_RECONCILIATION
 * with full audit fields — never updates wallets.balance directly.
 */

import { query, withTransaction } from '../db/pg.js';

function parseArg(name) {
  const flag = process.argv.find((a) => a.startsWith(`--${name}=`));
  return flag ? flag.split('=').slice(1).join('=') : null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function investigateWallet(userId) {
  const wRes = await query(
    `SELECT wallet_id, user_id, balance,
            COALESCE(reserved_balance,0) AS reserved_balance,
            COALESCE(winnings_balance,0) AS winnings_balance,
            COALESCE(locked_deposit_balance,0) AS locked_deposit_balance,
            COALESCE(bonus_balance,0) AS bonus_balance
     FROM wallets WHERE user_id = $1`,
    [userId],
  );
  if (!wRes.rows.length) return null;
  const w = wRes.rows[0];

  const lRes = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE 0 END), 0)::float AS credits,
       COALESCE(SUM(CASE WHEN type = 'DEBIT' THEN amount ELSE 0 END), 0)::float AS debits,
       COUNT(*)::int AS rows,
       MIN(created_at) AS first_at,
       MAX(created_at) AS last_at
     FROM ledger_entries WHERE wallet_id = $1`,
    [w.wallet_id],
  );
  const credits = Number(lRes.rows[0].credits);
  const debits = Number(lRes.rows[0].debits);
  const ledgerSum = parseFloat((credits - debits).toFixed(2));
  const stored = Number(w.balance);
  const difference = parseFloat((stored - ledgerSum).toFixed(2));

  const txRes = await query(
    `SELECT type, COUNT(*)::int AS c, COALESCE(SUM(amount),0)::float AS sum
     FROM transactions WHERE user_id = $1 GROUP BY type ORDER BY type`,
    [userId],
  );
  const betsRes = await query(
    `SELECT status, COUNT(*)::int AS c, COALESCE(SUM(stake),0)::float AS stake_sum
     FROM bets WHERE user_id = $1 GROUP BY status ORDER BY status`,
    [userId],
  );
  const firstCashDebit = await query(
    `SELECT amount, balance_after, description, created_at, transaction_id
     FROM ledger_entries
     WHERE wallet_id = $1 AND type = 'DEBIT' AND description ILIKE '%(cash)%'
     ORDER BY created_at ASC LIMIT 1`,
    [w.wallet_id],
  );
  const deposits = await query(`SELECT COUNT(*)::int AS c FROM deposits WHERE user_id = $1`, [userId]);
  const withdrawals = await query(`SELECT COUNT(*)::int AS c FROM withdrawals WHERE user_id = $1`, [userId]);

  let rootCause = 'UNEXPLAINED';
  let recommendedResolution = 'ADMIN_INVESTIGATE';
  let financialRisk = 'HIGH';

  if (Math.abs(difference) < 0.01) {
    rootCause = 'RECONCILED';
    recommendedResolution = 'NONE';
    financialRisk = 'NONE';
  } else if (Number(lRes.rows[0].rows) === 0 && stored > 0 && Number(deposits.rows[0].c) === 0) {
    rootCause = 'LEGACY_PRE_LEDGER_SEED';
    recommendedResolution = 'DOCUMENT_THEN_OPENING_BALANCE_LEDGER';
    financialRisk = 'MEDIUM';
  } else if (difference > 0 && firstCashDebit.rows[0]) {
    const pre = Number(firstCashDebit.rows[0].balance_after) + Number(firstCashDebit.rows[0].amount);
    if (Math.abs(pre - difference) < 1 || Math.abs(difference - 9900) < 0.01 || Math.abs(difference - 10000) < 0.01) {
      rootCause = 'LEGACY_PRE_LEDGER_OPENING_CASH';
      recommendedResolution = 'DOCUMENT_THEN_OPENING_BALANCE_LEDGER';
      financialRisk = 'MEDIUM';
    }
  }

  return {
    wallet_id: w.wallet_id,
    user_id: userId,
    stored_balance: stored,
    reserved_balance: Number(w.reserved_balance),
    winnings_balance: Number(w.winnings_balance),
    locked_deposit_balance: Number(w.locked_deposit_balance),
    bonus_balance: Number(w.bonus_balance),
    ledger_credits: credits,
    ledger_debits: debits,
    ledger_balance: ledgerSum,
    difference,
    first_mismatch_timestamp: lRes.rows[0].first_at || null,
    first_cash_debit: firstCashDebit.rows[0] || null,
    deposit_count: Number(deposits.rows[0].c),
    withdrawal_count: Number(withdrawals.rows[0].c),
    transactions_by_type: txRes.rows,
    bets_by_status: betsRes.rows,
    root_cause: rootCause,
    recommended_resolution: recommendedResolution,
    financial_risk: financialRisk,
  };
}

async function documentCase(row) {
  if (row.root_cause === 'RECONCILED') return null;
  const caseId = `recon_${row.wallet_id}_${Date.now()}`;
  await query(
    `INSERT INTO reconciliation_cases (
       id, reconciliation_type, entity_type, entity_id,
       expected_value, actual_value, difference, currency,
       severity, status, notes
     ) VALUES ($1, 'FINANCIAL_LEDGER', 'WALLET', $2, $3, $4, $5, 'INR', $6, 'INVESTIGATING', $7)
     ON CONFLICT (id) DO NOTHING`,
    [
      caseId,
      row.wallet_id,
      row.ledger_balance,
      row.stored_balance,
      row.difference,
      row.financial_risk === 'HIGH' ? 'CRITICAL' : 'HIGH',
      JSON.stringify({
        root_cause: row.root_cause,
        recommended_resolution: row.recommended_resolution,
        first_cash_debit: row.first_cash_debit,
        deposit_count: row.deposit_count,
        auto_repair: false,
      }),
    ],
  );

  const discId = `disc_doc_${row.wallet_id}_${Date.now()}`;
  await query(
    `INSERT INTO financial_discrepancies (
       discrepancy_id, user_id, wallet_id, type, stored_balance, ledger_balance,
       difference, status, details, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'CLASSIFIED', $8, NOW())`,
    [
      discId,
      row.user_id,
      row.wallet_id,
      row.root_cause,
      row.stored_balance,
      row.ledger_balance,
      row.difference,
      JSON.stringify({ reconciliationCaseId: caseId, ...row }),
    ],
  );
  return { caseId, discId };
}

async function applyOpeningLedger(row, actor) {
  if (!['LEGACY_PRE_LEDGER_SEED', 'LEGACY_PRE_LEDGER_OPENING_CASH'].includes(row.root_cause)) {
    throw new Error(`Cannot apply opening ledger for root_cause=${row.root_cause}`);
  }
  if (!(row.difference > 0.009)) {
    throw new Error('No positive opening gap to ledger');
  }
  const txId = `tx_opening_recon_${row.wallet_id}`;
  return withTransaction(async (client) => {
    const exists = await client.query(
      `SELECT 1 FROM transactions WHERE transaction_id = $1`,
      [txId],
    );
    if (exists.rows.length) {
      return { applied: false, reason: 'ALREADY_APPLIED', txId };
    }
    // Do NOT mutate wallets.balance — only append immutable ledger CREDIT so sum matches stored.
    await client.query(
      `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
       VALUES ($1, $2, 'OPENING_BALANCE_RECONCILIATION', $3, 'SUCCESS', NOW())`,
      [txId, row.user_id, row.difference],
    );
    await client.query(
      `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
       VALUES ($1, $2, 'CREDIT', $3, $4, $5, NOW())`,
      [
        row.wallet_id,
        txId,
        row.difference,
        row.stored_balance,
        `Opening balance reconciliation (immutable). Actor=${actor}. Gap=${row.difference}. Root=${row.root_cause}. No wallet.balance mutation.`,
      ],
    );
    await client.query(
      `UPDATE reconciliation_cases
       SET status = 'RESOLVED', resolved_at = NOW(),
           resolution = $1, assigned_to = $2
       WHERE entity_id = $3 AND reconciliation_type = 'FINANCIAL_LEDGER' AND status = 'INVESTIGATING'`,
      [
        `OPENING_BALANCE_RECONCILIATION ${txId} amount=${row.difference}`,
        actor,
        row.wallet_id,
      ],
    );
    return { applied: true, txId, amount: row.difference, walletBalanceUnchanged: row.stored_balance };
  });
}

async function main() {
  const userFilter = parseArg('user');
  const apply = hasFlag('apply-opening-ledger');
  const actor = parseArg('actor') || 'system';

  const users = userFilter
    ? [{ user_id: userFilter }]
    : (await query('SELECT user_id FROM wallets ORDER BY user_id')).rows;

  const report = {
    event: 'LEDGER_OPENING_GAP_INVESTIGATION',
    scannedAt: new Date().toISOString(),
    applyMode: apply,
    wallets: [],
  };

  for (const u of users) {
    const row = await investigateWallet(u.user_id);
    if (!row) continue;
    if (Math.abs(row.difference) < 0.01 && row.root_cause === 'RECONCILED') {
      report.wallets.push(row);
      continue;
    }
    const docs = await documentCase(row);
    let applyResult = null;
    if (apply && row.difference > 0.009) {
      applyResult = await applyOpeningLedger(row, actor);
    }
    report.wallets.push({ ...row, documentation: docs, applyResult });
  }

  const unexplained = report.wallets.filter((w) => w.root_cause === 'UNEXPLAINED' && Math.abs(w.difference) > 0.01);
  console.log(JSON.stringify({ ...report, unexplainedCount: unexplained.length }, null, 2));
  process.exit(unexplained.length === 0 ? 0 : 2);
}

main().catch((err) => {
  console.error(JSON.stringify({ event: 'LEDGER_OPENING_GAP_ERROR', message: err.message }));
  process.exit(1);
});
