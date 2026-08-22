/**
 * Deterministic closed-match money flow — real placement debit + settlement credit paths.
 * Odds quoting is mocked; wallet/ledger/settlement transactions are NOT mocked.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../lib/oddsQuoteService.mjs', () => ({
  resolveServerOdds: vi.fn(async ({ clientOdds, marketId, selectionId, matchId }) => ({
    odds: 2.0,
    changed: false,
    previousOdds: clientOdds != null ? Number(clientOdds) : null,
    marketId,
    selectionId,
    stateVersion: 42,
    oddsVersion: 7,
    generatedAt: '2026-08-22T12:00:00.000Z',
    expiresAt: '2026-08-22T12:00:05.000Z',
  })),
  unwrapServerOddsQuote: (quote) => (quote?.odds != null ? Number(quote.odds) : Number(quote)),
}));

import { query } from '../../db/pg.js';
import { betPlacementEngine } from '../../lib/betPlacementEngine.mjs';
import { betSettlementEngine } from '../../lib/betSettlementEngine.mjs';
import { marketSuspensionEngine } from '../../lib/marketSuspensionEngine.mjs';
import { financialReconciliationEngine } from '../../lib/financialReconciliationEngine.mjs';
import { getAvailableBalance, getWithdrawableAmount } from '../../lib/wageringRules.mjs';
import { processPendingOutboxEvents } from '../../lib/outboxWorker.mjs';

describe('Closed-match money flow (WON / LOST / VOID)', () => {
  const userId = 'usr_closed_flow';
  const walletId = 'wal_closed_flow';
  const matchId = 'm_closed_flow';
  const marketId = 'match_winner';
  const selectionId = 'sel_home_closed';
  const STAKE = 500;

  beforeEach(async () => {
    await marketSuspensionEngine.clearSuspensionCause(marketId, 'STALE_ODDS');
    await marketSuspensionEngine.clearSuspensionCause(marketId, 'MANUAL_ADMIN');
    await query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS winnings_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00`);
    await query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS reserved_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00`);
    await query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS locked_deposit_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00`);
    await query(`ALTER TABLE bets ADD COLUMN IF NOT EXISTS winnings_credited NUMERIC(14,2)`);
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT DO NOTHING`, [userId, `${userId}@test.com`]);
    await query(`DELETE FROM ledger_entries WHERE wallet_id = $1`, [walletId]);
    await query(`DELETE FROM transactions WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM bets WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM outbox_events WHERE payload::text LIKE $1`, [`%${userId}%`]);
    await query(`DELETE FROM wallets WHERE user_id = $1`, [userId]);
    await query(
      `INSERT INTO wallets (wallet_id, user_id, balance, winnings_balance, currency)
       VALUES ($1, $2, 2000, 0, 'INR')`,
      [walletId, userId],
    );
    const openTx = `tx_open_${userId}`;
    await query(
      `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
       VALUES ($1, $2, 'DEPOSIT', 2000, 'SUCCESS', NOW()) ON CONFLICT DO NOTHING`,
      [openTx, userId],
    );
    await query(
      `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
       VALUES ($1, $2, 'CREDIT', 2000, 2000, 'Opening balance for closed-match test', NOW())
       ON CONFLICT DO NOTHING`,
      [walletId, openTx],
    );
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
       VALUES ($1, $2, 'Home', 2.00, 'OPEN') ON CONFLICT DO NOTHING`,
      [selectionId, marketId],
    );
    await query(`DELETE FROM user_account_controls WHERE user_id = $1`, [userId]);
  });

  async function placeStakeBet(idempotencyKey) {
    const res = await betPlacementEngine.placeBet({
      userId,
      matchId,
      marketId,
      selectionId,
      stake: STAKE,
      clientOdds: 2.0,
      fundSource: 'cash',
      idempotencyKey,
    });
    expect(res.success).toBe(true);
    expect(res.status).toBe('ACCEPTED');
    return res.betId;
  }

  async function walletRow() {
    const w = await query(
      `SELECT balance, winnings_balance, reserved_balance, locked_deposit_balance FROM wallets WHERE wallet_id = $1`,
      [walletId],
    );
    return w.rows[0];
  }

  async function ledgerForBet(betId) {
    return query(
      `SELECT type, amount, balance_after, description FROM ledger_entries
       WHERE description LIKE $1 ORDER BY created_at ASC`,
      [`%${betId}%`],
    );
  }

  it('A. WON — ₹500 debit, ₹1000 payout, single tx + ledger credit, reconciled', async () => {
    const betId = await placeStakeBet(`idem_won_${Date.now()}`);

    let w = await walletRow();
    expect(parseFloat(w.balance)).toBe(1500);

    const debits = await ledgerForBet(betId);
    expect(debits.rows.filter((r) => r.type === 'DEBIT')).toHaveLength(1);
    expect(parseFloat(debits.rows[0].amount)).toBe(STAKE);

    const snap = await query(`SELECT placement_snapshot, odds_version FROM bets WHERE bet_id = $1`, [betId]);
    const placement = typeof snap.rows[0].placement_snapshot === 'string'
      ? JSON.parse(snap.rows[0].placement_snapshot)
      : snap.rows[0].placement_snapshot;
    expect(placement.stateVersionAtPlacement).toBe(42);
    expect(Number(snap.rows[0].odds_version)).toBe(7);

    await query(`UPDATE matches SET status = 'COMPLETED' WHERE match_id = $1`, [matchId]);

    const matchState = {
      matchId,
      status: 'COMPLETED',
      winnerId: selectionId,
      homeTeam: { teamId: selectionId },
      awayTeam: { teamId: 'away_closed' },
      stateVersion: 99,
    };

    const settled = await betSettlementEngine.settleSingleBet({ betId, matchState });
    expect(settled.status).toBe('SETTLED');
    expect(settled.outcome).toBe('WON');
    expect(settled.payout).toBe(1000);

    w = await walletRow();
    expect(parseFloat(w.balance)).toBe(2500);
    expect(parseFloat(w.winnings_balance)).toBe(500);

    const view = { balance: 2500, reservedBalance: 0, lockedDepositBalance: 0, winningsBalance: 500 };
    expect(getAvailableBalance(view)).toBe(2500);
    expect(getWithdrawableAmount(view)).toBe(2500);

    const txCount = await query(
      `SELECT COUNT(*) FROM transactions WHERE transaction_id = $1`,
      [`tx_payout_${betId}`],
    );
    expect(Number(txCount.rows[0].count)).toBe(1);

    const credits = await ledgerForBet(betId);
    expect(credits.rows.filter((r) => r.type === 'CREDIT')).toHaveLength(1);
    expect(parseFloat(credits.rows[1]?.amount || credits.rows.find((r) => r.type === 'CREDIT')?.amount)).toBe(1000);

    const dup = await betSettlementEngine.settleSingleBet({ betId, matchState });
    expect(dup.status).toBe('ALREADY_SETTLED');

    w = await walletRow();
    expect(parseFloat(w.balance)).toBe(2500);

    await processPendingOutboxEvents(10);
    const outbox = await query(`SELECT event_type FROM outbox_events WHERE aggregate_id = $1`, [betId]);
    expect(outbox.rows.some((r) => r.event_type === 'BET_SETTLED')).toBe(true);

    const audit = await financialReconciliationEngine.auditUser(userId);
    expect(audit.reconciled).toBe(true);
  });

  it('B. LOST — single stake debit, no payout credit, winnings delta −₹500', async () => {
    const betId = await placeStakeBet(`idem_lost_${Date.now()}`);

    await query(`UPDATE matches SET status = 'COMPLETED' WHERE match_id = $1`, [matchId]);

    const settled = await betSettlementEngine.settleSingleBet({
      betId,
      matchState: { matchId, status: 'COMPLETED', __forcedOutcome: 'LOST' },
    });
    expect(settled.outcome).toBe('LOST');
    expect(settled.payout).toBe(0);

    const w = await walletRow();
    expect(parseFloat(w.balance)).toBe(1500);
    expect(parseFloat(w.winnings_balance)).toBe(-500);

    const payoutTx = await query(
      `SELECT COUNT(*) FROM transactions WHERE transaction_id = $1`,
      [`tx_payout_${betId}`],
    );
    expect(Number(payoutTx.rows[0].count)).toBe(0);

    const credits = await query(
      `SELECT COUNT(*) FROM ledger_entries WHERE wallet_id = $1 AND type = 'CREDIT' AND description LIKE $2`,
      [walletId, `%${betId}%`],
    );
    expect(Number(credits.rows[0].count)).toBe(0);

    const audit = await financialReconciliationEngine.auditUser(userId);
    expect(audit.reconciled).toBe(true);
  });

  it('C. VOID — stake refunded exactly once, reconciled', async () => {
    const betId = await placeStakeBet(`idem_void_${Date.now()}`);

    const settled = await betSettlementEngine.settleSingleBet({
      betId,
      matchState: { matchId, status: 'COMPLETED', __forcedOutcome: 'VOID' },
    });
    expect(settled.outcome).toBe('VOID');
    expect(settled.payout).toBe(STAKE);

    const w = await walletRow();
    expect(parseFloat(w.balance)).toBe(2000);

    const txCount = await query(
      `SELECT COUNT(*) FROM transactions WHERE transaction_id = $1`,
      [`tx_payout_${betId}`],
    );
    expect(Number(txCount.rows[0].count)).toBe(1);

    const credits = await ledgerForBet(betId);
    expect(credits.rows.filter((r) => r.type === 'CREDIT')).toHaveLength(1);
    expect(parseFloat(credits.rows.find((r) => r.type === 'CREDIT').amount)).toBe(STAKE);

    const dup = await betSettlementEngine.settleSingleBet({
      betId,
      matchState: { matchId, status: 'COMPLETED', __forcedOutcome: 'VOID' },
    });
    expect(dup.status).toBe('ALREADY_SETTLED');

    const w2 = await walletRow();
    expect(parseFloat(w2.balance)).toBe(2000);

    const audit = await financialReconciliationEngine.auditUser(userId);
    expect(audit.reconciled).toBe(true);
  });

  it('₹500 @ 1.06 WIN — stake+profit return ₹530, winnings +₹30, bettable = balance', async () => {
    const betId = await placeStakeBet(`idem_530_${Date.now()}`);
    await query(
      `UPDATE bets SET odds = 1.06, accepted_odds = 1.06, potential_payout = 530 WHERE bet_id = $1`,
      [betId],
    );

    const settled = await betSettlementEngine.settleSingleBet({
      betId,
      matchState: { matchId, status: 'COMPLETED', __forcedOutcome: 'WON' },
    });
    expect(settled.outcome).toBe('WON');
    expect(settled.payout).toBe(530);

    const w = await walletRow();
    expect(parseFloat(w.balance)).toBe(2030);
    expect(parseFloat(w.winnings_balance)).toBe(30);

    const view = {
      balance: Number(w.balance),
      reservedBalance: 0,
      lockedDepositBalance: 0,
      winningsBalance: Number(w.winnings_balance),
    };
    expect(getAvailableBalance(view)).toBe(2030);
    expect(getWithdrawableAmount(view)).toBe(2030);

    const credits = await ledgerForBet(betId);
    expect(credits.rows.filter((r) => r.type === 'CREDIT')).toHaveLength(1);
    expect(parseFloat(credits.rows.find((r) => r.type === 'CREDIT').amount)).toBe(530);
  });
});
