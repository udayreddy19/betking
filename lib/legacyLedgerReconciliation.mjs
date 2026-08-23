/**
 * Legacy wallet ↔ ledger opening-balance reconciliation (ops workflow).
 * Never auto-repair; never mutate wallets.balance without explicit ops action.
 */

import { query, withTransaction } from '../db/pg.js';

export async function investigateLegacyWallet(userId) {
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

  const accepted = await query(
    `SELECT id, status, notes, detected_at
     FROM reconciliation_cases
     WHERE entity_type = 'WALLET'
       AND entity_id = $1
       AND reconciliation_type = 'FINANCIAL_LEDGER'
       AND status IN ('ACCEPTED', 'RESOLVED')
     ORDER BY detected_at DESC
     LIMIT 1`,
    [w.wallet_id],
  );

  return {
    userId,
    walletId: w.wallet_id,
    storedBalance: stored,
    ledgerSum,
    difference,
    classification,
    acceptedException: accepted.rows[0] || null,
  };
}

export async function listLegacyWalletGaps({ limit = 50 } = {}) {
  const res = await query(
    `SELECT w.user_id, w.wallet_id, w.balance,
            COALESCE(SUM(CASE WHEN le.type = 'CREDIT' THEN le.amount ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN le.type = 'DEBIT' THEN le.amount ELSE 0 END), 0) AS ledger_sum
     FROM wallets w
     LEFT JOIN ledger_entries le ON le.wallet_id = w.wallet_id
     GROUP BY w.user_id, w.wallet_id, w.balance
     HAVING ABS(w.balance - (
       COALESCE(SUM(CASE WHEN le.type = 'CREDIT' THEN le.amount ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN le.type = 'DEBIT' THEN le.amount ELSE 0 END), 0)
     )) > 0.009
     ORDER BY w.balance DESC
     LIMIT $1`,
    [limit],
  );

  const rows = [];
  for (const row of res.rows) {
    const detail = await investigateLegacyWallet(row.user_id);
    if (detail) rows.push(detail);
  }
  return rows;
}

export async function acceptLegacyWalletException({ userId, actor, reason }) {
  const row = await investigateLegacyWallet(userId);
  if (!row) {
    throw Object.assign(new Error('Wallet not found'), { status: 404, code: 'WALLET_NOT_FOUND' });
  }
  if (Math.abs(row.difference) <= 0.009) {
    throw Object.assign(new Error('Wallet is already reconciled'), { status: 400, code: 'ALREADY_RECONCILED' });
  }

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
  return { caseId, ...row };
}

export async function applyLegacyOpeningLedger({ userId, actor, reason }) {
  const row = await investigateLegacyWallet(userId);
  if (!row) {
    throw Object.assign(new Error('Wallet not found'), { status: 404, code: 'WALLET_NOT_FOUND' });
  }
  if (!(row.difference > 0.009)) {
    throw Object.assign(new Error('Opening ledger only applies when stored balance exceeds ledger sum'), {
      status: 400,
      code: 'NO_GAP',
    });
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
  });

  const after = await investigateLegacyWallet(userId);
  return { transactionId: txId, credited: row.difference, balanceMutated: false, before: row, after };
}
