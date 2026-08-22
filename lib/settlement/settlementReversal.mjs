/**
 * Post-settlement financial reversal workflow — compensating ledger entries only.
 */

import { query, withTransaction } from '../../db/pg.js';
import { logSettlement } from './settlementAudit.mjs';

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
     WHERE bet_id = $1 AND status IN ('OPEN', 'REVERSAL_REQUESTED', 'ADMIN_REVIEW', 'APPROVED')
     LIMIT 1`,
    [betId],
  );
  if (existing.rows.length) {
    throw new Error('REVERSAL_ALREADY_PENDING');
  }

  const correctionId = `sc_${betId}_${Date.now()}`;
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
      bet.actual_payout,
      bet.actual_payout,
      reason,
      requestedBy,
    ],
  );

  logSettlement('SETTLEMENT_REVERSAL_REQUESTED', { betId, correctionId, requestedBy });
  return { correctionId, status: 'REVERSAL_REQUESTED' };
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

export async function executeSettlementReversal({ correctionId, adminId }) {
  return withTransaction(async (client) => {
    const corrRes = await client.query(
      `SELECT * FROM settlement_corrections WHERE correction_id = $1 FOR UPDATE`,
      [correctionId],
    );
    const corr = corrRes.rows[0];
    if (!corr) throw new Error('CORRECTION_NOT_FOUND');
    if (corr.status === 'REVERSED') return { status: 'ALREADY_REVERSED', correctionId };
    if (corr.status !== 'APPROVED') throw new Error('CORRECTION_NOT_APPROVED');

    const betRes = await client.query('SELECT * FROM bets WHERE bet_id = $1 FOR UPDATE', [corr.bet_id]);
    const bet = betRes.rows[0];
    if (!bet) throw new Error('BET_NOT_FOUND');

    const priorPayout = parseFloat(corr.prior_payout || bet.actual_payout || 0);
    const adjustment = parseFloat(corr.adjustment_amount ?? priorPayout);

    const walletRes = await client.query(
      `SELECT wallet_id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [bet.user_id],
    );
    if (!walletRes.rows[0]) throw new Error('WALLET_NOT_FOUND');
    const wallet = walletRes.rows[0];

    const txId = `tx_reversal_${correctionId}`;
    const existingTx = await client.query(
      `SELECT transaction_id FROM transactions WHERE transaction_id = $1`,
      [txId],
    );
    if (existingTx.rows.length) {
      return { status: 'ALREADY_REVERSED', correctionId };
    }

    if (adjustment > 0) {
      const nextBalance = parseFloat((Number(wallet.balance) - adjustment).toFixed(2));
      if (nextBalance < 0) throw new Error('INSUFFICIENT_BALANCE_FOR_REVERSAL');

      await client.query(
        `UPDATE wallets SET balance = $1, updated_at = NOW() WHERE wallet_id = $2`,
        [nextBalance, wallet.wallet_id],
      );

      await client.query(
        `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
         VALUES ($1, $2, 'SETTLEMENT_REVERSAL', $3, 'SUCCESS', NOW())
         ON CONFLICT (transaction_id) DO NOTHING`,
        [txId, bet.user_id, adjustment],
      );

      await client.query(
        `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
         VALUES ($1, $2, 'DEBIT', $3, $4, $5, NOW())`,
        [wallet.wallet_id, txId, adjustment, nextBalance, `Reversal for bet ${bet.bet_id} by admin ${adminId}`],
      );
    }

    await client.query(
      `UPDATE settlement_corrections
       SET status = 'REVERSED', executed_by = $2, reversal_tx_id = $3, updated_at = NOW()
       WHERE correction_id = $1`,
      [correctionId, adminId, txId],
    );

    logSettlement('SETTLEMENT_REVERSED', { betId: bet.bet_id, correctionId, adjustment, adminId });

    return { status: 'REVERSED', correctionId, adjustment, txId };
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
     WHERE status IN ('REVERSAL_REQUESTED', 'ADMIN_REVIEW', 'APPROVED', 'OPEN')
     ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return res.rows;
}
