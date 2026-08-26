/**
 * Non-production E2E harness — fund + settle + outbox drain so browser WS can observe updates.
 * Mounted only when NODE_ENV !== 'production' AND E2E_HARNESS=1.
 * Returns 404 in all other environments (including production).
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/userAuth.js';

const router = Router();

function harnessEnabled() {
  return process.env.NODE_ENV !== 'production' && process.env.E2E_HARNESS === '1';
}

function rejectIfDisabled(_req, res, next) {
  if (!harnessEnabled()) {
    return res.status(404).json({ error: 'Not found' });
  }
  return next();
}

router.use(rejectIfDisabled);

router.post('/api/e2e/fund', requireAuth, async (req, res) => {
  try {
    const { fundTestWallet } = await import('../../tests/helpers/testFundWallet.mjs');
    const userId = req.user.userId || req.user.id;
    const amount = Number(req.body?.amount ?? 1000);
    const result = await fundTestWallet({ userId, amount, email: req.user.email });
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/api/e2e/settle', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const betId = req.body?.betId;
    const outcome = String(req.body?.outcome || 'WON').toUpperCase();
    if (!betId) return res.status(400).json({ success: false, error: 'betId required' });
    if (!['WON', 'LOST', 'VOID'].includes(outcome)) {
      return res.status(400).json({ success: false, error: 'outcome must be WON|LOST|VOID' });
    }

    const { query } = await import('../../db/pg.js');
    const bet = await query(`SELECT bet_id, user_id, match_id, status FROM bets WHERE bet_id = $1`, [betId]);
    if (!bet.rows[0] || bet.rows[0].user_id !== userId) {
      return res.status(404).json({ success: false, error: 'BET_NOT_FOUND' });
    }

    const { betSettlementEngine } = await import('../../lib/betSettlementEngine.mjs');
    const settled = await betSettlementEngine.settleSingleBet({
      betId,
      matchState: {
        matchId: bet.rows[0].match_id,
        status: 'COMPLETED',
        __forcedOutcome: outcome,
      },
    });

    const { processPendingOutboxEvents } = await import('../../lib/outboxWorker.mjs');
    for (let i = 0; i < 20; i++) {
      await processPendingOutboxEvents(50);
    }

    const wallet = await query(
      `SELECT balance, winnings_balance, locked_deposit_balance FROM wallets WHERE user_id = $1`,
      [userId],
    );

    return res.json({
      success: true,
      settled,
      wallet: wallet.rows[0] || null,
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/api/e2e/place-settle', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const stake = Number(req.body?.stake ?? 100);
    const odds = Number(req.body?.odds ?? 1.5);
    const outcome = String(req.body?.outcome || 'WON').toUpperCase();
    if (!['WON', 'LOST', 'VOID'].includes(outcome)) {
      return res.status(400).json({ success: false, error: 'outcome must be WON|LOST|VOID' });
    }
    if (!Number.isFinite(stake) || stake <= 0) {
      return res.status(400).json({ success: false, error: 'invalid stake' });
    }

    const { query } = await import('../../db/pg.js');
    const stamp = Date.now();
    const matchId = `e2e_m_${stamp}`;
    const marketId = `e2e_mk_${stamp}`;
    const selectionId = `e2e_sel_${stamp}`;
    const betId = `bet_e2e_${stamp}`;
    const potential = Number((stake * odds).toFixed(2));

    await query(
      `INSERT INTO matches (match_id, status) VALUES ($1, 'LIVE')
       ON CONFLICT (match_id) DO UPDATE SET status = 'LIVE'`,
      [matchId],
    );
    await query(
      `INSERT INTO markets (market_id, match_id, name, status) VALUES ($1, $2, 'Winner', 'OPEN')
       ON CONFLICT (market_id) DO UPDATE SET status = 'OPEN'`,
      [marketId, matchId],
    );
    await query(
      `INSERT INTO selections (selection_id, market_id, name, odds, status)
       VALUES ($1, $2, 'Home', $3, 'OPEN')
       ON CONFLICT (selection_id) DO UPDATE SET odds = $3, status = 'OPEN'`,
      [selectionId, marketId, odds],
    );

    const wallet = await query(`SELECT wallet_id, balance FROM wallets WHERE user_id = $1`, [userId]);
    if (!wallet.rows[0] || Number(wallet.rows[0].balance) < stake) {
      return res.status(400).json({ success: false, error: 'INSUFFICIENT_FUNDS' });
    }

    const { executeWalletTransaction } = await import('../../db/financialTransactions.js');
    await executeWalletTransaction({
      userId,
      type: 'BET_STAKE',
      amount: stake,
      description: `E2E harness stake ${betId}`,
      idempotencyKey: `e2e_stake_${betId}`,
    });

    await query(
      `INSERT INTO bets (
         bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds,
         potential_payout, status, fund_source, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,'ACCEPTED','cash',NOW())
       ON CONFLICT (bet_id) DO NOTHING`,
      [betId, userId, matchId, marketId, selectionId, stake, odds, potential],
    );

    const { betSettlementEngine } = await import('../../lib/betSettlementEngine.mjs');
    const settled = await betSettlementEngine.settleSingleBet({
      betId,
      matchState: { matchId, status: 'COMPLETED', __forcedOutcome: outcome },
    });

    const { processPendingOutboxEvents } = await import('../../lib/outboxWorker.mjs');
    for (let i = 0; i < 20; i++) {
      await processPendingOutboxEvents(50);
    }

    const walletAfter = await query(
      `SELECT balance, winnings_balance, locked_deposit_balance FROM wallets WHERE user_id = $1`,
      [userId],
    );
    return res.json({
      success: true,
      betId,
      settled,
      wallet: walletAfter.rows[0] || null,
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/api/e2e/harness-status', (_req, res) => {
  res.json({ enabled: true, env: process.env.NODE_ENV || 'undefined' });
});

export default router;
export { harnessEnabled };
