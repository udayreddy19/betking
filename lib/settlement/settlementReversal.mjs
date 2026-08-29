/**
 * Post-settlement financial reversal workflow — compensating ledger entries only.
 * Enterprise Maker-Checker & Partial Recovery Support.
 */

import { query, withTransaction } from '../../db/pg.js';
import { logSettlement } from './settlementAudit.mjs';

export const REVERSAL_STATUSES = {
  REVERSAL_REQUESTED: 'REVERSAL_REQUESTED',
  REVERSAL_APPROVED: 'REVERSAL_APPROVED',
  REVERSAL_IN_PROGRESS: 'REVERSAL_IN_PROGRESS',
  REVERSAL_PARTIALLY_RECOVERED: 'REVERSAL_PARTIALLY_RECOVERED',
  REVERSAL_FINANCIALLY_PENDING: 'REVERSAL_FINANCIALLY_PENDING',
  REVERSAL_COMPLETED: 'REVERSAL_COMPLETED',
  REVERSED: 'REVERSED',
  REVERSAL_REJECTED: 'REVERSAL_REJECTED',
};

export async function requestSettlementReversal({
  betId,
  reason,
  requestedBy,
  newResult = null,
}) {
  const betRes = await query('SELECT * FROM bets WHERE bet_id = $1', [betId]);
  const bet = betRes.rows[0];
  if (!bet) throw new Error('BET_NOT_FOUND');

  const terminal = ['WON', 'LOST', 'VOID', 'REFUNDED', 'CASHED_OUT'].includes(String(bet.status).toUpperCase());
  if (!terminal) throw new Error('BET_NOT_TERMINAL');

  const existing = await query(
    `SELECT correction_id FROM settlement_corrections
     WHERE bet_id = $1 AND status IN ('OPEN', 'REVERSAL_REQUESTED', 'ADMIN_REVIEW', 'APPROVED', 'REVERSAL_APPROVED')
     LIMIT 1`,
    [betId],
  );
  if (existing.rows.length) {
    throw new Error('REVERSAL_ALREADY_PENDING');
  }

  const correctionId = `sc_${betId}_${Date.now()}`;
  const priorPayout = parseFloat(bet.actual_payout || 0);

  await query(
    `INSERT INTO settlement_corrections (
       correction_id, bet_id, prior_result, new_result, prior_payout, adjustment_amount,
       status, notes, requested_by, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, 'REVERSAL_REQUESTED', $7, $8, NOW())`,
    [
      correctionId,
      betId,
      bet.status,
      newResult,
      priorPayout,
      priorPayout,
      reason,
      requestedBy,
    ],
  );

  logSettlement('SETTLEMENT_REVERSAL_REQUESTED', { betId, correctionId, requestedBy });
  return { correctionId, status: 'REVERSAL_REQUESTED', originalAdjustmentAmount: priorPayout };
}

export async function approveSettlementReversal({ correctionId, adminId, adjustmentAmount, notes = '' }) {
  const res = await query(
    `UPDATE settlement_corrections
     SET status = 'APPROVED', approved_by = $2,
         adjustment_amount = COALESCE($3, adjustment_amount),
         notes = COALESCE(notes, '') || $4, updated_at = NOW()
     WHERE correction_id = $1 AND status IN ('REVERSAL_REQUESTED', 'ADMIN_REVIEW', 'OPEN')
     RETURNING *`,
    [correctionId, adminId, adjustmentAmount, `\napproved: ${notes}`],
  );
  if (!res.rows[0]) throw new Error('CORRECTION_NOT_APPROVABLE');
  return res.rows[0];
}

export async function executeSettlementReversal({ correctionId, adminId, allowPartialRecovery = true }) {
  return withTransaction(async (client) => {
    const corrRes = await client.query(
      `SELECT * FROM settlement_corrections WHERE correction_id = $1 FOR UPDATE`,
      [correctionId],
    );
    const corr = corrRes.rows[0];
    if (!corr) throw new Error('CORRECTION_NOT_FOUND');
    if (corr.status === 'REVERSED' || corr.status === 'REVERSAL_COMPLETED') {
      return { status: corr.status, correctionId, recoveredAmount: corr.prior_payout, outstandingAmount: 0 };
    }
    if (corr.status !== 'APPROVED' && corr.status !== 'REVERSAL_APPROVED') {
      throw new Error(`CORRECTION_NOT_APPROVED: Status is '${corr.status}'`);
    }

    const betRes = await client.query('SELECT * FROM bets WHERE bet_id = $1 FOR UPDATE', [corr.bet_id]);
    const bet = betRes.rows[0];
    if (!bet) throw new Error('BET_NOT_FOUND');

    const priorPayout = parseFloat(corr.prior_payout || bet.actual_payout || 0);
    const totalAdjustment = parseFloat(corr.adjustment_amount ?? priorPayout);

    const walletRes = await client.query(
      `SELECT wallet_id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [bet.user_id],
    );
    if (!walletRes.rows[0]) throw new Error('WALLET_NOT_FOUND');
    const wallet = walletRes.rows[0];
    const currentBalance = parseFloat(Number(wallet.balance || 0).toFixed(2));

    const txId = `tx_reversal_${correctionId}`;
    const existingTx = await client.query(
      `SELECT transaction_id FROM transactions WHERE transaction_id = $1`,
      [txId],
    );
    if (existingTx.rows.length) {
      return { status: 'ALREADY_REVERSED', correctionId };
    }

    let recoveredAmount = 0.00;
    let outstandingAmount = totalAdjustment;
    let finalStatus = REVERSAL_STATUSES.REVERSED;

    if (totalAdjustment > 0) {
      if (currentBalance >= totalAdjustment) {
        recoveredAmount = totalAdjustment;
        outstandingAmount = 0.00;
        finalStatus = REVERSAL_STATUSES.REVERSED;
      } else if (allowPartialRecovery && currentBalance > 0) {
        recoveredAmount = currentBalance;
        outstandingAmount = parseFloat((totalAdjustment - currentBalance).toFixed(2));
        finalStatus = REVERSAL_STATUSES.REVERSAL_PARTIALLY_RECOVERED;
      } else if (allowPartialRecovery && currentBalance <= 0) {
        recoveredAmount = 0.00;
        outstandingAmount = totalAdjustment;
        finalStatus = REVERSAL_STATUSES.REVERSAL_FINANCIALLY_PENDING;
      } else {
        throw new Error('INSUFFICIENT_BALANCE_FOR_REVERSAL');
      }

      const nextBalance = parseFloat((currentBalance - recoveredAmount).toFixed(2));

      if (recoveredAmount > 0) {
        await client.query(
          `UPDATE wallets SET balance = $1, updated_at = NOW() WHERE wallet_id = $2`,
          [nextBalance, wallet.wallet_id],
        );

        await client.query(
          `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
           VALUES ($1, $2, 'SETTLEMENT_REVERSAL', $3, 'SUCCESS', NOW())
           ON CONFLICT (transaction_id) DO NOTHING`,
          [txId, bet.user_id, recoveredAmount],
        );

        await client.query(
          `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
           VALUES ($1, $2, 'DEBIT', $3, $4, $5, NOW())`,
          [
            wallet.wallet_id,
            txId,
            recoveredAmount,
            nextBalance,
            `Compensating settlement reversal for bet ${bet.bet_id} (recovered ₹${recoveredAmount.toFixed(2)}, outstanding ₹${outstandingAmount.toFixed(2)}) by admin ${adminId}`,
          ],
        );
      }
    }

    const noteUpdate = `\nexecuted_by=${adminId}; recovered=${recoveredAmount}; outstanding=${outstandingAmount}; final_status=${finalStatus}`;

    await client.query(
      `UPDATE settlement_corrections
       SET status = $1, executed_by = $2, reversal_tx_id = $3,
           recovered_amount = COALESCE($4, recovered_amount),
           outstanding_amount = COALESCE($5, outstanding_amount),
           notes = COALESCE(notes, '') || $6, updated_at = NOW()
       WHERE correction_id = $7`,
      [finalStatus, adminId, txId, recoveredAmount, outstandingAmount, noteUpdate, correctionId],
    );

    logSettlement('SETTLEMENT_REVERSED', {
      betId: bet.bet_id,
      correctionId,
      totalAdjustment,
      recoveredAmount,
      outstandingAmount,
      finalStatus,
      adminId,
    });

    return {
      status: finalStatus,
      correctionId,
      originalAdjustmentAmount: totalAdjustment,
      recoveredAmount,
      outstandingAmount,
      txId,
    };
  });
}

export async function rejectSettlementReversal({ correctionId, adminId, reason }) {
  const res = await query(
    `UPDATE settlement_corrections
     SET status = 'REJECTED', notes = COALESCE(notes, '') || $2, updated_at = NOW()
     WHERE correction_id = $1 AND status IN ('REVERSAL_REQUESTED', 'ADMIN_REVIEW', 'APPROVED', 'OPEN')
     RETURNING correction_id`,
    [correctionId, `\nrejected_by=${adminId}; ${reason}`],
  );
  if (!res.rows[0]) throw new Error('CORRECTION_NOT_REJECTABLE');
  return { status: 'REJECTED', correctionId };
}

export async function listPendingReversals(limit = 100) {
  const res = await query(
    `SELECT * FROM settlement_corrections
     WHERE status IN ('REVERSAL_REQUESTED', 'ADMIN_REVIEW', 'APPROVED', 'OPEN', 'REVERSAL_PARTIALLY_RECOVERED', 'REVERSAL_FINANCIALLY_PENDING')
     ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return res.rows;
}
