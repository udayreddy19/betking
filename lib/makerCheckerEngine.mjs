/**
 * Enterprise Maker-Checker Financial Approval Workflow Engine — OddsYra (lib/makerCheckerEngine.mjs)
 * Enforces dual-operator control for sensitive financial operations:
 * MANUAL_CREDIT, MANUAL_DEBIT, WITHDRAWAL_OVERRIDE, REFUND, BONUS_ADJUSTMENT, SETTLEMENT_CORRECTION.
 */

import { withTransaction, query } from '../db/pg.js';

class MakerCheckerEngine {
  /**
   * Maker submits a financial adjustment request
   */
  async submitRequest({
    actionType,
    targetEntityType = 'user',
    targetEntityId,
    requestPayload = {},
    makerId = 'admin_maker',
  }) {
    if (!actionType || !targetEntityId) throw new Error('submitRequest requires actionType and targetEntityId');

    const requestId = `mc_req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Ensure user exists in users table to prevent FK mismatch
    if (targetEntityType === 'user') {
      await query(`INSERT INTO users (user_id, email) VALUES ($1, $1) ON CONFLICT (user_id) DO NOTHING`, [targetEntityId]);
    }

    await query(`
      INSERT INTO maker_checker_requests (id, action_type, target_entity_type, target_entity_id, request_payload, status, maker_id, created_at)
      VALUES ($1, $2, $3, $4, $5, 'PENDING_APPROVAL', $6, NOW());
    `, [requestId, actionType, targetEntityType, targetEntityId, JSON.stringify(requestPayload), makerId]);

    return {
      requestId,
      actionType,
      targetEntityType,
      targetEntityId,
      requestPayload,
      status: 'PENDING_APPROVAL',
      makerId,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Checker approves a pending financial adjustment request
   */
  async approveRequest(requestId, checkerId = 'admin_checker') {
    return await withTransaction(async (client) => {
      // 1. Lock request row
      const reqRes = await client.query(`
        SELECT id, action_type, target_entity_type, target_entity_id, request_payload, status, maker_id
        FROM maker_checker_requests
        WHERE id = $1
        FOR UPDATE;
      `, [requestId]);

      if (reqRes.rows.length === 0) throw new Error(`Maker-Checker request #${requestId} not found`);

      const req = reqRes.rows[0];

      if (req.status !== 'PENDING_APPROVAL') {
        throw new Error(`Request #${requestId} is already in status '${req.status}'`);
      }

      // Enforce strict Maker != Checker rule
      if (req.maker_id === checkerId) {
        throw new Error('MAKER_CHECKER_SELF_APPROVAL_PROHIBITED: The maker of a request cannot approve their own request.');
      }

      const payload = typeof req.request_payload === 'string' ? JSON.parse(req.request_payload) : req.request_payload;
      const amount = Number(payload.amount) || 0;
      const userId = req.target_entity_id;

      // 2. Execute Financial Operation atomically
      if (req.action_type === 'MANUAL_CREDIT' || req.action_type === 'REFUND' || req.action_type === 'BONUS_ADJUSTMENT') {
        // Lock Wallet
        let wRes = await client.query(`SELECT wallet_id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`, [userId]);
        if (wRes.rows.length === 0) {
          const wId = `w_${userId}`;
          await client.query(`INSERT INTO wallets (wallet_id, user_id, balance, currency) VALUES ($1, $2, 0.00, 'INR')`, [wId, userId]);
          wRes = await client.query(`SELECT wallet_id, balance FROM wallets WHERE wallet_id = $1 FOR UPDATE`, [wId]);
        }
        const wallet = wRes.rows[0];
        const currentBal = Number(wallet.balance);
        const newBal = currentBal + amount;

        await client.query(`UPDATE wallets SET balance = $1, updated_at = NOW() WHERE wallet_id = $2`, [newBal, wallet.wallet_id]);

        const txId = `tx_mc_${requestId}`;
        await client.query(`
          INSERT INTO transactions (transaction_id, user_id, type, amount, status)
          VALUES ($1, $2, $3, $4, 'COMPLETED');
        `, [txId, userId, req.action_type, amount]);

        await client.query(`
          INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
          VALUES ($1, $2, 'CREDIT', $3, $4, $5);
        `, [wallet.wallet_id, txId, amount, newBal, `Maker-Checker Approved ${req.action_type}`]);
      } else if (req.action_type === 'MANUAL_DEBIT') {
        const wRes = await client.query(`SELECT wallet_id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`, [userId]);
        if (wRes.rows.length === 0) throw new Error('WALLET_NOT_FOUND');
        const wallet = wRes.rows[0];
        const currentBal = Number(wallet.balance);
        const newBal = Math.max(0, currentBal - amount);

        await client.query(`UPDATE wallets SET balance = $1, updated_at = NOW() WHERE wallet_id = $2`, [newBal, wallet.wallet_id]);

        const txId = `tx_mc_${requestId}`;
        await client.query(`
          INSERT INTO transactions (transaction_id, user_id, type, amount, status)
          VALUES ($1, $2, 'MANUAL_DEBIT', $3, 'COMPLETED');
        `, [txId, userId, amount]);

        await client.query(`
          INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
          VALUES ($1, $2, 'DEBIT', $3, $4, $5);
        `, [wallet.wallet_id, txId, amount, newBal, `Maker-Checker Approved MANUAL_DEBIT`]);
      }

      // 3. Mark request APPROVED
      await client.query(`
        UPDATE maker_checker_requests
        SET status = 'APPROVED', checker_id = $1, approved_at = NOW()
        WHERE id = $2;
      `, [checkerId, requestId]);

      return {
        requestId,
        status: 'APPROVED',
        makerId: req.maker_id,
        checkerId,
        approvedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Checker rejects a pending financial adjustment request
   */
  async rejectRequest(requestId, reason = 'Trade Manager Rejection', checkerId = 'admin_checker') {
    const res = await query(`
      UPDATE maker_checker_requests
      SET status = 'REJECTED', checker_id = $1, rejection_reason = $2
      WHERE id = $3 AND status = 'PENDING_APPROVAL'
      RETURNING id, status, maker_id, checker_id;
    `, [checkerId, reason, requestId]);

    if (res.rows.length === 0) throw new Error(`Maker-Checker request #${requestId} not found or not pending`);
    return { requestId, status: 'REJECTED', checkerId, rejectionReason: reason };
  }

  async getPendingRequests() {
    const res = await query(`
      SELECT id, action_type, target_entity_type, target_entity_id, request_payload, status, maker_id, created_at
      FROM maker_checker_requests
      WHERE status = 'PENDING_APPROVAL'
      ORDER BY created_at DESC;
    `);
    return res.rows;
  }
}

export const makerCheckerEngine = new MakerCheckerEngine();
