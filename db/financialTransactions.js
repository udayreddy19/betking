import { withTransaction, query } from './pg.js';
import { idempotencyEngine } from '../lib/idempotencyEngine.mjs';

/**
 * Execute Atomic Financial Wallet Transaction
 * Enforces SELECT ... FOR UPDATE row locking, double-entry ledger, and idempotency.
 */
export async function executeWalletTransaction({
  userId,
  type = 'DEPOSIT', // DEPOSIT | WITHDRAWAL | REFUND | CASHOUT
  amount,
  utr = null,
  description = '',
  idempotencyKey = null,
}) {
  const numericAmount = parseFloat(Number(amount).toFixed(2));
  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error('INVALID_AMOUNT: Amount must be a positive numeric value');
  }

  // 1. Idempotency Check
  if (idempotencyKey) {
    const idCheck = await idempotencyEngine.checkOrLock(idempotencyKey, `wallet_${type}`, `${userId}_${amount}_${utr}`);
    if (idCheck.isDuplicate) {
      if (idCheck.status === 'COMPLETED') {
        return idCheck.result;
      }
      if (idCheck.status === 'PROCESSING') {
        throw new Error('IDEMPOTENCY_CONFLICT: Operation is currently being processed');
      }
    }
  }

  let result;
  try {
    result = await withTransaction(async (client) => {
      // 2. Standardized Lock Order: Lock wallet row FIRST with SELECT FOR UPDATE
      const walletRes = await client.query(`
        SELECT wallet_id, balance, bonus_balance
        FROM wallets
        WHERE user_id = $1
        FOR UPDATE;
      `, [userId]);

      if (walletRes.rows.length === 0) {
        throw new Error('WALLET_NOT_FOUND: User wallet does not exist');
      }

      const wallet = walletRes.rows[0];
      const currentBalance = parseFloat(wallet.balance);

      // 3. Balance Validation for Debit operations
      if ((type === 'WITHDRAWAL' || type === 'BET_STAKE') && currentBalance < numericAmount) {
        throw new Error(`INSUFFICIENT_FUNDS: Current balance ₹${currentBalance.toFixed(2)} is less than required ₹${numericAmount.toFixed(2)}`);
      }

      // Calculate new balance
      const balanceDelta = (type === 'WITHDRAWAL' || type === 'BET_STAKE') ? -numericAmount : numericAmount;
      const newBalance = parseFloat((currentBalance + balanceDelta).toFixed(2));

      // 4. Create Business Transaction Record
      const txId = `tx_${type.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await client.query(`
        INSERT INTO transactions (transaction_id, user_id, type, method, utr, amount, status)
        VALUES ($1, $2, $3, 'UPI', $4, $5, 'COMPLETED');
      `, [txId, userId, type, utr, numericAmount]);

      // 5. Create Double-Entry Ledger Entry
      const ledgerType = balanceDelta > 0 ? 'CREDIT' : 'DEBIT';
      await client.query(`
        INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
        VALUES ($1, $2, $3, $4, $5, $6);
      `, [wallet.wallet_id, txId, ledgerType, numericAmount, newBalance, description || `${type} transaction`]);

      // 6. Update Wallet State
      await client.query(`
        UPDATE wallets
        SET balance = $1, updated_at = CURRENT_TIMESTAMP
        WHERE wallet_id = $2;
      `, [newBalance, wallet.wallet_id]);

      // 7. Audit Event
      await client.query(`
        INSERT INTO audit_events (actor_id, target_id, action, details)
        VALUES ($1, $2, $3, $4);
      `, [userId, txId, `FINANCIAL_${type}`, JSON.stringify({ amount: numericAmount, oldBalance: currentBalance, newBalance, utr })]);

      return {
        success: true,
        transactionId: txId,
        type,
        amount: numericAmount,
        oldBalance: currentBalance,
        newBalance,
        status: 'COMPLETED',
      };
    });
  } catch (err) {
    if (idempotencyKey) {
      await idempotencyEngine.fail(idempotencyKey, err.message);
    }
    throw err;
  }

  // complete after successful commit — do not fail() if this throws
  if (idempotencyKey) {
    await idempotencyEngine.complete(idempotencyKey, result);
  }

  return result;
}

/**
 * Execute Atomic Bet Placement Transaction
 */
export async function executeBetPlacementTransaction({
  userId,
  matchId,
  selectionId,
  stake,
  odds,
  potentialPayout,
  idempotencyKey = null,
}) {
  const numericStake = parseFloat(Number(stake).toFixed(2));
  const numericOdds = parseFloat(Number(odds).toFixed(2));
  const numericPayout = parseFloat(Number(potentialPayout).toFixed(2));

  if (idempotencyKey) {
    const idCheck = await idempotencyEngine.checkOrLock(idempotencyKey, 'bet_placement', `${userId}_${selectionId}_${stake}`);
    if (idCheck.isDuplicate) {
      if (idCheck.status === 'COMPLETED') return idCheck.result;
      if (idCheck.status === 'PROCESSING') throw new Error('IDEMPOTENCY_CONFLICT: Bet placement is processing');
    }
  }

  let result;
  try {
    result = await withTransaction(async (client) => {
      // Lock wallet row
      const wRes = await client.query(`SELECT wallet_id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`, [userId]);
      if (wRes.rows.length === 0) throw new Error('WALLET_NOT_FOUND');

      const wallet = wRes.rows[0];
      const curBal = parseFloat(wallet.balance);

      if (curBal < numericStake) {
        throw new Error(`INSUFFICIENT_FUNDS: Available ₹${curBal.toFixed(2)}, required ₹${numericStake.toFixed(2)}`);
      }

      const newBal = parseFloat((curBal - numericStake).toFixed(2));
      const betId = `bet_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // Insert historical bet snapshot
      await client.query(`
        INSERT INTO bets (bet_id, user_id, match_id, selection_id, stake, odds, potential_payout, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING');
      `, [betId, userId, matchId, selectionId, numericStake, numericOdds, numericPayout]);

      // Deduct balance
      await client.query(`UPDATE wallets SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`, [newBal, wallet.wallet_id]);

      // Create ledger debit entry
      const txId = `tx_stake_${betId}`;
      await client.query(`
        INSERT INTO transactions (transaction_id, user_id, type, amount, status)
        VALUES ($1, $2, 'BET_STAKE', $3, 'COMPLETED');
      `, [txId, userId, numericStake]);

      await client.query(`
        INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
        VALUES ($1, $2, 'DEBIT', $3, $4, $5);
      `, [wallet.wallet_id, txId, numericStake, newBal, `Bet stake placed (${betId})`]);

      return { success: true, betId, stake: numericStake, odds: numericOdds, potentialPayout: numericPayout, newBalance: newBal };
    });
  } catch (err) {
    if (idempotencyKey) await idempotencyEngine.fail(idempotencyKey, err.message);
    throw err;
  }

  if (idempotencyKey) await idempotencyEngine.complete(idempotencyKey, result);
  return result;
}

/**
 * Execute Atomic Double-Settlement Protection Transaction
 */
export async function executeSettlementTransaction({
  matchId,
  selectionId,
  winningSelectionId,
  idempotencyKey = null,
}) {
  const settlementKey = idempotencyKey || `settle_${matchId}_${selectionId}`;
  const idCheck = await idempotencyEngine.checkOrLock(settlementKey, 'match_settlement', `${matchId}_${winningSelectionId}`);
  if (idCheck.isDuplicate) {
    if (idCheck.status === 'COMPLETED') return { ...idCheck.result, alreadySettled: true };
    if (idCheck.status === 'PROCESSING') throw new Error('IDEMPOTENCY_CONFLICT: Settlement is currently processing');
  }

  let result;
  try {
    result = await withTransaction(async (client) => {
      // Check double settlement
      const sCheck = await client.query(`SELECT settlement_id FROM settlements WHERE match_id = $1 AND selection_id = $2`, [matchId, selectionId]);
      if (sCheck.rows.length > 0) {
        return { success: true, alreadySettled: true, settlementId: sCheck.rows[0].settlement_id };
      }

      // Fetch pending bets for this match and selection
      const betsRes = await client.query(`
        SELECT bet_id, user_id, selection_id, stake, odds, potential_payout
        FROM bets
        WHERE match_id = $1 AND selection_id = $2 AND status IN ('PENDING', 'ACCEPTED')
        FOR UPDATE;
      `, [matchId, selectionId]);

      let totalPayout = 0;
      let settledCount = betsRes.rows.length;

      for (const bet of betsRes.rows) {
        const isWin = bet.selection_id === winningSelectionId;
        const newStatus = isWin ? 'WON' : 'LOST';
        const payout = isWin ? parseFloat(bet.potential_payout) : 0;

        await client.query(`UPDATE bets SET status = $1 WHERE bet_id = $2`, [newStatus, bet.bet_id]);

        if (isWin && payout > 0) {
          totalPayout += payout;
          // Lock user wallet
          const wRes = await client.query(`SELECT wallet_id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`, [bet.user_id]);
          if (wRes.rows.length > 0) {
            const wallet = wRes.rows[0];
            const newBal = parseFloat((parseFloat(wallet.balance) + payout).toFixed(2));

            await client.query(`UPDATE wallets SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`, [newBal, wallet.wallet_id]);

            const txId = `tx_payout_${bet.bet_id}`;
            await client.query(`
              INSERT INTO transactions (transaction_id, user_id, type, amount, status)
              VALUES ($1, $2, 'BET_PAYOUT', $3, 'COMPLETED');
            `, [txId, bet.user_id, payout]);

            await client.query(`
              INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
              VALUES ($1, $2, 'CREDIT', $3, $4, $5);
            `, [wallet.wallet_id, txId, payout, newBal, `Bet payout won (${bet.bet_id})`]);
          }
        }
      }

      const settlementId = `settle_${matchId}_${Date.now()}`;
      await client.query(`
        INSERT INTO settlements (settlement_id, match_id, selection_id, winning_selection_id, bets_settled_count, total_payout_amount)
        VALUES ($1, $2, $3, $4, $5, $6);
      `, [settlementId, matchId, selectionId, winningSelectionId, settledCount, totalPayout]);

      return { success: true, settlementId, betsSettled: settledCount, totalPayoutAmount: totalPayout };
    });
  } catch (err) {
    await idempotencyEngine.fail(settlementKey, err.message);
    throw err;
  }

  await idempotencyEngine.complete(settlementKey, result);
  return result;
}
