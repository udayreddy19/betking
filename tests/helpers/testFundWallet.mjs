/**
 * Non-production test wallet funding for Vitest / E2E harness.
 * Hard-fails if NODE_ENV=production — never seed real money balances via this helper.
 */
import { query } from '../../db/pg.js';

export function assertNonProductionFunding() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('TEST_FUND_FORBIDDEN: test wallet funding is disabled in production');
  }
}

/**
 * Ensure user + wallet exist, then CREDIT `amount` INR with matching transaction + ledger.
 * @returns {{ walletId: string, balance: number }}
 */
export async function fundTestWallet({ userId, walletId, amount, email }) {
  assertNonProductionFunding();
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error('TEST_FUND_INVALID_AMOUNT');
  }
  const wid = walletId || `wal_${userId}`;
  const mail = email || `${userId}@test.local`;

  await query(
    `INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash')
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, mail],
  );
  await query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS winnings_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00`);
  await query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS reserved_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00`);
  await query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS locked_deposit_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00`);

  await query(
    `INSERT INTO wallets (wallet_id, user_id, balance, winnings_balance, locked_deposit_balance, currency)
     VALUES ($1, $2, 0, 0, 0, 'INR')
     ON CONFLICT (wallet_id) DO NOTHING`,
    [wid, userId],
  );
  // If wallet exists under different id for user, reuse it
  const existing = await query(`SELECT wallet_id, balance FROM wallets WHERE user_id = $1 LIMIT 1`, [userId]);
  const resolvedWalletId = existing.rows[0]?.wallet_id || wid;

  await query(
    `UPDATE wallets
     SET balance = balance + $1,
         locked_deposit_balance = COALESCE(locked_deposit_balance, 0) + $1,
         updated_at = NOW()
     WHERE wallet_id = $2`,
    [amt, resolvedWalletId],
  );
  const bal = await query(`SELECT balance FROM wallets WHERE wallet_id = $1`, [resolvedWalletId]);
  const newBal = Number(bal.rows[0].balance);
  const txId = `tx_testfund_${userId}_${Date.now()}`;
  await query(
    `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
     VALUES ($1, $2, 'DEPOSIT', $3, 'SUCCESS', NOW())`,
    [txId, userId, amt],
  );
  await query(
    `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
     VALUES ($1, $2, 'CREDIT', $3, $4, 'Non-prod test fund', NOW())`,
    [resolvedWalletId, txId, amt, newBal],
  );
  return { walletId: resolvedWalletId, balance: newBal, transactionId: txId };
}
