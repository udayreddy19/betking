import { withTransaction } from '../db/pg.js';
import { idempotencyEngine } from './idempotencyEngine.mjs';
import { transitionBetStatus } from './betStateMachine.mjs';
import { publishOutboxEvent } from './outboxEngine.mjs';

/**
 * Execute Atomic Bet Cashout
 */
export async function executeBetCashout({
  betId,
  userId,
  requestedCashoutValue = null,
  idempotencyKey = null,
}) {
  const cKey = idempotencyKey || `cashout_${betId}`;
  const idCheck = await idempotencyEngine.checkOrLock(cKey, 'bet_cashout', `${betId}_${userId}`);
  if (idCheck.isDuplicate) {
    if (idCheck.status === 'COMPLETED') return idCheck.result;
    if (idCheck.status === 'PROCESSING') throw new Error('IDEMPOTENCY_CONFLICT: Cashout is processing');
  }

  try {
    const result = await withTransaction(async (client) => {
      // 1. Lock Bet row
      const betRes = await client.query(`
        SELECT bet_id, user_id, stake, odds, potential_payout, status
        FROM bets
        WHERE bet_id = $1 AND user_id = $2
        FOR UPDATE;
      `, [betId, userId]);

      if (betRes.rows.length === 0) {
        throw new Error('BET_NOT_FOUND: Bet does not exist or belong to user');
      }

      const bet = betRes.rows[0];
      const curStatus = bet.status;

      if (curStatus !== 'PENDING' && curStatus !== 'ACCEPTED') {
        throw new Error(`CASHOUT_NOT_ALLOWED: Bet ${betId} in status '${curStatus}' cannot be cashed out`);
      }

      // Calculate Cashout payout (85% of potential payout or requested value)
      const stake = parseFloat(bet.stake);
      const potentialPayout = parseFloat(bet.potential_payout);
      const calculatedCashout = parseFloat((potentialPayout * 0.85).toFixed(2));
      const finalCashoutAmount = requestedCashoutValue ? parseFloat(Number(requestedCashoutValue).toFixed(2)) : calculatedCashout;

      // 2. Lock Wallet row
      const wRes = await client.query(`SELECT wallet_id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`, [userId]);
      if (wRes.rows.length === 0) throw new Error('WALLET_NOT_FOUND');

      const wallet = wRes.rows[0];
      const currentBal = parseFloat(wallet.balance);
      const newBal = parseFloat((currentBal + finalCashoutAmount).toFixed(2));

      // 3. Transition Bet Status
      await transitionBetStatus({
        betId,
        fromStatus: curStatus,
        toStatus: 'CASHED_OUT',
        reason: `User early cashout of ₹${finalCashoutAmount.toFixed(2)}`,
        actorId: userId,
        client,
      });

      // 4. Update Wallet Balance
      await client.query(`UPDATE wallets SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`, [newBal, wallet.wallet_id]);

      // 5. Insert Transaction & Double-Entry Ledger Credit
      const txId = `tx_cashout_${betId}`;
      await client.query(`
        INSERT INTO transactions (transaction_id, user_id, type, amount, status)
        VALUES ($1, $2, 'BET_CASHOUT', $3, 'COMPLETED');
      `, [txId, userId, finalCashoutAmount]);

      await client.query(`
        INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
        VALUES ($1, $2, 'CREDIT', $3, $4, $5);
      `, [wallet.wallet_id, txId, finalCashoutAmount, newBal, `Bet early cashout (${betId})`]);

      // 6. Publish Transactional Outbox Event
      await publishOutboxEvent(client, {
        eventType: 'BET_CASHED_OUT',
        aggregateType: 'BET',
        aggregateId: betId,
        payload: { betId, userId, cashoutAmount: finalCashoutAmount, newBalance: newBal },
      });

      return {
        success: true,
        betId,
        cashoutAmount: finalCashoutAmount,
        oldBalance: currentBal,
        newBalance: newBal,
        status: 'CASHED_OUT',
      };
    });

    await idempotencyEngine.complete(cKey, result);
    return result;
  } catch (err) {
    await idempotencyEngine.fail(cKey, err.message);
    throw err;
  }
}
