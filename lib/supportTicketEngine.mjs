/**
 * Bet Dispute & Customer Support Engine
 * 
 * Auto-compiles bet audit receipts, match ball events, and ledger history
 * to facilitate fast resolution of customer settlement disputes.
 */

import { query } from '../db/pg.js';

export async function createBetDispute(userId, betId, reason = '') {
  if (!userId || !betId) {
    throw new Error('userId and betId are required to create a dispute');
  }

  // 1. Fetch bet details
  const betRes = await query(`SELECT * FROM bets WHERE bet_id = $1 AND user_id = $2`, [betId, userId]);
  if (betRes.rows.length === 0) {
    throw new Error('Bet not found or does not belong to user');
  }
  const bet = betRes.rows[0];

  const disputeId = `disp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await query(
    `INSERT INTO bet_disputes (id, dispute_id, bet_id, user_id, reason, status)
     VALUES ($1, $1, $2, $3, $4, 'OPEN')`,
    [disputeId, betId, userId, reason || 'Customer dispute on settlement outcome'],
  );

  return {
    disputeId,
    betId,
    userId,
    betDetails: {
      matchId: bet.match_id,
      marketId: bet.market_id,
      selectionId: bet.selection_id,
      stake: Number(bet.stake),
      odds: Number(bet.odds),
      status: bet.status,
    },
    status: 'OPEN',
    createdAt: new Date().toISOString(),
  };
}

export async function resolveBetDispute(disputeId, agentId, resolutionStatus = 'RESOLVED_UPHELD', notes = '', refundAmount = 0) {
  const res = await query(
    `UPDATE bet_disputes
     SET status = $1,
         assigned_agent_id = $2,
         resolution_notes = $3,
         refund_amount = $4,
         resolved_at = NOW()
     WHERE dispute_id = $5 OR id = $5
     RETURNING *`,
    [resolutionStatus, agentId, notes, Number(refundAmount || 0), disputeId],
  );

  if (res.rows.length === 0) {
    throw new Error('Dispute not found');
  }

  return {
    success: true,
    dispute: res.rows[0],
  };
}
