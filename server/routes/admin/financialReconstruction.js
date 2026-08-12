/**
 * Phase 21: Financial State Reconstruction — Balance / Transaction Reconstruction
 * Uses authoritative wallet/ledger data, never frontend-only calculation
 */
import { Router } from 'express';
import { requirePermission } from '../../middleware/adminAuth.js';
const router = Router();
let pgQuery = null;
async function getQuery() { if (!pgQuery) { const m = await import('../../../db/pg.js'); pgQuery = m.query; } return pgQuery; }

// GET /financial/reconstruct/:userId — reconstruct user's balance from ledger
router.get('/reconstruct/:userId', requirePermission('finance', 'reconciliation', 'risk'), async (req, res) => {
  try {
    const q = await getQuery();
    const userId = req.params.userId;

    // Get current wallet state
    const wallet = await q('SELECT * FROM wallets WHERE user_id = $1', [userId]);
    if (wallet.rows.length === 0) return res.status(404).json({ error: 'Wallet not found for user' });
    const currentBalance = parseFloat(wallet.rows[0].balance);

    // Get all ledger entries for this wallet
    const ledger = await q(
      `SELECT le.*, t.type as tx_type, t.method as tx_method, t.status as tx_status
       FROM ledger_entries le
       LEFT JOIN transactions t ON le.transaction_id = t.transaction_id
       WHERE le.wallet_id = $1
       ORDER BY le.created_at ASC`,
      [wallet.rows[0].wallet_id]
    );

    // Reconstruct balance step by step
    let reconstructedBalance = 0;
    const steps = [];
    for (const entry of ledger.rows) {
      const amount = parseFloat(entry.amount);
      const before = reconstructedBalance;
      if (entry.type === 'CREDIT') {
        reconstructedBalance += amount;
      } else {
        reconstructedBalance -= amount;
      }
      steps.push({
        entryId: entry.entry_id,
        transactionId: entry.transaction_id,
        type: entry.type,
        txType: entry.tx_type,
        amount,
        balanceBefore: parseFloat(before.toFixed(2)),
        balanceAfter: parseFloat(reconstructedBalance.toFixed(2)),
        expectedBalanceAfter: parseFloat(entry.balance_after),
        description: entry.description,
        timestamp: entry.created_at,
      });
    }

    const delta = parseFloat(Math.abs(currentBalance - reconstructedBalance).toFixed(2));
    const isReconciled = delta < 0.01;

    // Get transaction summary
    const txSummary = await q(
      `SELECT type, COUNT(*) as count, SUM(amount) as total FROM transactions WHERE user_id = $1 GROUP BY type ORDER BY type`,
      [userId]
    );

    res.json({
      userId,
      walletId: wallet.rows[0].wallet_id,
      currentBalance,
      reconstructedBalance: parseFloat(reconstructedBalance.toFixed(2)),
      delta,
      isReconciled,
      totalEntries: ledger.rows.length,
      transactionSummary: txSummary.rows,
      steps,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
