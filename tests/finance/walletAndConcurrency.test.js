import { describe, it, expect, beforeAll } from 'vitest';
import { query, withTransaction } from '../../db/pg.js';

describe('Phase 1 Wallet & Concurrency Security Tests', () => {
  const user500 = 'user_conc_500';
  const user800 = 'user_conc_800';

  beforeAll(async () => {
    // Setup Test Users & Wallets
    await query(`
      INSERT INTO users (user_id, email, password_hash)
      VALUES ($1, 'conc500@betking.com', 'hash'), ($2, 'conc800@betking.com', 'hash')
      ON CONFLICT (user_id) DO NOTHING;
    `, [user500, user800]);

    await query(`
      INSERT INTO wallets (wallet_id, user_id, balance, currency)
      VALUES ('wal_conc_500', $1, 500.00, 'INR'), ('wal_conc_800', $2, 800.00, 'INR')
      ON CONFLICT (user_id) DO UPDATE SET balance = EXCLUDED.balance, updated_at = NOW();
    `, [user500, user800]);
  });

  it('should reject negative wallet balance at database level', async () => {
    let errorCaught = false;
    try {
      await query("UPDATE wallets SET balance = -100.00 WHERE user_id = $1", [user500]);
    } catch (err) {
      errorCaught = true;
      expect(err.message).toContain('check_positive_balance');
    }
    expect(errorCaught).toBe(true);

    // Verify balance remains unchanged
    const res = await query("SELECT balance FROM wallets WHERE user_id = $1", [user500]);
    expect(parseFloat(res.rows[0].balance)).toBe(500.00);
  });

  it('CRITICAL: simultaneous ₹400 bets on ₹500 balance — only ONE succeeds, balance becomes ₹100', async () => {
    // Helper function performing atomic stake deduction with FOR UPDATE row locking
    const placeBetStake = async (userId, stake) => {
      try {
        return await withTransaction(async (client) => {
          const walletRes = await client.query('SELECT wallet_id, balance FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
          const wallet = walletRes.rows[0];
          const curBal = parseFloat(wallet.balance);

          if (curBal < stake) {
            throw new Error(`Insufficient balance: ${curBal} < ${stake}`);
          }

          const newBalRes = await client.query(
            'UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE wallet_id = $2 RETURNING balance',
            [stake, wallet.wallet_id]
          );
          const newBal = parseFloat(newBalRes.rows[0].balance);

          // Add transaction & ledger entries
          const betId = `bet_conc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          await client.query('INSERT INTO transactions (transaction_id, user_id, type, amount, status) VALUES ($1, $2, \'BET_STAKE\', $3, \'SUCCESS\')', [`tx_${betId}`, userId, stake]);
          await client.query('INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description) VALUES ($1, $2, \'DEBIT\', $3, $4, \'Bet Stake\')', [wallet.wallet_id, `tx_${betId}`, stake, newBal]);

          return { success: true, newBal };
        });
      } catch (err) {
        return { success: false, error: err.message };
      }
    };

    // Execute two simultaneous bets of ₹400 on ₹500 balance
    const [res1, res2] = await Promise.all([
      placeBetStake(user500, 400.00),
      placeBetStake(user500, 400.00),
    ]);

    const successes = [res1, res2].filter(r => r.success);
    const failures = [res1, res2].filter(r => !r.success);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    // Verify final wallet balance is exactly ₹100 (NEVER negative)
    const finalWal = await query('SELECT balance FROM wallets WHERE user_id = $1', [user500]);
    expect(parseFloat(finalWal.rows[0].balance)).toBe(100.00);
  });

  it('CRITICAL: simultaneous ₹400 bets on ₹800 balance — BOTH succeed, balance becomes ₹0', async () => {
    const placeBetStake = async (userId, stake) => {
      return await withTransaction(async (client) => {
        const walletRes = await client.query('SELECT wallet_id, balance FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
        const wallet = walletRes.rows[0];
        const curBal = parseFloat(wallet.balance);

        if (curBal < stake) {
          throw new Error(`Insufficient balance: ${curBal} < ${stake}`);
        }

        const newBalRes = await client.query(
          'UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE wallet_id = $2 RETURNING balance',
          [stake, wallet.wallet_id]
        );
        return { success: true, newBal: parseFloat(newBalRes.rows[0].balance) };
      });
    };

    const [res1, res2] = await Promise.all([
      placeBetStake(user800, 400.00),
      placeBetStake(user800, 400.00),
    ]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);

    const finalWal = await query('SELECT balance FROM wallets WHERE user_id = $1', [user800]);
    expect(parseFloat(finalWal.rows[0].balance)).toBe(0.00);
  });
});
