import { describe, it, expect, beforeEach } from 'vitest';
import { query } from '../../db/pg.js';
import { betSettlementEngine } from '../../lib/betSettlementEngine.mjs';
import { splitSettlementWinCredits, repairUnderCreditedWinningsForBet } from '../../lib/walletSettlement.mjs';
import { getAvailableBalance } from '../../lib/wageringRules.mjs';
import { financialReconciliationEngine } from '../../lib/financialReconciliationEngine.mjs';

describe('Financial wallet integration — authoritative balance model', () => {
  const userId = 'usr_wallet_e2e';
  const walletId = 'wal_wallet_e2e';
  const matchId = 'm_wallet_e2e';
  const marketId = 'mkt_wallet_e2e';

  beforeEach(async () => {
    await query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS winnings_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00`);
    await query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS reserved_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00`);
    await query(`ALTER TABLE bets ADD COLUMN IF NOT EXISTS winnings_credited NUMERIC(14,2)`);
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT DO NOTHING`, [userId, `${userId}@test.com`]);
    await query(`DELETE FROM ledger_entries WHERE wallet_id = $1`, [walletId]);
    await query(`DELETE FROM transactions WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM bets WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM wallets WHERE user_id = $1`, [userId]);
    await query(
      `INSERT INTO wallets (wallet_id, user_id, balance, winnings_balance, currency)
       VALUES ($1, $2, 1000, 0, 'INR')`,
      [walletId, userId],
    );
    await query(
      `INSERT INTO matches (match_id, status) VALUES ($1, 'COMPLETED')
       ON CONFLICT (match_id) DO UPDATE SET status = 'COMPLETED'`,
      [matchId],
    );
    await query(
      `INSERT INTO markets (market_id, match_id, name, status) VALUES ($1, $2, 'Winner', 'OPEN')
       ON CONFLICT (market_id) DO UPDATE SET status = 'OPEN'`,
      [marketId, matchId],
    );
  });

  async function seedSelection(selectionId, odds = 1.06) {
    await query(
      `INSERT INTO selections (selection_id, market_id, name, odds, status)
       VALUES ($1, $2, 'Home', $3, 'OPEN') ON CONFLICT DO NOTHING`,
      [selectionId, marketId, odds],
    );
  }

  async function settleWin(betId, selectionId, stake, odds) {
    const matchState = {
      matchId,
      status: 'COMPLETED',
      winnerId: selectionId,
      homeTeam: { teamId: selectionId },
      awayTeam: { teamId: 'away' },
    };
    return betSettlementEngine.settleSingleBet({ betId, matchState });
  }

  async function settleLost(betId) {
    return betSettlementEngine.settleSingleBet({
      betId,
      matchState: { matchId, status: 'COMPLETED', __forcedOutcome: 'LOST' },
    });
  }

  async function settleVoid(betId, stake) {
    return betSettlementEngine.settleSingleBet({
      betId,
      matchState: { matchId, status: 'COMPLETED', __forcedOutcome: 'VOID' },
    });
  }

  it('E2E — ₹1000 → bet ₹500 → win ₹530 → bet ₹300 → lose → void ₹200', async () => {
    const sel1 = `sel_e2e_1_${Date.now()}`;
    await seedSelection(sel1, 1.06);

    await query(`UPDATE wallets SET balance = 500 WHERE wallet_id = $1`, [walletId]);
    const bet1 = `bet_e2e_1_${Date.now()}`;
    await query(
      `INSERT INTO bets (bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds, potential_payout, status, fund_source, stake_from_cash)
       VALUES ($1, $2, $3, $4, $5, 500, 1.06, 1.06, 530, 'ACCEPTED', 'cash', 500)`,
      [bet1, userId, matchId, marketId, sel1],
    );
    await settleWin(bet1, sel1, 500, 1.06);

    let w = await query('SELECT balance, winnings_balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(w.rows[0].balance)).toBe(1030);
    expect(parseFloat(w.rows[0].winnings_balance)).toBe(30);

    await query(`UPDATE wallets SET balance = balance - 300 WHERE wallet_id = $1`, [walletId]);
    const sel2 = `sel_e2e_2_${Date.now()}`;
    await seedSelection(sel2, 2);
    const bet2 = `bet_e2e_2_${Date.now()}`;
    await query(
      `INSERT INTO bets (bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds, potential_payout, status, fund_source, stake_from_cash)
       VALUES ($1, $2, $3, $4, $5, 300, 2, 2, 600, 'ACCEPTED', 'cash', 300)`,
      [bet2, userId, matchId, marketId, sel2],
    );
    await settleLost(bet2);

    w = await query('SELECT balance, winnings_balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(w.rows[0].balance)).toBe(730);
    expect(parseFloat(w.rows[0].winnings_balance)).toBe(-270);

    await query(`UPDATE wallets SET balance = balance - 200 WHERE wallet_id = $1`, [walletId]);
    const sel3 = `sel_e2e_3_${Date.now()}`;
    await seedSelection(sel3, 1.5);
    const bet3 = `bet_e2e_3_${Date.now()}`;
    await query(
      `INSERT INTO bets (bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds, potential_payout, status, fund_source, stake_from_cash)
       VALUES ($1, $2, $3, $4, $5, 200, 1.5, 1.5, 300, 'ACCEPTED', 'cash', 200)`,
      [bet3, userId, matchId, marketId, sel3],
    );
    await settleVoid(bet3);

    w = await query('SELECT balance, winnings_balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(w.rows[0].balance)).toBe(730);
    expect(parseFloat(w.rows[0].winnings_balance)).toBe(-270);

    const audit = await financialReconciliationEngine.auditUser(userId);
    expect(audit.winnings.reconciled).toBe(true);
  });

  it('WIN ₹500 @ 1.06 — balance +₹530 payout, cumulative winnings +₹30 profit', async () => {
    const betId = `bet_case1_${Date.now()}`;
    const sel = `sel_case1_${Date.now()}`;
    const payout = 530;

    const split = splitSettlementWinCredits({ fund_source: 'cash', stake: 500 }, payout);
    expect(split.cashCredit).toBe(530);
    expect(split.winningsCredit).toBe(30);

    await seedSelection(sel, 1.06);
    await query(`UPDATE wallets SET balance = 500 WHERE wallet_id = $1`, [walletId]);
    await query(
      `INSERT INTO bets (bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds, potential_payout, status, fund_source, stake_from_cash)
       VALUES ($1, $2, $3, $4, $5, 500, 1.06, 1.06, 530, 'ACCEPTED', 'cash', 500)`,
      [betId, userId, matchId, marketId, sel],
    );
    await settleWin(betId, sel, 500, 1.06);

    const w = await query('SELECT balance, winnings_balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(w.rows[0].balance)).toBe(1030);
    expect(parseFloat(w.rows[0].winnings_balance)).toBe(30);

    const tx = await query(`SELECT type, amount FROM transactions WHERE transaction_id = $1`, [`tx_payout_${betId}`]);
    expect(tx.rows[0].type).toBe('BET_PAYOUT');
    expect(parseFloat(tx.rows[0].amount)).toBe(530);
  });

  it('settled winnings remain usable for next bet via available balance', async () => {
    await query(`UPDATE wallets SET balance = 1030, winnings_balance = 30 WHERE wallet_id = $1`, [walletId]);
    const view = { balance: 1030, reservedBalance: 0, lockedDepositBalance: 0, winningsBalance: 30 };
    expect(getAvailableBalance(view)).toBe(1030);
  });

  it('duplicate settlement is idempotent', async () => {
    const betId = `bet_dup_${Date.now()}`;
    const sel = `sel_dup_${Date.now()}`;
    await seedSelection(sel, 1.06);
    await query(`UPDATE wallets SET balance = 500 WHERE wallet_id = $1`, [walletId]);
    await query(
      `INSERT INTO bets (bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds, potential_payout, status, fund_source, stake_from_cash)
       VALUES ($1, $2, $3, $4, $5, 500, 1.06, 1.06, 530, 'ACCEPTED', 'cash', 500)`,
      [betId, userId, matchId, marketId, sel],
    );
    await settleWin(betId, sel, 500, 1.06);
    const second = await betSettlementEngine.settleSingleBet({
      betId,
      matchState: { matchId, status: 'COMPLETED', __forcedOutcome: 'WON' },
    });
    expect(second.status).toBe('ALREADY_SETTLED');

    const w = await query('SELECT balance, winnings_balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(w.rows[0].balance)).toBe(1030);
    expect(parseFloat(w.rows[0].winnings_balance)).toBe(30);
  });

  it('repair adjusts cumulative winnings when full payout was wrongly stored as profit credit', async () => {
    const betId = 'bet_repair_net';
    await query(`DELETE FROM bets WHERE bet_id = $1`, [betId]);
    await query(`UPDATE wallets SET balance = 1030, winnings_balance = 530 WHERE wallet_id = $1`, [walletId]);
    await seedSelection('sel_r', 1.06);
    await query(
      `INSERT INTO bets (bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds, potential_payout, status, fund_source, actual_payout, winnings_credited)
       VALUES ($1, $2, $3, $4, 'sel_r', 500, 1.06, 1.06, 530, 'WON', 'cash', 530, 530)`,
      [betId, userId, matchId, marketId],
    );

    const res = await repairUnderCreditedWinningsForBet(betId);
    expect(res.adjusted).toBe(-500);

    const w = await query('SELECT winnings_balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(w.rows[0].winnings_balance)).toBe(30);
  });
});
