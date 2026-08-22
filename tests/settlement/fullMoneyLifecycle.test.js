/**
 * Full money lifecycle: deposit credit → place → settle WIN @1.06 → second bet from winnings
 * + LOSS / VOID paths. Odds quoting mocked; wallet/ledger real.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../lib/oddsQuoteService.mjs', () => ({
  resolveServerOdds: vi.fn(async ({ clientOdds, marketId, selectionId }) => ({
    odds: clientOdds != null ? Number(clientOdds) : 1.06,
    changed: false,
    previousOdds: clientOdds != null ? Number(clientOdds) : null,
    marketId,
    selectionId,
    stateVersion: 1,
    oddsVersion: 1,
    generatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5000).toISOString(),
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

describe('Full money lifecycle (deposit → win → second bet)', () => {
  const userId = 'usr_money_life';
  const walletId = 'wal_money_life';
  const matchId = 'm_money_life';
  const marketId = 'match_winner_life';
  const selectionId = 'sel_home_life';

  beforeEach(async () => {
    await marketSuspensionEngine.clearSuspensionCause(marketId, 'STALE_ODDS');
    await marketSuspensionEngine.clearSuspensionCause(marketId, 'MANUAL_ADMIN');
    await query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS winnings_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00`);
    await query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS reserved_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00`);
    await query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS locked_deposit_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00`);
    await query(`ALTER TABLE bets ADD COLUMN IF NOT EXISTS winnings_credited NUMERIC(14,2)`);
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT DO NOTHING`, [
      userId,
      `${userId}@test.com`,
    ]);
    await query(`DELETE FROM ledger_entries WHERE wallet_id = $1`, [walletId]);
    await query(`DELETE FROM transactions WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM bets WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM outbox_events WHERE payload::text LIKE $1`, [`%${userId}%`]);
    await query(`DELETE FROM wallets WHERE user_id = $1`, [userId]);
    await query(
      `INSERT INTO wallets (wallet_id, user_id, balance, winnings_balance, locked_deposit_balance, currency)
       VALUES ($1, $2, 0, 0, 0, 'INR')`,
      [walletId, userId],
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
       VALUES ($1, $2, 'Home', 1.06, 'OPEN')
       ON CONFLICT (selection_id) DO UPDATE SET odds = 1.06, status = 'OPEN'`,
      [selectionId, marketId],
    );
    await query(`DELETE FROM user_account_controls WHERE user_id = $1`, [userId]);
  });

  async function creditDeposit(amount) {
    const txId = `tx_dep_${userId}_${Date.now()}`;
    await query(`UPDATE wallets SET balance = balance + $1, locked_deposit_balance = COALESCE(locked_deposit_balance,0) + $1 WHERE wallet_id = $2`, [
      amount,
      walletId,
    ]);
    const bal = await query(`SELECT balance FROM wallets WHERE wallet_id = $1`, [walletId]);
    const newBal = Number(bal.rows[0].balance);
    await query(
      `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
       VALUES ($1, $2, 'DEPOSIT', $3, 'SUCCESS', NOW())`,
      [txId, userId, amount],
    );
    await query(
      `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
       VALUES ($1, $2, 'CREDIT', $3, $4, 'Test deposit', NOW())`,
      [walletId, txId, amount, newBal],
    );
    return newBal;
  }

  async function placeBet({ stake, odds, key }) {
    const res = await betPlacementEngine.placeBet({
      userId,
      matchId,
      marketId,
      selectionId,
      stake,
      clientOdds: odds,
      fundSource: 'cash',
      idempotencyKey: key,
    });
    expect(res.success).toBe(true);
    expect(res.status).toBe('ACCEPTED');
    return res.betId;
  }

  async function wallet() {
    const w = await query(
      `SELECT balance, winnings_balance, reserved_balance, locked_deposit_balance FROM wallets WHERE wallet_id = $1`,
      [walletId],
    );
    return w.rows[0];
  }

  it('WIN path: ₹1000 deposit → ₹500@1.06 → ₹1030 → second ₹1000 bet → ₹30', async () => {
    await creditDeposit(1000);
    let w = await wallet();
    expect(parseFloat(w.balance)).toBe(1000);
    expect(getAvailableBalance({ balance: 1000 })).toBe(1000);

    const betId = await placeBet({ stake: 500, odds: 1.06, key: `life_win_${Date.now()}` });
    w = await wallet();
    expect(parseFloat(w.balance)).toBe(500);

    const stakeDebits = await query(
      `SELECT COUNT(*)::int AS c FROM ledger_entries WHERE wallet_id = $1 AND type = 'DEBIT' AND description LIKE $2`,
      [walletId, `%${betId}%`],
    );
    expect(stakeDebits.rows[0].c).toBe(1);

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

    w = await wallet();
    expect(parseFloat(w.balance)).toBe(1030);
    expect(parseFloat(w.winnings_balance)).toBe(30);
    expect(getAvailableBalance({ balance: Number(w.balance) })).toBe(1030);
    expect(getWithdrawableAmount({
      balance: Number(w.balance),
      lockedDepositBalance: Number(w.locked_deposit_balance),
    })).toBe(getWithdrawableAmount({
      balance: 1030,
      lockedDepositBalance: Number(w.locked_deposit_balance),
    }));

    const payoutCredits = await query(
      `SELECT COUNT(*)::int AS c FROM ledger_entries WHERE wallet_id = $1 AND type = 'CREDIT' AND description LIKE $2`,
      [walletId, `%${betId}%`],
    );
    expect(payoutCredits.rows[0].c).toBe(1);

    await processPendingOutboxEvents(10);

    // Second bet using full available (includes payout) — ₹1000
    const bet2 = await placeBet({ stake: 1000, odds: 1.06, key: `life_win2_${Date.now()}` });
    w = await wallet();
    expect(parseFloat(w.balance)).toBe(30);
    expect(bet2).toBeTruthy();

    const audit = await financialReconciliationEngine.auditUser(userId);
    expect(audit.ledger?.reconciled !== false || audit.reconciled).toBeTruthy();
  });

  it('LOSS path: no payout credit; balance = deposit − stake', async () => {
    await creditDeposit(1000);
    const betId = await placeBet({ stake: 500, odds: 1.06, key: `life_loss_${Date.now()}` });
    const settled = await betSettlementEngine.settleSingleBet({
      betId,
      matchState: { matchId, status: 'COMPLETED', __forcedOutcome: 'LOST' },
    });
    expect(settled.outcome).toBe('LOST');
    expect(settled.payout).toBe(0);
    const w = await wallet();
    expect(parseFloat(w.balance)).toBe(500);
    const credits = await query(
      `SELECT COUNT(*)::int AS c FROM ledger_entries WHERE wallet_id = $1 AND type = 'CREDIT' AND description LIKE $2`,
      [walletId, `%${betId}%`],
    );
    expect(credits.rows[0].c).toBe(0);
  });

  it('VOID path: exactly one refund credit', async () => {
    await creditDeposit(1000);
    const betId = await placeBet({ stake: 500, odds: 1.06, key: `life_void_${Date.now()}` });
    const settled = await betSettlementEngine.settleSingleBet({
      betId,
      matchState: { matchId, status: 'COMPLETED', __forcedOutcome: 'VOID' },
    });
    expect(settled.outcome).toBe('VOID');
    const w = await wallet();
    expect(parseFloat(w.balance)).toBe(1000);
    const credits = await query(
      `SELECT COUNT(*)::int AS c FROM ledger_entries WHERE wallet_id = $1 AND type = 'CREDIT' AND description LIKE $2`,
      [walletId, `%${betId}%`],
    );
    expect(credits.rows[0].c).toBe(1);
    const dup = await betSettlementEngine.settleSingleBet({
      betId,
      matchState: { matchId, status: 'COMPLETED', __forcedOutcome: 'VOID' },
    });
    expect(dup.status).toBe('ALREADY_SETTLED');
    const credits2 = await query(
      `SELECT COUNT(*)::int AS c FROM ledger_entries WHERE wallet_id = $1 AND type = 'CREDIT' AND description LIKE $2`,
      [walletId, `%${betId}%`],
    );
    expect(credits2.rows[0].c).toBe(1);
  });
});
