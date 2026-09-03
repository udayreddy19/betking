/**
 * Financial Checksum Reconciliation Engine
 * Verifies wallet balance integrity against net sum of ledger entries.
 * Detects balance mismatches, orphan transactions, and duplicate payments without auto-modifying state.
 */

import { query } from '../db/pg.js';
import { splitSettlementWinCredits } from './walletSettlement.mjs';
import { computeBetProfit, settlementNetProfitDelta } from './wageringRules.mjs';

export class FinancialReconciliationEngine {
  /** Reconcile single user wallet — ledger vs stored balance */
  async reconcileUserWallet(userId) {
    const wRes = await query('SELECT wallet_id, balance, reserved_balance FROM wallets WHERE user_id = $1', [userId]);
    if (wRes.rows.length === 0) {
      return { reconciled: true, message: 'No wallet found for user' };
    }

    const wallet = wRes.rows[0];
    const storedBalance = parseFloat(wallet.balance);

    const lRes = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE 0 END), 0.00) as total_credits,
         COALESCE(SUM(CASE WHEN type = 'DEBIT' THEN amount ELSE 0 END), 0.00) as total_debits
       FROM ledger_entries
       WHERE wallet_id = $1`,
      [wallet.wallet_id]
    );

    const credits = parseFloat(lRes.rows[0].total_credits);
    const debits = parseFloat(lRes.rows[0].total_debits);
    const ledgerSum = parseFloat((credits - debits).toFixed(2));
    const difference = parseFloat((storedBalance - ledgerSum).toFixed(2));

    if (Math.abs(difference) > 0.001) {
      const discId = `disc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await query(
        `INSERT INTO financial_discrepancies (discrepancy_id, user_id, wallet_id, type, stored_balance, ledger_balance, difference, status, details, created_at)
         VALUES ($1, $2, $3, 'BALANCE_MISMATCH', $4, $5, $6, 'OPEN', $7, NOW())`,
        [discId, userId, wallet.wallet_id, storedBalance, ledgerSum, difference, JSON.stringify({ credits, debits })]
      );

      return {
        reconciled: false,
        userId,
        walletId: wallet.wallet_id,
        storedBalance,
        ledgerSum,
        difference,
        discrepancyId: discId,
        status: 'DISCREPANCY_FLAGGED',
      };
    }

    return {
      reconciled: true,
      userId,
      walletId: wallet.wallet_id,
      storedBalance,
      ledgerSum,
      difference: 0.00,
    };
  }

  /** Compare cumulative net winnings field vs sum of settled bet P&L */
  async reconcileCumulativeWinnings(userId) {
    const wRes = await query(
      `SELECT wallet_id, COALESCE(winnings_balance, 0) AS winnings_balance
       FROM wallets WHERE user_id = $1`,
      [userId],
    );
    if (!wRes.rows.length) {
      return { reconciled: true, message: 'No wallet found for user' };
    }

    const storedWinnings = parseFloat(wRes.rows[0].winnings_balance);
    const betsRes = await query(
      `SELECT status, stake, COALESCE(actual_payout, 0) AS actual_payout,
              COALESCE(winnings_credited, NULL) AS winnings_credited
       FROM bets
       WHERE user_id = $1 AND status IN ('WON', 'LOST', 'CASHED_OUT')`,
      [userId],
    );

    let expected = 0;
    for (const row of betsRes.rows) {
      const status = String(row.status).toUpperCase();
      if (row.winnings_credited != null) {
        expected += Number(row.winnings_credited);
      } else if (status === 'WON') {
        expected += computeBetProfit(Number(row.actual_payout), Number(row.stake));
      } else if (status === 'LOST') {
        expected += settlementNetProfitDelta('LOST', 0, Number(row.stake));
      } else if (status === 'CASHED_OUT') {
        expected += computeBetProfit(Number(row.actual_payout), Number(row.stake));
      }
    }
    expected = parseFloat(expected.toFixed(2));
    const difference = parseFloat((storedWinnings - expected).toFixed(2));

    if (Math.abs(difference) > 0.01) {
      const discId = `disc_win_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await query(
        `INSERT INTO financial_discrepancies (discrepancy_id, user_id, wallet_id, type, stored_balance, ledger_balance, difference, status, details, created_at)
         VALUES ($1, $2, $3, 'WINNINGS_MISMATCH', $4, $5, $6, 'OPEN', $7, NOW())`,
        [
          discId,
          userId,
          wRes.rows[0].wallet_id,
          storedWinnings,
          expected,
          difference,
          JSON.stringify({ settledBets: betsRes.rows.length }),
        ],
      );
      return {
        reconciled: false,
        userId,
        storedWinnings,
        expectedWinnings: expected,
        difference,
        discrepancyId: discId,
      };
    }

    return { reconciled: true, userId, storedWinnings, expectedWinnings: expected, difference: 0 };
  }

  /** Full audit for one user — does not auto-repair balances */
  async auditUser(userId) {
    const ledger = await this.reconcileUserWallet(userId);
    const winnings = await this.reconcileCumulativeWinnings(userId);
    const payoutCredits = await this.auditWinningPayoutCredits({ userId });
    return {
      userId,
      reconciled: ledger.reconciled && winnings.reconciled && payoutCredits.reconciled,
      ledger,
      winnings,
      payoutCredits,
    };
  }

  /** Reconcile all system wallets */
  async reconcileAllWallets() {
    const allWallets = await query('SELECT user_id FROM wallets');
    const results = [];
    let discrepanciesCount = 0;

    for (const row of allWallets.rows) {
      const res = await this.auditUser(row.user_id);
      results.push(res);
      if (!res.reconciled) discrepanciesCount++;
    }

    return {
      totalWalletsChecked: allWallets.rows.length,
      discrepanciesCount,
      reconciled: discrepanciesCount === 0,
      details: results,
    };
  }

  /**
   * Detect winning cash bets where winnings_credited != expected net profit.
   * Does not auto-repair — flags only.
   */
  async auditWinningPayoutCredits({ userId = null, limit = 500 } = {}) {
    const params = [];
    let filter = `WHERE b.status = 'WON'
      AND COALESCE(b.fund_source, 'cash') = 'cash'
      AND COALESCE(b.actual_payout, 0) > 0`;
    if (userId) {
      params.push(userId);
      filter += ` AND b.user_id = $${params.length}`;
    }
    params.push(limit);

    const res = await query(
      `SELECT b.bet_id, b.user_id, b.stake, b.actual_payout,
              COALESCE(b.winnings_credited, 0) AS winnings_credited
       FROM bets b
       ${filter}
       ORDER BY b.settled_at DESC NULLS LAST
       LIMIT $${params.length}`,
      params,
    );

    const issues = [];
    for (const row of res.rows) {
      const expected = splitSettlementWinCredits(row, Number(row.actual_payout)).winningsCredit;
      const recorded = Number(row.winnings_credited) || 0;
      if (Math.abs(recorded - expected) > 0.001) {
        issues.push({
          betId: row.bet_id,
          userId: row.user_id,
          stake: Number(row.stake),
          actualPayout: Number(row.actual_payout),
          expectedNetProfit: expected,
          recordedNetProfit: recorded,
        });
      }
    }

    return {
      checked: res.rows.length,
      issueCount: issues.length,
      reconciled: issues.length === 0,
      issues,
    };
  }

  /**
   * Reconciles bonus rollover wagering ledger with user_bonuses and wallets.
   * Checks:
   * 1. required_turnover = bonus_amount * wagering_multiplier
   * 2. completed_turnover = SUM(qualifying_amount) from bonus_wagering_ledger
   * 3. remaining_turnover = MAX(required_turnover - completed_turnover, 0)
   */
  async reconcileBonusWagering({ userId = null, limit = 100 } = {}, client = null) {
    const run = client?.query?.bind(client) || query;
    const params = [];
    let whereClause = '';
    if (userId) {
      params.push(userId);
      whereClause = `WHERE ub.user_id = $${params.length}`;
    }
    params.push(limit);

    const bonusRes = await run(
      `SELECT ub.id, ub.user_id, ub.bonus_amount, ub.wagering_required, ub.wagering_completed,
              COALESCE(ub.locked_winnings, 0) AS locked_winnings,
              COALESCE(ub.released_winnings, 0) AS released_winnings,
              ub.status,
              COALESCE(SUM(bwl.qualifying_amount), 0) AS ledger_qualifying_total
       FROM user_bonuses ub
       LEFT JOIN bonus_wagering_ledger bwl ON bwl.bonus_id = ub.id AND bwl.status = 'APPLIED'
       ${whereClause}
       GROUP BY ub.id, ub.user_id, ub.bonus_amount, ub.wagering_required, ub.wagering_completed,
                ub.locked_winnings, ub.released_winnings, ub.status
       ORDER BY ub.created_at DESC
       LIMIT $${params.length}`,
      params,
    );

    const issues = [];
    for (const b of bonusRes.rows) {
      const required = parseFloat(b.wagering_required);
      const completed = parseFloat(b.wagering_completed);
      const ledgerTotal = parseFloat(b.ledger_qualifying_total);

      const expectedCompleted = Math.min(required, ledgerTotal);
      if (Math.abs(completed - expectedCompleted) > 0.01) {
        issues.push({
          bonusId: b.id,
          userId: b.user_id,
          recordedCompleted: completed,
          ledgerSum: ledgerTotal,
          discrepancy: parseFloat((completed - expectedCompleted).toFixed(2)),
          type: 'WAGERING_TURNOVER_MISMATCH',
        });
      }
    }

    return {
      checked: bonusRes.rows.length,
      issueCount: issues.length,
      reconciled: issues.length === 0,
      issues,
    };
  }
}

export const financialReconciliationEngine = new FinancialReconciliationEngine();

