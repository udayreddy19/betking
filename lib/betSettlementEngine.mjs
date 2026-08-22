/**
 * Server-Authoritative Bet Settlement Engine
 * Handles outcome evaluation, exact payout calculation (S * accepted_odds), accumulator leg evaluation,
 * and atomic financial commits using Phase 6 financial infrastructure.
 */

import { query, withTransaction } from '../db/pg.js';
import { evaluateSettlementRule, settleIPLSRLMarket } from './settlementRules.mjs';
import { convertToDecimalOdds } from './normalizers/oddsNormalizer.mjs';
import { applyVipOddsBoost } from './vipBenefits.mjs';
import { splitSettlementWinCredits, voidRefundCredits } from './walletSettlement.mjs';
import { logSettlement, recordBetStatusChange, recordSettlementEvent } from './settlement/settlementAudit.mjs';

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
    const prior = String(bet.status || '').toUpperCase();
    if (['SETTLED', 'WON', 'LOST', 'VOID', 'CASHED_OUT', 'REFUNDED'].includes(prior)) {
      logSettlement('BET_SETTLEMENT_ALREADY_SETTLED', { betId, outcome: prior });
      return { status: 'ALREADY_SETTLED', betId, outcome: prior, payout: 0.00 };
    }

    logSettlement('BET_SETTLEMENT_STARTED', { betId, priorStatus: prior });

    const userId = bet.user_id;
    const stake = parseFloat(bet.stake);
    const acceptedOdds = convertToDecimalOdds(bet.accepted_odds || bet.odds || 1.0);
    const vipBoostPct = Number(bet.vip_boost_pct) || 0;

    // 2. Validate Canonical Match State (in-play milestone/settlement via forced outcome)
    const matchStatus = String(matchState?.status || 'COMPLETED').toUpperCase();
    const forced = matchState?.__forcedOutcome != null;
    if (!forced && matchStatus !== 'COMPLETED' && matchStatus !== 'FINAL' && matchStatus !== 'ABANDONED' && matchStatus !== 'CANCELLED') {
      throw new Error(`MATCH_NOT_FINAL: Match status is '${matchStatus}'. Settlement blocked.`);
    }

    // 3. Evaluate Settlement Outcome
    let outcome = 'LOST';
    let payout = 0.00;
    let transactionType = 'BET_WIN';
    const settlementReason = matchState?.__settlementReason || null;

    if (matchState?.__forcedOutcome) {
      outcome = String(matchState.__forcedOutcome).toUpperCase();
      if (outcome === 'VOID' || outcome === 'PUSH') {
        payout = parseFloat(stake.toFixed(2));
        transactionType = 'BET_VOID';
        outcome = 'VOID';
      } else if (outcome === 'WON' || outcome === 'WIN') {
        outcome = 'WON';
        const basePayout = stake * acceptedOdds;
        payout = parseFloat(applyVipOddsBoost(basePayout, vipBoostPct).toFixed(2));
        transactionType = 'BET_WIN';
      } else {
        outcome = 'LOST';
        payout = 0.00;
      }
    } else {
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
    }

    // 4. Atomic Financial Settlement Commit (Phase 6 Transaction Boundary)
    const result = await withTransaction(async (client) => {
      // Re-verify bet status under lock
      const lockBet = await client.query('SELECT status FROM bets WHERE bet_id = $1 FOR UPDATE', [betId]);
      const lockStatus = String(lockBet.rows[0]?.status || '').toUpperCase();
      if (['SETTLED', 'WON', 'LOST', 'VOID', 'CASHED_OUT'].includes(lockStatus)) {
        return { status: 'ALREADY_SETTLED', betId, payout: 0.00 };
      }

      let newBalance = 0.00;
      const fundSource = String(bet.fund_source || 'cash').toLowerCase();
      let bonusCredit = 0;
      let freebetCredit = 0;
      let walletCashCredit = 0;
      let winningsCredit = 0;
      let lockedCredit = 0;

      if (outcome === 'VOID') {
        const refund = voidRefundCredits(bet);
        walletCashCredit = refund.balanceCredit;
        bonusCredit = refund.bonusCredit;
        freebetCredit = refund.freebetCredit;
        lockedCredit = refund.lockedCredit;
        winningsCredit = refund.winningsCredit;
      } else if (outcome === 'WON' && payout > 0) {
        const split = splitSettlementWinCredits(bet, payout);
        walletCashCredit = split.cashCredit;
        bonusCredit = split.bonusCredit;
        freebetCredit = split.freebetCredit;
        winningsCredit = split.winningsCredit;
      }
      // LOST: stake was deducted at placement — no wallet movement.

      if (walletCashCredit > 0 || bonusCredit > 0 || freebetCredit > 0 || winningsCredit > 0 || lockedCredit > 0) {
        let walletRes = await client.query(
          `SELECT wallet_id, balance, bonus_balance,
                  COALESCE(freebet_balance, 0) AS freebet_balance,
                  COALESCE(locked_deposit_balance, 0) AS locked_deposit_balance,
                  COALESCE(winnings_balance, 0) AS winnings_balance
           FROM wallets WHERE user_id = $1 FOR UPDATE`,
          [userId],
        );

        if (walletRes.rows.length === 0) {
          const newWalletId = `wal_${userId}`;
          walletRes = await client.query(
            `INSERT INTO wallets (wallet_id, user_id, balance, currency)
             VALUES ($1, $2, 0.00, 'INR')
             RETURNING wallet_id, balance, 0.00 AS bonus_balance, 0.00 AS freebet_balance,
                       0.00 AS locked_deposit_balance, 0.00 AS winnings_balance`,
            [newWalletId, userId],
          );
        }

        const wallet = walletRes.rows[0];
        const nextCash = parseFloat((Number(wallet.balance || 0) + walletCashCredit).toFixed(2));
        const nextBonus = parseFloat((Number(wallet.bonus_balance || 0) + bonusCredit).toFixed(2));
        const nextFreebet = parseFloat((Number(wallet.freebet_balance || 0) + freebetCredit).toFixed(2));
        const nextLocked = parseFloat((Number(wallet.locked_deposit_balance || 0) + lockedCredit).toFixed(2));
        const nextWinnings = parseFloat((Number(wallet.winnings_balance || 0) + winningsCredit).toFixed(2));

        const newBalanceRes = await client.query(
          `UPDATE wallets
           SET balance = $1,
               bonus_balance = $2,
               freebet_balance = $3,
               locked_deposit_balance = $4,
               winnings_balance = $5,
               updated_at = NOW()
           WHERE wallet_id = $6
           RETURNING balance`,
          [nextCash, nextBonus, nextFreebet, nextLocked, nextWinnings, wallet.wallet_id],
        );
        newBalance = parseFloat(newBalanceRes.rows[0].balance);

        const creditAmount = walletCashCredit || bonusCredit || freebetCredit || payout || stake;
        const txId = `tx_payout_${betId}`;
        await client.query(
          `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
           VALUES ($1, $2, $3, $4, 'SUCCESS', NOW())
           ON CONFLICT (transaction_id) DO NOTHING`,
          [txId, userId, transactionType, creditAmount],
        );

        await client.query(
          `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
           VALUES ($1, $2, 'CREDIT', $3, $4, $5, NOW())`,
          [
            wallet.wallet_id,
            txId,
            creditAmount,
            newBalance,
            `Settlement ${outcome} for Bet #${betId} (${fundSource}, winnings +₹${winningsCredit.toFixed(2)})`,
          ],
        );
      } else if (outcome === 'LOST') {
        const txId = `tx_lost_${betId}`;
        await client.query(
          `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
           VALUES ($1, $2, 'BET_LOSS', $3, 'SUCCESS', NOW())
           ON CONFLICT (transaction_id) DO NOTHING`,
          [txId, userId, stake],
        );
      }

      // Update Bet Record + settlement metadata
      await client.query(
        `UPDATE bets
         SET status = $1,
             settled_at = NOW(),
             actual_payout = $2,
             settlement_reason = $3,
             settlement_version = COALESCE(settlement_version, 0) + 1
         WHERE bet_id = $4`,
        [outcome, payout, settlementReason, betId],
      );

      // Sync leg rows when grader supplied per-leg outcomes
      const legOutcomes = matchState?.__legOutcomes;
      if (Array.isArray(legOutcomes) && legOutcomes.length) {
        for (const leg of legOutcomes) {
          if (!leg?.selectionId || !leg?.outcome) continue;
          await client.query(
            `UPDATE bet_selections SET status = $1 WHERE bet_id = $2 AND selection_id = $3`,
            [String(leg.outcome).toUpperCase(), betId, leg.selectionId],
          );
        }
      } else {
        await client.query(
          `UPDATE bet_selections SET status = $1 WHERE bet_id = $2`,
          [outcome, betId],
        );
      }

      await recordBetStatusChange(client, {
        betId,
        fromStatus: prior,
        toStatus: outcome,
        reason: settlementReason || `settlement_${outcome}`,
        correlationId,
      });

      const nextVersion = (Number(bet.settlement_version) || 0) + 1;
      await recordSettlementEvent(client, {
        betId,
        userId,
        matchId: bet.match_id,
        marketId: bet.market_id,
        selectionId: bet.selection_id,
        marketType: matchState?.__settlementRule || null,
        result: outcome,
        stake,
        odds: acceptedOdds,
        payout,
        settlementReason,
        settlementRule: matchState?.__settlementRule || null,
        provider: matchState?.provider || null,
        providerEventId: matchState?.providerEventId || null,
        stateVersion: matchState?.stateVersion || null,
        settlementVersion: nextVersion,
      });

      // Record Outbox Event (BET_SETTLED for cache invalidation)
      await client.query(
        `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status, correlation_id, created_at)
         VALUES ($1, 'BET_SETTLED', 'bet', $2, $3, 'PENDING', $4, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          `evt_settle_${betId}`,
          betId,
          JSON.stringify({
            betId,
            userId,
            outcome,
            status: outcome,
            stake,
            odds: acceptedOdds,
            payout,
            settlementReason,
            settledAt: new Date().toISOString(),
            matchId: bet.match_id,
            marketId: bet.market_id,
            selectionId: bet.selection_id,
            settlementVersion: nextVersion,
          }),
          correlationId || null,
        ],
      );

      logSettlement(`BET_SETTLEMENT_${outcome}`, { betId, payout, settlementReason });

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
      outcome,
      ...result,
    };
  }
}

export const betSettlementEngine = new BetSettlementEngine();
