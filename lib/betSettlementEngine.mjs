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
import { settlementNetProfitDelta } from './wageringRules.mjs';
import { logSettlement, recordBetStatusChange, recordSettlementEvent } from './settlement/settlementAudit.mjs';
import {
  validateSettlementAuthorization,
  authorizeSettlement,
  settlementMetrics,
} from './settlement/settlementAuthorizationEngine.mjs';
import { logger } from './logger.mjs';
import { publishOutboxEvent } from './outboxEngine.mjs';
import { toPaise, fromPaise, roundInr } from './money.mjs';
import { calculateAuthoritativePayout } from './settlement/financialPrecision.mjs';

export class BetSettlementEngine {
  /** Settle a single bet server-authoritatively */
  async settleSingleBet({ betId, matchState, authorization = null }, correlationId = null) {
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

    // 2. Validate Canonical Match State (in-play milestone/settlement via forced outcome)
    const matchStatus = String(matchState?.status || 'COMPLETED').toUpperCase();
    const forced = matchState?.__forcedOutcome != null;
    if (!forced && matchStatus !== 'COMPLETED' && matchStatus !== 'FINAL' && matchStatus !== 'ABANDONED' && matchStatus !== 'CANCELLED') {
      throw new Error(`MATCH_NOT_FINAL: Match status is '${matchStatus}'. Settlement blocked.`);
    }

    // 1b. Validate Settlement Authorization
    let authObj = authorization;
    if (authorization) {
      const validation = validateSettlementAuthorization({ authorization, bet, matchState });
      if (!validation.valid) {
        logSettlement('SETTLEMENT_UNAUTHORIZED_BLOCKED', { betId, error: validation.reason });
        throw new Error(validation.reason);
      }
      authObj = authorization;
    } else if (matchState?.__bypassAuth) {
      // Internal harness testing bypass only
      authObj = {
        authorizationId: 'auth_test_bypass',
        confidenceState: 'CONFIRMED',
        finalityState: 'SETTLEMENT_ELIGIBLE',
        evidenceHash: 'sha256:test_bypass',
        authorizedAt: new Date().toISOString(),
      };
    } else {
      // If no authorization token was passed directly, try to derive safe authorization from matchState
      const authRes = authorizeSettlement({
        bet,
        match: matchState,
        marketContext: { marketId: bet.market_id },
        evaluatedOutcome: matchState?.__forcedOutcome || null,
      });
      if (!authRes.success) {
        logSettlement('SETTLEMENT_UNAUTHORIZED_BLOCKED', { betId, error: authRes.error });
        throw new Error(`SETTLEMENT_AUTHORIZATION_REQUIRED: ${authRes.error}`);
      }
      authObj = authRes.authorization;
    }

    logSettlement('BET_SETTLEMENT_STARTED', { betId, priorStatus: prior, authorizationId: authObj?.authorizationId });

    const userId = bet.user_id;
    const stake = fromPaise(toPaise(bet.stake));
    const acceptedOdds = convertToDecimalOdds(bet.accepted_odds || bet.odds || 1.0);
    const vipBoostPct = Number(bet.vip_boost_pct) || 0;

    // 3. Evaluate Settlement Outcome
    let outcome = 'LOST';
    let payout = 0.00;
    let transactionType = 'BET_PAYOUT';
    const settlementReason = matchState?.__settlementReason || null;

    if (matchState?.__forcedOutcome) {
      outcome = typeof matchState.__forcedOutcome === 'object'
        ? String(matchState.__forcedOutcome.outcome || '').toUpperCase()
        : String(matchState.__forcedOutcome).toUpperCase();
      if (outcome === 'VOID' || outcome === 'PUSH') {
        payout = stake;
        transactionType = 'BET_REFUND';
        outcome = 'VOID';
      } else if (outcome === 'WON' || outcome === 'WIN') {
        outcome = 'WON';
        payout = calculateAuthoritativePayout(stake, acceptedOdds, vipBoostPct);
        transactionType = 'BET_PAYOUT';
      } else {
        outcome = 'LOST';
        payout = 0.00;
      }
    } else {
      const ruleEval = evaluateSettlementRule(matchState, { selectionId: bet.selection_id });
      if (ruleEval.outcome === 'VOID') {
        outcome = 'VOID';
        payout = stake;
        transactionType = 'BET_REFUND';
      } else {
        const marketEval = settleIPLSRLMarket(bet.market_id || 'winner', bet.selection_id, matchState, `settle_${betId}`);
        if (marketEval.outcome === 'VOID' || marketEval.outcome === 'NO_RESULT') {
          outcome = 'VOID';
          payout = stake;
          transactionType = 'BET_REFUND';
        } else if (marketEval.outcome === 'PUSH') {
          outcome = 'VOID';
          payout = stake;
          transactionType = 'BET_REFUND';
        } else if (marketEval.outcome === 'WIN') {
          outcome = 'WON';
          payout = calculateAuthoritativePayout(stake, acceptedOdds, vipBoostPct);
          transactionType = 'BET_PAYOUT';
        } else if (marketEval.outcome === 'HALF_WIN') {
          outcome = 'WON';
          const netProfit = fromPaise(toPaise(stake * (acceptedOdds - 1.0) * 0.5));
          const halfWinPayout = fromPaise(toPaise(stake) + toPaise(netProfit));
          payout = roundInr(applyVipOddsBoost(halfWinPayout, vipBoostPct));
          transactionType = 'BET_PAYOUT';
        } else if (marketEval.outcome === 'LOSS' || marketEval.outcome === 'LOST') {
          outcome = 'LOST';
          payout = 0.00;
        } else {
          // PENDING / STANDARD / unknown — do not settle as LOST
          return {
            status: 'AWAITING_EVIDENCE',
            betId,
            reason: marketEval.reason || marketEval.outcome || 'insufficient_evidence',
          };
        }
      }
    }

    // 4. Atomic Financial Settlement Commit (Phase 6 Transaction Boundary)
    const result = await withTransaction(async (client) => {
      // Re-verify bet status under lock
      const lockBet = await client.query('SELECT status FROM bets WHERE bet_id = $1 FOR UPDATE', [betId]);
      const lockStatus = String(lockBet.rows[0]?.status || '').toUpperCase();
      if (['SETTLED', 'WON', 'LOST', 'VOID', 'CASHED_OUT', 'REFUNDED'].includes(lockStatus)) {
        return { status: 'ALREADY_SETTLED', betId, payout: 0.00 };
      }

      // Crash-safe: if payout/refund tx already exists for THIS settle attempt, do not credit again.
      // After an intentional reopen (settled_at cleared, settlement_version >= 1), the legacy
      // tx_payout_<betId> must NOT force the prior VOID/WON back — use a versioned payout id.
      const settlementVersion = Number(bet.settlement_version) || 0;
      const reopened = !bet.settled_at && settlementVersion >= 1;
      const payoutTxId = reopened
        ? `tx_payout_${betId}_v${settlementVersion + 1}`
        : `tx_payout_${betId}`;
      const existingPayout = await client.query(
        `SELECT transaction_id FROM transactions WHERE transaction_id = $1`,
        [payoutTxId],
      );
      if (existingPayout.rows.length > 0) {
        await client.query(
          `UPDATE bets
           SET status = $1,
               settled_at = COALESCE(settled_at, NOW()),
               actual_payout = COALESCE(actual_payout, $2),
               settlement_reason = COALESCE($4, settlement_reason),
               settlement_version = COALESCE(settlement_version, 0) + 1
           WHERE bet_id = $3 AND status IN ('ACCEPTED', 'PENDING', 'OPEN')`,
          [outcome, payout, betId, settlementReason],
        );
        return { status: 'ALREADY_SETTLED', betId, payout, outcome };
      }

      let newBalance = 0.00;
      const fundSource = String(bet.fund_source || 'cash').toLowerCase();
      let bonusCredit = 0;
      let freebetCredit = 0;
      let walletCashCredit = 0;
      let lockedBonusWinningsCredit = 0;
      let winningsCredit = 0;
      let lockedCredit = 0;

      if (outcome === 'VOID') {
        const refund = voidRefundCredits(bet);
        walletCashCredit = refund.balanceCredit;
        bonusCredit = refund.bonusCredit;
        freebetCredit = refund.freebetCredit;
        lockedCredit = refund.lockedCredit;
        winningsCredit = refund.winningsCredit;

        if (bet.reward_id) {
          const { reverseRewardForVoidedBet } = await import('./discreteRewardEngine.mjs');
          await reverseRewardForVoidedBet({
            rewardId: bet.reward_id,
            betId,
            reason: settlementReason || 'Bet voided',
            client,
          });
        }

        // Restore spin grants when a freebet/bonus stake is voided (best-effort, same tx).
        if ((freebetCredit > 0 || bonusCredit > 0) && (fundSource === 'freebet' || fundSource === 'bonus')) {
          try {
            await client.query(
              `UPDATE spin_wallet_grants
               SET remaining_amount = remaining_amount + $1,
                   status = 'ACTIVE',
                   expired_at = NULL
               WHERE grant_id = (
                 SELECT grant_id FROM spin_wallet_grants
                 WHERE user_id = $2 AND grant_type = $3 AND status = 'USED'
                 ORDER BY created_at DESC
                 LIMIT 1
               )`,
              [freebetCredit || bonusCredit, userId, fundSource],
            );
          } catch {
            // Grant table may not exist on older envs — wallet credit above is authoritative.
          }
        }

        // Reverse cash-stake loyalty/VIP XP earned at placement (idempotent per betId).
        if (fundSource === 'cash') {
          const { clawbackLoyaltyForBet } = await import('./loyaltyPointsStore.mjs');
          await clawbackLoyaltyForBet(client, {
            userId,
            betId,
            stake: Number(bet.stake) || 0,
            tierAtEarn: 'BRONZE',
          });
        }
      } else if (outcome === 'WON' && payout > 0) {
        const split = splitSettlementWinCredits(bet, payout);
        walletCashCredit = split.cashCredit;
        bonusCredit = split.bonusCredit;
        freebetCredit = split.freebetCredit;
        lockedBonusWinningsCredit = split.lockedBonusWinningsCredit || 0;
        winningsCredit = split.winningsCredit;
      } else if (outcome === 'LOST' && fundSource === 'cash') {
        winningsCredit = settlementNetProfitDelta('LOST', 0, stake);
      }

      // If a prior void clawed XP and this bet is reopened to WON/LOST, restore stake XP.
      if ((outcome === 'WON' || outcome === 'LOST') && fundSource === 'cash') {
        const lastLoyalty = await client.query(
          `SELECT entry_type FROM loyalty_ledger
           WHERE user_id = $1 AND reference_id = $2
           ORDER BY id DESC LIMIT 1`,
          [userId, betId],
        ).catch(() => ({ rows: [] }));
        if (lastLoyalty.rows[0]?.entry_type === 'CLAWBACK') {
          const earnRow = await client.query(
            `SELECT points_delta FROM loyalty_ledger
             WHERE user_id = $1 AND entry_type = 'EARN' AND reference_id = $2
             ORDER BY id DESC LIMIT 1`,
            [userId, betId],
          ).catch(() => ({ rows: [] }));
          let restore = Math.max(0, Number(earnRow.rows[0]?.points_delta) || 0);
          if (restore <= 0) {
            const { pointsFromSpendAtTier } = await import('./vipBenefits.mjs');
            const loyaltyRow = await client.query(
              `SELECT tier FROM user_loyalty WHERE user_id = $1`,
              [userId],
            );
            restore = pointsFromSpendAtTier(Number(bet.stake) || stake, loyaltyRow.rows[0]?.tier || 'BRONZE');
          }
          if (restore > 0) {
            const { earnLoyaltyPoints } = await import('./loyaltyPointsStore.mjs');
            await earnLoyaltyPoints(client, userId, restore, {
              source: 'bet_stake_restore',
              referenceId: betId,
            });
          }
        }
      }

      const needsWalletMutation =
        walletCashCredit > 0
        || bonusCredit > 0
        || freebetCredit > 0
        || lockedCredit > 0
        || lockedBonusWinningsCredit > 0
        || winningsCredit !== 0;

      let walletSnapshot = null;

      if (needsWalletMutation) {
        let walletRes = await client.query(
          `SELECT wallet_id, balance, bonus_balance,
                  COALESCE(freebet_balance, 0) AS freebet_balance,
                  COALESCE(locked_deposit_balance, 0) AS locked_deposit_balance,
                  COALESCE(locked_bonus_winnings, 0) AS locked_bonus_winnings,
                  COALESCE(reserved_balance, 0) AS reserved_balance,
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
                       0.00 AS locked_deposit_balance, 0.00 AS locked_bonus_winnings, 0.00 AS winnings_balance`,
            [newWalletId, userId],
          );
        }

        const wallet = walletRes.rows[0];
        const nextCash = fromPaise(toPaise(wallet.balance || 0) + toPaise(walletCashCredit));
        const nextBonus = fromPaise(toPaise(wallet.bonus_balance || 0) + toPaise(bonusCredit));
        const nextFreebet = fromPaise(toPaise(wallet.freebet_balance || 0) + toPaise(freebetCredit));
        const nextLocked = fromPaise(toPaise(wallet.locked_deposit_balance || 0) + toPaise(lockedCredit));
        const nextLockedBonus = fromPaise(toPaise(wallet.locked_bonus_winnings || 0) + toPaise(lockedBonusWinningsCredit));
        const nextWinnings = fromPaise(toPaise(wallet.winnings_balance || 0) + toPaise(winningsCredit));

        const newBalanceRes = await client.query(
          `UPDATE wallets
           SET balance = $1,
               bonus_balance = $2,
               freebet_balance = $3,
               locked_deposit_balance = $4,
               locked_bonus_winnings = $5,
               winnings_balance = $6,
               updated_at = NOW()
           WHERE wallet_id = $7
           RETURNING balance`,
          [nextCash, nextBonus, nextFreebet, nextLocked, nextLockedBonus, nextWinnings, wallet.wallet_id],
        );
        newBalance = fromPaise(toPaise(newBalanceRes.rows[0].balance));
        walletSnapshot = {
          balance: nextCash,
          reservedBalance: Number(wallet.reserved_balance || 0),
          winningsBalance: nextWinnings,
          lockedDepositBalance: nextLocked,
          lockedBonusWinnings: nextLockedBonus,
        };

        if (walletCashCredit > 0 || bonusCredit > 0 || freebetCredit > 0 || payout > 0) {
          const creditAmount = walletCashCredit || bonusCredit || freebetCredit || payout || stake;
          const txId = payoutTxId;
          const txInsert = await client.query(
            `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
             VALUES ($1, $2, $3, $4, 'SUCCESS', NOW())
             ON CONFLICT (transaction_id) DO NOTHING
             RETURNING transaction_id`,
            [txId, userId, transactionType, creditAmount],
          );

          if (txInsert.rowCount === 0) {
            throw new Error('IDEMPOTENCY_CONFLICT: Settlement payout transaction already exists');
          }

          await client.query(
            `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
             VALUES ($1, $2, 'CREDIT', $3, $4, $5, NOW())`,
            [
              wallet.wallet_id,
              txId,
              creditAmount,
              newBalance,
              `Settlement ${outcome} for Bet #${betId} (net P&L ${winningsCredit >= 0 ? '+' : ''}₹${winningsCredit.toFixed(2)})`,
            ],
          );
        }
      } else if (outcome === 'LOST') {
        const txId = `tx_lost_${betId}`;
        await client.query(
          `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
           VALUES ($1, $2, 'BET_LOSS', $3, 'SUCCESS', NOW())
           ON CONFLICT (transaction_id) DO NOTHING`,
          [txId, userId, stake],
        );
      }

      // Transactional Bonus Wagering Progress & Rollover Verification
      const isBonusBet = fundSource === 'bonus' || (Number(bet.bonus_stake) || 0) > 0;
      if (isBonusBet) {
        const { recordBonusWageringInTx } = await import('./promotionsEngine.mjs');
        const profit = Math.max(0, parseFloat((payout - stake).toFixed(2)));
        const wagResult = await recordBonusWageringInTx(client, {
          userId,
          betId,
          stake,
          bonusStake: Number(bet.bonus_stake) || (fundSource === 'bonus' ? stake : 0),
          odds: acceptedOdds,
          outcome,
          profit,
        });
        if (wagResult?.isCompleted && wagResult?.releasedAmount > 0) {
          newBalance = parseFloat((newBalance + wagResult.releasedAmount).toFixed(2));
          if (walletSnapshot) {
            walletSnapshot.balance = newBalance;
            walletSnapshot.lockedBonusWinnings = 0;
          }
        }
      }

      // Update Bet Record + settlement metadata
      await client.query(
        `UPDATE bets
         SET status = $1,
             settled_at = NOW(),
             actual_payout = $2,
             winnings_credited = $3,
             settlement_reason = $4,
             settlement_version = COALESCE(settlement_version, 0) + 1
         WHERE bet_id = $5`,
        [outcome, payout, winningsCredit !== 0 ? winningsCredit : null, settlementReason, betId],
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
      const decisionSnapshot = {
        snapshotVersion: '1.0',
        bet: {
          betId,
          userId,
          matchId: bet.match_id,
          marketId: bet.market_id,
          selectionId: bet.selection_id,
          stake,
          odds: acceptedOdds,
          potentialPayout: parseFloat((stake * acceptedOdds).toFixed(2)),
          marketType: bet.market_id,
        },
        matchState: {
          innings: matchState?.innings || matchState?.liveDetails?.innings || 1,
          score: matchState?.score || matchState?.liveDetails?.score || 0,
          wickets: matchState?.wickets || matchState?.liveDetails?.wickets || 0,
          overs: matchState?.overs || matchState?.liveDetails?.overs || '0.0',
          status: matchStatus,
          winner: matchState?.winnerId || matchState?.winner || null,
        },
        grading: {
          gradedOutcome: outcome,
          gradingRuleVersion: 'cricket_rules_v1',
          reasons: [settlementReason || `settlement_${outcome}`],
        },
        confidence: {
          confidenceState: authObj?.confidenceState || 'CONFIRMED',
          reasons: authObj?.settlementReasonCodes || [settlementReason || 'OFFICIAL_SETTLEMENT'],
        },
        finality: {
          finalityState: authObj?.finalityState || 'SETTLEMENT_ELIGIBLE',
          gracePeriod: authObj?.freshness?.maxAgeSeconds || 300,
          eligibleAt: authObj?.authorizedAt || new Date().toISOString(),
        },
        providerConsensus: {
          providersAvailable: authObj?.providerConsensus?.providersAvailable ?? 1,
          providersAgree: authObj?.providerConsensus?.providersAgree ?? true,
          conflictingFields: authObj?.providerConsensus?.conflictingFields || [],
          providerEvidence: authObj?.providerConsensus?.observations || [],
        },
        authorization: {
          authorizationId: authObj?.authorizationId || 'AUTH_SYSTEM',
          evidenceHash: authObj?.evidenceHash || 'SHA256_VERIFIED',
          authorizedAt: authObj?.authorizedAt || new Date().toISOString(),
          expiresAt: authObj?.expiresAt || new Date(Date.now() + 60000).toISOString(),
        },
        timestamps: {
          placedAt: bet.created_at || null,
          acceptedAt: bet.accepted_at || bet.created_at || null,
          decidedAt: new Date().toISOString(),
          settledAt: new Date().toISOString(),
        },
        evidenceSchemaVersion: '1.0',
      };

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
        metadata: decisionSnapshot,
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
            profit: settlementNetProfitDelta(outcome, payout, stake),
            settlementReason,
            settledAt: new Date().toISOString(),
            matchId: bet.match_id,
            marketId: bet.market_id,
            selectionId: bet.selection_id,
            settlementVersion: nextVersion,
            walletBalance: walletSnapshot?.balance ?? null,
            // reserved_balance is audit-only; stake/withdrawal already left balance.
            availableBalance: walletSnapshot
              ? parseFloat(Number(walletSnapshot.balance).toFixed(2))
              : null,
            withdrawableBalance: walletSnapshot
              ? parseFloat(Math.max(
                0,
                Number(walletSnapshot.balance) - Number(walletSnapshot.lockedDepositBalance || 0),
              ).toFixed(2))
              : null,
            winnings: walletSnapshot?.winningsBalance ?? null,
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

    // Trigger post-settlement hooks for legacy cash promo wagering
    // (Bonus bets are already authoritatively recorded in recordBonusWageringInTx inside the transaction)
    const isSettledBonus = String(bet.fund_source || 'cash').toLowerCase() === 'bonus' || Number(bet.bonus_stake) > 0;
    if ((outcome === 'WON' || outcome === 'LOST') && !isSettledBonus) {
      try {
        const { processBonusWageringProgress } = await import('./promotionsEngine.mjs');
        await processBonusWageringProgress({
          userId,
          betStake: stake,
          betOdds: acceptedOdds,
          fundSource: String(bet.fund_source || 'cash').toLowerCase(),
        });
      } catch (err) {
        logger.error('bonus_wagering_progress_failed', {
          betId,
          userId,
          error: err?.message || err,
        });
        try {
          await publishOutboxEvent(null, {
            eventType: 'BONUS_WAGERING_RETRY',
            aggregateType: 'bet',
            aggregateId: betId,
            payload: {
              userId,
              betStake: stake,
              betOdds: acceptedOdds,
              fundSource: String(bet.fund_source || 'cash').toLowerCase(),
            },
          });
        } catch (enqueueErr) {
          logger.error('bonus_wagering_retry_enqueue_failed', {
            betId,
            userId,
            error: enqueueErr?.message || enqueueErr,
          });
        }
      }
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
