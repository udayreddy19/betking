import { describe, it, expect, beforeEach } from 'vitest';
import { query } from '../../db/pg.js';
import { getWithdrawableAmount, allocateCashStake } from '../../lib/wageringRules.mjs';

describe('Deposit wagering lock — withdraw only after bet', () => {
  const walletId = 'wal_deposit_lock';

  beforeEach(async () => {
    await query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS locked_deposit_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00`);
    await query(`DELETE FROM wallets WHERE wallet_id = $1`, [walletId]);
    await query(
      `INSERT INTO wallets (wallet_id, user_id, balance, locked_deposit_balance, currency)
       VALUES ($1, 'usr_deposit_lock', 0, 0, 'INR')`,
      [walletId],
    );
  });

  async function simulateDeposit(amount) {
    await query(
      `UPDATE wallets
       SET balance = balance + $1,
           locked_deposit_balance = COALESCE(locked_deposit_balance, 0) + $1,
           updated_at = NOW()
       WHERE wallet_id = $2`,
      [amount, walletId],
    );
  }

  async function simulateCashBet(stake) {
    const w = await query(
      'SELECT balance, locked_deposit_balance FROM wallets WHERE wallet_id = $1',
      [walletId],
    );
    const wallet = w.rows[0];
    const allocation = allocateCashStake({
      balance: wallet.balance,
      lockedDepositBalance: wallet.locked_deposit_balance,
    }, stake);
    await query(
      `UPDATE wallets
       SET balance = balance - $1,
           locked_deposit_balance = locked_deposit_balance - $2,
           updated_at = NOW()
       WHERE wallet_id = $3`,
      [stake, allocation.fromLocked, walletId],
    );
    return allocation;
  }

  it('deposit is not withdrawable until wagered', async () => {
    await simulateDeposit(1000);

    let w = await query(
      'SELECT balance, locked_deposit_balance, reserved_balance FROM wallets WHERE wallet_id = $1',
      [walletId],
    );
    const deposited = w.rows[0];
    expect(parseFloat(deposited.balance)).toBe(1000);
    expect(parseFloat(deposited.locked_deposit_balance)).toBe(1000);
    expect(getWithdrawableAmount({
      balance: deposited.balance,
      reservedBalance: deposited.reserved_balance,
      lockedDepositBalance: deposited.locked_deposit_balance,
    })).toBe(0);

    const allocation = await simulateCashBet(500);
    expect(allocation.fromLocked).toBe(500);

    w = await query(
      'SELECT balance, locked_deposit_balance, reserved_balance FROM wallets WHERE wallet_id = $1',
      [walletId],
    );
    const afterBet = w.rows[0];
    expect(parseFloat(afterBet.balance)).toBe(500);
    expect(parseFloat(afterBet.locked_deposit_balance)).toBe(500);
    expect(getWithdrawableAmount({
      balance: afterBet.balance,
      reservedBalance: afterBet.reserved_balance,
      lockedDepositBalance: afterBet.locked_deposit_balance,
    })).toBe(0);

    await simulateCashBet(500);
    w = await query(
      'SELECT balance, locked_deposit_balance, reserved_balance FROM wallets WHERE wallet_id = $1',
      [walletId],
    );
    const fullyWagered = w.rows[0];
    expect(parseFloat(fullyWagered.locked_deposit_balance)).toBe(0);
    // Once the full deposit is wagered, any remaining cash (e.g. winnings) is withdrawable.
    await query(`UPDATE wallets SET balance = balance + 1500 WHERE wallet_id = $1`, [walletId]);
    w = await query(
      'SELECT balance, locked_deposit_balance, reserved_balance FROM wallets WHERE wallet_id = $1',
      [walletId],
    );
    const afterWin = w.rows[0];
    expect(getWithdrawableAmount({
      balance: afterWin.balance,
      reservedBalance: afterWin.reserved_balance,
      lockedDepositBalance: afterWin.locked_deposit_balance,
    })).toBe(1500);
  });
});
