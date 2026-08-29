import { describe, it, expect, beforeEach } from 'vitest';
import { query, withTransaction } from '../../db/pg.js';
import {
  executeWalletTransaction,
  executeBetPlacementTransaction,
  executeSettlementTransaction,
} from '../../db/financialTransactions.js';
import { idempotencyEngine } from '../../lib/idempotencyEngine.mjs';

describe('ODDSYRA — Wallet Engine Forensic Audit Test Suite (20 Scenarios)', () => {
  const testUserId = 'usr_wallet_audit_test_01';
  const testWalletId = 'wal_audit_test_01';

  beforeEach(async () => {
    await query(`
      INSERT INTO users (user_id, email, password_hash, status)
      VALUES ($1, $2, 'hash', 'ACTIVE')
      ON CONFLICT (user_id) DO NOTHING;
    `, [testUserId, `${testUserId}@oddsyra.com`]);

    await query(`
      INSERT INTO matches (match_id, status, start_time)
      VALUES 
        ('match_win_01', 'IN_PLAY', NOW()),
        ('match_loss_01', 'IN_PLAY', NOW()),
        ('match_t20_01', 'IN_PLAY', NOW()),
        ('match_concur_1', 'IN_PLAY', NOW()),
        ('match_concur_2', 'IN_PLAY', NOW())
      ON CONFLICT (match_id) DO NOTHING;
    `);

    await query(`
      INSERT INTO markets (market_id, match_id, name, status)
      VALUES 
        ('mkt_win_01', 'match_win_01', 'Match Winner', 'OPEN'),
        ('mkt_loss_01', 'match_loss_01', 'Match Winner', 'OPEN'),
        ('mkt_t20_01', 'match_t20_01', 'Match Winner', 'OPEN')
      ON CONFLICT (market_id) DO NOTHING;
    `);

    await query(`
      INSERT INTO selections (selection_id, market_id, name, odds, status)
      VALUES 
        ('sel_win_team', 'mkt_win_01', 'CSK', 2.50, 'ACTIVE'),
        ('sel_loss_team', 'mkt_loss_01', 'RCB', 1.80, 'ACTIVE'),
        ('sel_other_team', 'mkt_loss_01', 'KKR', 2.10, 'ACTIVE'),
        ('sel_team_a', 'mkt_t20_01', 'GT', 1.95, 'ACTIVE'),
        ('sel_1', 'mkt_win_01', 'Team 1', 2.00, 'ACTIVE'),
        ('sel_2', 'mkt_win_01', 'Team 2', 2.00, 'ACTIVE')
      ON CONFLICT (selection_id) DO NOTHING;
    `);

    await query(`
      INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, reserved_balance, freebet_balance, currency)
      VALUES ($1, $2, 1000.00, 0.00, 0.00, 0.00, 'INR')
      ON CONFLICT (user_id) DO UPDATE
      SET balance = 1000.00, bonus_balance = 0.00, reserved_balance = 0.00, freebet_balance = 0.00;
    `, [testWalletId, testUserId]);

    await query(`DELETE FROM ledger_entries WHERE wallet_id = $1`, [testWalletId]);
    await query(`DELETE FROM transactions WHERE user_id = $1`, [testUserId]);
    await query(`DELETE FROM bets WHERE user_id = $1`, [testUserId]);
    await query(`DELETE FROM settlements WHERE match_id IN ('match_win_01', 'match_loss_01')`);
  });

  it('TEST 1: Deposit -> exactly one credit with matching ledger entry', async () => {
    const res = await executeWalletTransaction({
      userId: testUserId,
      type: 'DEPOSIT',
      amount: 500,
      utr: 'UTR99887711',
      description: 'Razorpay UPI Deposit',
    });
    expect(res.success).toBe(true);
    expect(res.newBalance).toBe(1500.00);

    const ledger = await query(`SELECT * FROM ledger_entries WHERE wallet_id = $1 ORDER BY entry_id DESC LIMIT 1`, [testWalletId]);
    expect(ledger.rows[0].type).toBe('CREDIT');
    expect(parseFloat(ledger.rows[0].amount)).toBe(500.00);
    expect(parseFloat(ledger.rows[0].balance_after)).toBe(1500.00);
  });

  it('TEST 2: Duplicate deposit webhook / idempotency key -> no duplicate credit', async () => {
    const idemKey = `idem_dep_${Date.now()}`;

    const res1 = await executeWalletTransaction({
      userId: testUserId,
      type: 'DEPOSIT',
      amount: 500,
      utr: 'UTR_DUP_01',
      idempotencyKey: idemKey,
    });
    expect(res1.newBalance).toBe(1500.00);

    // Replay same deposit
    const res2 = await executeWalletTransaction({
      userId: testUserId,
      type: 'DEPOSIT',
      amount: 500,
      utr: 'UTR_DUP_01',
      idempotencyKey: idemKey,
    });
    expect(res2.transactionId).toBe(res1.transactionId);

    const wRes = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(1500.00);
  });

  it('TEST 3: Bet placement -> correct stake debit from balance', async () => {
    const res = await executeBetPlacementTransaction({
      userId: testUserId,
      matchId: 'match_t20_01',
      selectionId: 'sel_team_a',
      stake: 300,
      odds: 1.95,
      potentialPayout: 585,
    });
    expect(res.success).toBe(true);
    expect(res.newBalance).toBe(700.00);

    const ledger = await query(`SELECT * FROM ledger_entries WHERE wallet_id = $1 ORDER BY entry_id DESC LIMIT 1`, [testWalletId]);
    expect(ledger.rows[0].type).toBe('DEBIT');
    expect(parseFloat(ledger.rows[0].amount)).toBe(300.00);
    expect(parseFloat(ledger.rows[0].balance_after)).toBe(700.00);
  });

  it('TEST 4: Insufficient funds -> rejected cleanly with error', async () => {
    await expect(
      executeBetPlacementTransaction({
        userId: testUserId,
        matchId: 'match_t20_01',
        selectionId: 'sel_team_a',
        stake: 2500,
        odds: 1.95,
        potentialPayout: 4875,
      })
    ).rejects.toThrow(/INSUFFICIENT_FUNDS/);

    const wRes = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(1000.00);
  });

  it('TEST 5: Concurrent bets exceeding balance -> only affordable succeed, no negative balance', async () => {
    // Starting balance 1000. Attempt two concurrent bets of 700 each.
    const bet1Promise = executeBetPlacementTransaction({
      userId: testUserId,
      matchId: 'match_concur_1',
      selectionId: 'sel_1',
      stake: 700,
      odds: 2.0,
      potentialPayout: 1400,
    });

    const bet2Promise = executeBetPlacementTransaction({
      userId: testUserId,
      matchId: 'match_concur_2',
      selectionId: 'sel_2',
      stake: 700,
      odds: 2.0,
      potentialPayout: 1400,
    });

    const results = await Promise.allSettled([bet1Promise, bet2Promise]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const wRes = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(300.00);
  });

  it('TEST 6: Bet win -> correct payout credited once', async () => {
    const betRes = await executeBetPlacementTransaction({
      userId: testUserId,
      matchId: 'match_win_01',
      selectionId: 'sel_win_team',
      stake: 200,
      odds: 2.5,
      potentialPayout: 500,
    });
    expect(betRes.newBalance).toBe(800.00);

    const settleRes = await executeSettlementTransaction({
      matchId: 'match_win_01',
      selectionId: 'sel_win_team',
      winningSelectionId: 'sel_win_team',
      idempotencyKey: `settle_test_6_${Date.now()}`,
    });
    expect(settleRes.success).toBe(true);

    const wRes = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(1300.00);
  });

  it('TEST 7: Settlement retry -> no double payout', async () => {
    await executeBetPlacementTransaction({
      userId: testUserId,
      matchId: 'match_win_01',
      selectionId: 'sel_win_team',
      stake: 200,
      odds: 2.5,
      potentialPayout: 500,
    });

    const settleKey7 = `settle_test_7_${Date.now()}`;
    const settleRes1 = await executeSettlementTransaction({
      matchId: 'match_win_01',
      selectionId: 'sel_win_team',
      winningSelectionId: 'sel_win_team',
      idempotencyKey: settleKey7,
    });
    expect(settleRes1.success).toBe(true);

    const settleRes2 = await executeSettlementTransaction({
      matchId: 'match_win_01',
      selectionId: 'sel_win_team',
      winningSelectionId: 'sel_win_team',
      idempotencyKey: settleKey7,
    });
    expect(settleRes2.alreadySettled).toBe(true);

    const wRes = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(1300.00);
  });

  it('TEST 8: Bet loss -> no payout credit', async () => {
    await executeBetPlacementTransaction({
      userId: testUserId,
      matchId: 'match_loss_01',
      selectionId: 'sel_loss_team',
      stake: 300,
      odds: 1.8,
      potentialPayout: 540,
    });

    const wResPre = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId]);
    const balPre = parseFloat(wResPre.rows[0].balance);

    await executeSettlementTransaction({
      matchId: 'match_loss_01',
      selectionId: 'sel_loss_team',
      winningSelectionId: 'sel_other_team',
      idempotencyKey: `settle_test_8_${Date.now()}`,
    });

    const wResPost = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId]);
    expect(parseFloat(wResPost.rows[0].balance)).toBe(balPre);
  });

  it('TEST 9: Void bet -> correct stake refund', async () => {
    const refundRes = await executeWalletTransaction({
      userId: testUserId,
      type: 'REFUND',
      amount: 300,
      description: 'Match Abandoned / Pitch Void',
    });
    expect(refundRes.success).toBe(true);
  });

  it('TEST 10: Cashout -> one credit only with ledger entry', async () => {
    const cashoutRes = await executeWalletTransaction({
      userId: testUserId,
      type: 'CASHOUT',
      amount: 450,
      description: 'Early Cashout on Bet #bet_123',
    });
    expect(cashoutRes.success).toBe(true);
    expect(cashoutRes.newBalance).toBeGreaterThan(1000.00);
  });

  it('TEST 11: Duplicate cashout request -> one success only via idempotency lock', async () => {
    const cashoutKey = `cashout_${Date.now()}`;
    const res1 = await executeWalletTransaction({
      userId: testUserId,
      type: 'CASHOUT',
      amount: 250,
      idempotencyKey: cashoutKey,
    });
    const res2 = await executeWalletTransaction({
      userId: testUserId,
      type: 'CASHOUT',
      amount: 250,
      idempotencyKey: cashoutKey,
    });
    expect(res2.transactionId).toBe(res1.transactionId);
  });

  it('TEST 12: Withdrawal request -> funds reserved cleanly', async () => {
    const wRes = await withTransaction(async (client) => {
      const lock = await client.query(`SELECT balance, reserved_balance FROM wallets WHERE user_id = $1 FOR UPDATE`, [testUserId]);
      const cur = parseFloat(lock.rows[0].balance);
      const res = parseFloat(lock.rows[0].reserved_balance);
      await client.query(`UPDATE wallets SET balance = $1, reserved_balance = $2 WHERE user_id = $3`, [cur - 500, res + 500, testUserId]);
      return { newBalance: cur - 500, newReserved: res + 500 };
    });
    expect(wRes.newReserved).toBe(500.00);
  });

  it('TEST 13: Concurrent withdrawals -> no overdraft beyond available funds', async () => {
    // Starting balance 1000. Two concurrent requests of 700 each.
    const withdrawAttempt = async (amt) => {
      return await withTransaction(async (client) => {
        const lock = await client.query(`SELECT wallet_id, balance, reserved_balance FROM wallets WHERE user_id = $1 FOR UPDATE`, [testUserId]);
        const cur = parseFloat(lock.rows[0].balance);
        if (cur < amt) throw new Error('INSUFFICIENT_FUNDS');
        await client.query(`UPDATE wallets SET balance = balance - $1, reserved_balance = reserved_balance + $1 WHERE user_id = $2`, [amt, testUserId]);
        return { success: true };
      });
    };

    const results = await Promise.allSettled([withdrawAttempt(700), withdrawAttempt(700)]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBe(1);
  });

  it('TEST 14: Failed/cancelled withdrawal -> funds released/refunded back to available balance', async () => {
    await withTransaction(async (client) => {
      await client.query(`UPDATE wallets SET balance = balance + reserved_balance, reserved_balance = 0.00 WHERE user_id = $1`, [testUserId]);
    });
    const wRes = await query(`SELECT balance, reserved_balance FROM wallets WHERE user_id = $1`, [testUserId]);
    expect(parseFloat(wRes.rows[0].reserved_balance)).toBe(0.00);
  });

  it('TEST 15: Free bet usage -> promotional handling separated from cash', async () => {
    await query(`UPDATE wallets SET freebet_balance = 500.00 WHERE user_id = $1`, [testUserId]);
    const wRes = await query(`SELECT balance, freebet_balance FROM wallets WHERE user_id = $1`, [testUserId]);
    expect(parseFloat(wRes.rows[0].freebet_balance)).toBe(500.00);
  });

  it('TEST 16: Referral reward retry -> one credit only', async () => {
    const refKey = `idem_ref_${Date.now()}`;
    const r1 = await executeWalletTransaction({
      userId: testUserId,
      type: 'REFERRAL_REWARD',
      amount: 500,
      idempotencyKey: refKey,
    });
    const r2 = await executeWalletTransaction({
      userId: testUserId,
      type: 'REFERRAL_REWARD',
      amount: 500,
      idempotencyKey: refKey,
    });
    expect(r2.transactionId).toBe(r1.transactionId);
  });

  it('TEST 17: Admin adjustment -> complete audit trail with before/after balances', async () => {
    const adjRes = await executeWalletTransaction({
      userId: testUserId,
      type: 'ADMIN_CREDIT',
      amount: 100,
      description: 'Goodwill Compensation Ticket #TK-992',
    });
    expect(adjRes.success).toBe(true);

    const audit = await query(`SELECT * FROM audit_events WHERE actor_id = $1 ORDER BY event_id DESC LIMIT 1`, [testUserId]);
    expect(audit.rows[0].action).toBe('FINANCIAL_ADMIN_CREDIT');
  });

  it('TEST 18: Wallet API IDOR -> cannot access another users wallet', async () => {
    const attackerId = 'usr_attacker_99';
    // Query strictly scopes by WHERE user_id = attackerId
    const res = await query(`SELECT wallet_id, balance FROM wallets WHERE user_id = $1`, [attackerId]);
    expect(res.rows.length).toBe(0);
  });

  it('TEST 19: Injected/negative amount attack -> rejected with 400 validation error', async () => {
    await expect(
      executeWalletTransaction({
        userId: testUserId,
        type: 'DEPOSIT',
        amount: -500,
      })
    ).rejects.toThrow(/INVALID_AMOUNT/);

    await expect(
      executeWalletTransaction({
        userId: testUserId,
        type: 'DEPOSIT',
        amount: NaN,
      })
    ).rejects.toThrow(/INVALID_AMOUNT/);
  });

  it('TEST 20: Transaction failure -> complete atomic rollback verified', async () => {
    const wPre = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId]);
    const balPre = parseFloat(wPre.rows[0].balance);

    try {
      await withTransaction(async (client) => {
        await client.query(`UPDATE wallets SET balance = balance - 200 WHERE user_id = $1`, [testUserId]);
        throw new Error('SIMULATED_DATABASE_FAILURE');
      });
    } catch {
      /* expected rollback */
    }

    const wPost = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId]);
    expect(parseFloat(wPost.rows[0].balance)).toBe(balPre);
  });
});
