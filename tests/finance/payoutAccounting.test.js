import { describe, it, expect, beforeEach } from 'vitest';
import { query } from '../../db/pg.js';
import { betSettlementEngine } from '../../lib/betSettlementEngine.mjs';
import { splitSettlementWinCredits, repairUnderCreditedWinningsForBet } from '../../lib/walletSettlement.mjs';
import { computeBetProfit } from '../../lib/wageringRules.mjs';
import { financialReconciliationEngine } from '../../lib/financialReconciliationEngine.mjs';

describe('Financial payout accounting — canonical cases', () => {
  const userId = 'usr_payout_acct';
  const walletId = 'wal_payout_acct';
  const matchId = 'm_payout_acct';
  const marketId = 'mkt_payout_acct';

  beforeEach(async () => {
    await query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS winnings_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00`);
    await query(`ALTER TABLE bets ADD COLUMN IF NOT EXISTS winnings_credited NUMERIC(14,2)`);
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT DO NOTHING`, [userId, `${userId}@test.com`]);
    await query(`DELETE FROM ledger_entries WHERE wallet_id = $1`, [walletId]);
    await query(`DELETE FROM transactions WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM bets WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM wallets WHERE user_id = $1`, [userId]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, winnings_balance, currency) VALUES ($1, $2, 10000, 0, 'INR')`, [walletId, userId]);
    await query(`INSERT INTO matches (match_id, status) VALUES ($1, 'COMPLETED') ON CONFLICT (match_id) DO UPDATE SET status = 'COMPLETED'`, [matchId]);
    await query(`INSERT INTO markets (market_id, match_id, name, status) VALUES ($1, $2, 'Total', 'OPEN') ON CONFLICT (market_id) DO UPDATE SET status = 'OPEN'`, [marketId, matchId]);
  });

  async function placeAndSettle({ betId, selectionId, stake, odds, win }) {
    await query(
      `INSERT INTO selections (selection_id, market_id, name, odds, status) VALUES ($1, $2, 'Over', $3, 'OPEN') ON CONFLICT DO NOTHING`,
      [selectionId, marketId, odds],
    );
    await query(`UPDATE wallets SET balance = balance - $1 WHERE wallet_id = $2`, [stake, walletId]);
    await query(
      `INSERT INTO bets (bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds, potential_payout, status, fund_source, stake_from_cash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, 'ACCEPTED', 'cash', $6)`,
      [betId, userId, matchId, marketId, selectionId, stake, odds, stake * odds],
    );
    const matchState = win
      ? { matchId, status: 'COMPLETED', winnerId: selectionId, homeTeam: { teamId: selectionId }, awayTeam: { teamId: 'x' } }
      : { matchId, status: 'COMPLETED', winnerId: 'other', homeTeam: { teamId: 'other' }, awayTeam: { teamId: selectionId } };
    return betSettlementEngine.settleSingleBet({ betId, matchState: win ? matchState : { ...matchState, __forcedOutcome: 'LOST' } });
  }

  it('CASE 1 — WIN ₹500 @ 1.06 credits ₹530 to balance and ₹30 cumulative profit', async () => {
    const betId = `bet_case1_${Date.now()}`;
    const sel = `sel_case1_${Date.now()}`;
    const stake = 500;
    const odds = 1.06;
    const payout = 530;

    const split = splitSettlementWinCredits({ fund_source: 'cash', stake }, payout);
    expect(split.cashCredit).toBe(530);
    expect(split.winningsCredit).toBe(30);
    expect(computeBetProfit(payout, stake)).toBe(30);

    await placeAndSettle({ betId, selectionId: sel, stake, odds, win: true });

    const w = await query('SELECT balance, winnings_balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(w.rows[0].balance)).toBe(10000 - stake + payout);
    expect(parseFloat(w.rows[0].winnings_balance)).toBe(30);
  });

  it('CASE 2 — LOSS reduces cumulative winnings by stake', async () => {
    const betId = `bet_case2_${Date.now()}`;
    const sel = `sel_case2_${Date.now()}`;
    await placeAndSettle({ betId, selectionId: sel, stake: 500, odds: 1.06, win: false });

    const w = await query('SELECT balance, winnings_balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(w.rows[0].balance)).toBe(9500);
    expect(parseFloat(w.rows[0].winnings_balance)).toBe(-500);
  });

  it('CASE 5 — multiple bets accumulate net profit ₹30 + ₹100 - ₹500 = -₹370', async () => {
    await query('UPDATE wallets SET balance = 10000, winnings_balance = 0 WHERE wallet_id = $1', [walletId]);

    await placeAndSettle({ betId: `bet_a_${Date.now()}`, selectionId: `sel_a_${Date.now()}`, stake: 500, odds: 1.06, win: true });
    await query('UPDATE wallets SET balance = balance - 100 WHERE wallet_id = $1', [walletId]);
    await placeAndSettle({ betId: `bet_b_${Date.now()}`, selectionId: `sel_b_${Date.now()}`, stake: 100, odds: 2, win: true });
    await query('UPDATE wallets SET balance = balance - 500 WHERE wallet_id = $1', [walletId]);
    await placeAndSettle({ betId: `bet_c_${Date.now()}`, selectionId: `sel_c_${Date.now()}`, stake: 500, odds: 1.5, win: false });

    const w = await query('SELECT winnings_balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(w.rows[0].winnings_balance)).toBe(-370);
  });

  it('repair corrects inflated cumulative winnings from legacy full-payout credits', async () => {
    const betId = 'bet_repair_case';
    await query(`DELETE FROM bets WHERE bet_id = $1`, [betId]);
    await query(`UPDATE wallets SET balance = 10530, winnings_balance = 530 WHERE wallet_id = $1`, [walletId]);
    await query(`INSERT INTO selections (selection_id, market_id, name, odds, status) VALUES ('sel_r', $1, 'Over', 1.06, 'OPEN') ON CONFLICT DO NOTHING`, [marketId]);
    await query(
      `INSERT INTO bets (bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds, potential_payout, status, fund_source, actual_payout, winnings_credited)
       VALUES ($1, $2, $3, $4, 'sel_r', 500, 1.06, 1.06, 530, 'WON', 'cash', 530, 530)`,
      [betId, userId, matchId, marketId],
    );

    const res = await repairUnderCreditedWinningsForBet(betId);
    expect(res.adjusted).toBe(-500);

    const w = await query('SELECT winnings_balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(w.rows[0].winnings_balance)).toBe(30);

    const audit = await financialReconciliationEngine.auditWinningPayoutCredits({ userId });
    expect(audit.issueCount).toBe(0);
  });
});
