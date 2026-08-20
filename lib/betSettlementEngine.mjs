/**
 * Server-Authoritative Bet Settlement Engine
 * Handles outcome evaluation, exact payout calculation (S * accepted_odds), accumulator leg evaluation,
 * and atomic financial commits using Phase 6 financial infrastructure.
 */

import { query, withTransaction } from '../db/pg.js';
import { evaluateSettlementRule, settleIPLSRLMarket } from './settlementRules.mjs';
import { convertToDecimalOdds } from './normalizers/oddsNormalizer.mjs';
import { applyVipOddsBoost } from './vipBenefits.mjs';

export class BetSettlementEngine {
  /** Settle a single bet server-authoritatively */
  async settleSingleBet({ betId, matchState }, correlationId = null) {
    if (!betId) {
      throw new Error('Bet ID is required for settlement');
    }

    // 1. Fetch Bet Record & Verification
    const betRes = await query('SELECT * FROM bets WHERE bet_id = $1', [betId]);
    if (betRes.rows.length === 0) {
      throw new Error(`Bet ${betId} not found`);
    }

    const bet = betRes.rows[0];
    if (bet.status === 'SETTLED') {
      return { status: 'ALREADY_SETTLED', betId, outcome: bet.status, payout: 0.00 };
    }

    const userId = bet.user_id;
    const stake = parseFloat(bet.stake);
    const acceptedOdds = convertToDecimalOdds(bet.accepted_odds || bet.odds || 1.0);
    const vipBoostPct = Number(bet.vip_boost_pct) || 0;

    // 2. Validate Canonical Match State
    const matchStatus = String(matchState?.status || 'COMPLETED').toUpperCase();
    if (matchStatus !== 'COMPLETED' && matchStatus !== 'FINAL' && matchStatus !== 'ABANDONED' && matchStatus !== 'CANCELLED') {
      throw new Error(`MATCH_NOT_FINAL: Match status is '${matchStatus}'. Settlement blocked.`);
    }

    // 3. Evaluate Settlement Outcome
    let outcome = 'LOST'; // 'WON' | 'LOST' | 'VOID' | 'PUSH'
    let payout = 0.00;
    let transactionType = 'BET_WIN';

    const ruleEval = evaluateSettlementRule(matchState, { selectionId: bet.selection_id });
    if (ruleEval.outcome === 'VOID') {
      outcome = 'VOID';
      payout = parseFloat(stake.toFixed(2));
      transactionType = 'BET_VOID';
    } else {
      const marketEval = settleIPLSRLMarket(bet.market_id || 'winner', bet.selection_id, matchState, `settle_${betId}`);
      if (marketEval.outcome === 'VOID' || marketEval.outcome === 'NO_RESULT') {
        outcome = 'VOID';
        payout = parseFloat(stake.toFixed(2));
        transactionType = 'BET_VOID';
      } else if (marketEval.outcome === 'PUSH') {
        outcome = 'VOID';
        payout = parseFloat(stake.toFixed(2));
        transactionType = 'BET_VOID';
      } else if (marketEval.outcome === 'WIN') {
        outcome = 'WON';
        const basePayout = stake * acceptedOdds;
        payout = parseFloat(applyVipOddsBoost(basePayout, vipBoostPct).toFixed(2));
        transactionType = 'BET_WIN';
      } else if (marketEval.outcome === 'HALF_WIN') {
        outcome = 'WON';
        const netProfit = stake * (acceptedOdds - 1.0) * 0.5;
        const halfWinPayout = stake + netProfit;
        payout = parseFloat(applyVipOddsBoost(halfWinPayout, vipBoostPct).toFixed(2));
        transactionType = 'BET_WIN';
      } else {
        outcome = 'LOST';
        payout = 0.00;
      }
    }

    // 4. Atomic Financial Settlement Commit (Phase 6 Transaction Boundary)
    const result = await withTransaction(async (client) => {
      // Re-verify bet status under lock
      const lockBet = await client.query('SELECT status FROM bets WHERE bet_id = $1 FOR UPDATE', [betId]);
      if (lockBet.rows[0].status === 'SETTLED') {
        return { status: 'ALREADY_SETTLED', betId, payout: 0.00 };
      }

      let newBalance = 0.00;
      const fundSource = String(bet.fund_source || 'cash').toLowerCase();
      let bonusCredit = 0;
      let freebetCredit = 0;
      let walletCashCredit = 0;

      if (outcome === 'VOID') {
        if (fundSource === 'bonus') bonusCredit = stake;
        else if (fundSource === 'freebet') freebetCredit = stake;
        else walletCashCredit = stake;
      } else if (outcome === 'WON' && payout > 0) {
        const profit = Math.max(0, parseFloat((payout - stake).toFixed(2)));
        if (fundSource === 'bonus') {
          // Rotate: stake returns to bonus; profit is cash winnings (not withdrawable until 5x).
          bonusCredit = stake;
          walletCashCredit = profit;
        } else if (fundSource === 'freebet') {
          walletCashCredit = profit;
        } else {
          walletCashCredit = payout;
        }
      }

      if (walletCashCredit > 0 || bonusCredit > 0 || freebetCredit > 0) {
        let walletRes = await client.query(
          `SELECT wallet_id, balance, bonus_balance, COALESCE(freebet_balance, 0) AS freebet_balance
           FROM wallets WHERE user_id = $1 FOR UPDATE`,
          [userId],
        );

        if (walletRes.rows.length === 0) {
          const newWalletId = `wal_${userId}`;
          walletRes = await client.query(
            `INSERT INTO wallets (wallet_id, user_id, balance, currency) VALUES ($1, $2, 0.00, 'INR') RETURNING wallet_id, balance, 0.00 AS bonus_balance, 0.00 AS freebet_balance`,
            [newWalletId, userId]
          );
        }

        const wallet = walletRes.rows[0];
        const nextCash = parseFloat((Number(wallet.balance || 0) + walletCashCredit).toFixed(2));
        const nextBonus = parseFloat((Number(wallet.bonus_balance || 0) + bonusCredit).toFixed(2));
        const nextFreebet = parseFloat((Number(wallet.freebet_balance || 0) + freebetCredit).toFixed(2));

        const newBalanceRes = await client.query(
          `UPDATE wallets
           SET balance = $1, bonus_balance = $2, freebet_balance = $3, updated_at = NOW()
           WHERE wallet_id = $4
           RETURNING balance`,
          [nextCash, nextBonus, nextFreebet, wallet.wallet_id],
        );
        newBalance = parseFloat(newBalanceRes.rows[0].balance);

        const creditAmount = walletCashCredit || bonusCredit || freebetCredit;
        const txId = `tx_payout_${betId}`;
        await client.query(
          `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
           VALUES ($1, $2, $3, $4, 'SUCCESS', NOW())
           ON CONFLICT (transaction_id) DO NOTHING`,
          [txId, userId, transactionType, creditAmount]
        );

        await client.query(
          `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
           VALUES ($1, $2, 'CREDIT', $3, $4, $5, NOW())`,
          [wallet.wallet_id, txId, creditAmount, newBalance, `Settlement Payout for Bet #${betId} (${outcome}/${fundSource})`]
        );
      }

      // Update Bet Record Status
      await client.query(
        `UPDATE bets SET status = 'SETTLED' WHERE bet_id = $1`,
        [betId]
      );

      // Record Outbox Event
      await client.query(
        `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status, correlation_id, created_at)
         VALUES ($1, 'bet.settled', 'bet', $2, $3, 'PENDING', $4, NOW())`,
        [`evt_settle_${betId}`, betId, JSON.stringify({ betId, userId, outcome, stake, odds: acceptedOdds, payout }), correlationId || null]
      );

      return {
        betId,
        userId,
        outcome,
        stake,
        acceptedOdds,
        payout,
        newBalance,
      };
    });

    // Trigger post-settlement hooks for bonus wagering progress & loyalty points
    if (outcome === 'WON' || outcome === 'LOST') {
      try {
        const { processBonusWageringProgress } = await import('./promotionsEngine.mjs');
        await processBonusWageringProgress({
          userId,
          betStake: stake,
          betOdds: acceptedOdds,
          fundSource: String(bet.fund_source || 'cash').toLowerCase(),
        });
      } catch (ignored) {}
    }

    return {
      success: true,
      status: 'SETTLED',
      ...result,
    };
  }
}

export const betSettlementEngine = new BetSettlementEngine();
