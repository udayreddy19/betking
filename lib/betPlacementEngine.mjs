/**
 * Server-Authoritative Bet Placement Engine
 * Executes complete financial bet-placement lifecycle inside a PostgreSQL transaction boundary.
 * Enforces atomic wallet row locking (FOR UPDATE), idempotency, account eligibility, canonical market status,
 * server odds validation, stake limits, risk liability, ledger DEBIT, and outbox event creation.
 */

import { withTransaction, query } from '../db/pg.js';
import { accountEligibilityEngine } from './accountEligibilityEngine.mjs';
import { stakeLimitEngine } from './stakeLimitEngine.mjs';
import { responsibleGamingEngine } from './responsibleGaming.mjs';
import { betRiskEngine } from './betRiskEngine.mjs';
import { accumulatorEngine } from './accumulatorEngine.mjs';
import { marketSuspensionEngine } from './marketSuspensionEngine.mjs';
import { idempotencyEngine } from './idempotencyEngine.mjs';
import { resolveServerOdds } from './oddsQuoteService.mjs';
import { enforceBetRisk } from './betRiskEnforcement.mjs';
import { riskAdjustmentEngine } from './engines/riskAdjustmentEngine.mjs';
import { loyaltyTierFromPoints } from './dailySpinPrizes.mjs';
import { getBenefitsForTier, pointsFromSpendAtTier } from './vipBenefits.mjs';
import { grantCrossedTierRewards } from './vipEngine.mjs';
import { BONUS_MIN_BET_ODDS, everyLegMeetsBonusOdds } from './promoRules.mjs';

function normalizeFundSource(raw) {
  return ['bonus', 'freebet'].includes(raw) ? raw : 'cash';
}

export class BetPlacementEngine {
  /** Place single or accumulator bet with server-authoritative validation */
  async placeBet(params = {}, correlationId = null) {
    const {
      userId,
      matchId,
      marketId,
      selectionId,
      stake,
      clientOdds,
      selections, // Optional array for accumulator bets
      idempotencyKey,
      fundSource: rawFundSource,
    } = params;
    const fundSource = normalizeFundSource(rawFundSource);

    if (!userId) {
      throw new Error('USER_UNAUTHENTICATED: User ID is required');
    }

    // 1. Idempotency Check
    if (idempotencyKey) {
      const idemCheck = await idempotencyEngine.checkOrLock(idempotencyKey, 'BET_PLACE', '', userId);
      if (idemCheck.isDuplicate) {
        return {
          status: 'IDEMPOTENT_DUPLICATE',
          isDuplicate: true,
          result: idemCheck.result,
        };
      }
    }

    try {
      // 2. Account Eligibility Check
      await accountEligibilityEngine.verifyEligibility(userId);

      const rgCheck = await responsibleGamingEngine.validateBetPlacementAttempt(userId, stake, { fundSource });
      if (!rgCheck.allowed) {
        throw Object.assign(
          new Error(`${rgCheck.reason}: ${rgCheck.message || rgCheck.reason}`),
          { code: rgCheck.reason, status: 403 },
        );
      }

      // 3. Stake Limits Validation
      const numericStake = stakeLimitEngine.validateStake(stake);
      const loyaltyNow = await query(`SELECT points, tier FROM user_loyalty WHERE user_id = $1`, [userId]);
      const vipTier = loyaltyNow.rows[0]?.tier || 'BRONZE';
      const vipBoostPct = fundSource === 'cash' ? getBenefitsForTier(vipTier).oddsBoostPct : 0;

      let betType = 'SINGLE';
      let acceptedOdds = 1.0;
      let potentialPayout = 0;
      let potentialProfit = 0;
      let validatedSelections = [];

      // 4. Single vs Accumulator Validation
      if (Array.isArray(selections) && selections.length === 1) {
        // Frontend often sends a 1-leg "multi" payload — treat as a single.
        const only = selections[0] || {};
        params.matchId = params.matchId || only.matchId;
        params.marketId = params.marketId || only.marketId;
        params.selectionId = params.selectionId || only.selectionId;
        params.clientOdds = params.clientOdds ?? only.odds ?? only.clientOdds;
      }

      if (Array.isArray(selections) && selections.length >= 2) {
        betType = 'ACCUMULATOR';
        const accumResult = await accumulatorEngine.validateAccumulator(numericStake, selections);
        acceptedOdds = accumResult.combinedOdds;
        potentialPayout = accumResult.potentialPayout;
        potentialProfit = accumResult.potentialProfit;
        validatedSelections = accumResult.selections;
      } else {
        betType = 'SINGLE';
        const singleMatchId = params.matchId || matchId;
        const singleMarketId = params.marketId || marketId;
        const singleSelectionId = params.selectionId || selectionId;
        const singleClientOdds = params.clientOdds ?? clientOdds;

        if (!singleMatchId || !singleMarketId || !singleSelectionId) {
          throw new Error('INVALID_BET: matchId, marketId, and selectionId are required for single bet');
        }

        const causes = await marketSuspensionEngine.getActiveCauses(singleMarketId);
        if (causes.length > 0) {
          throw new Error(`MARKET_SUSPENDED: Market '${singleMarketId}' is currently suspended due to ${causes[0].reason}`);
        }

        const serverOdds = await resolveServerOdds({
          matchId: singleMatchId,
          marketId: singleMarketId,
          selectionId: singleSelectionId,
          clientOdds: singleClientOdds,
          selectionName: params.selectionName || params.selection_name || null,
        });
        const calc = betRiskEngine.calculateSinglePayout(numericStake, serverOdds);
        acceptedOdds = calc.odds;
        potentialPayout = calc.potentialPayout;
        potentialProfit = calc.potentialProfit;

        validatedSelections.push({
          matchId: singleMatchId,
          marketId: singleMarketId,
          selectionId: singleSelectionId,
          selectionName: params.selectionName || params.selection_name || singleSelectionId,
          odds: serverOdds,
        });
      }

      const effectiveStake = await enforceBetRisk({
        userId,
        stake: numericStake,
        validatedSelections,
        betType,
      });

      if (fundSource === 'bonus') {
        const oddsToCheck = validatedSelections.length
          ? validatedSelections.map((sel) => Number(sel.odds))
          : [acceptedOdds];
        if (!everyLegMeetsBonusOdds(oddsToCheck)) {
          throw new Error(
            `BONUS_ODDS_GATE: Bonus requires odds of ${BONUS_MIN_BET_ODDS.toFixed(2)} or higher on every selection`,
          );
        }
      }

      // 5. Atomic PostgreSQL Financial Transaction
      const result = await withTransaction(async (client) => {
        const walletRes = await client.query(
          `SELECT wallet_id, balance, bonus_balance,
                  COALESCE(freebet_balance, 0) AS freebet_balance, currency
           FROM wallets WHERE user_id = $1 FOR UPDATE`,
          [userId],
        );

        if (walletRes.rows.length === 0) {
          throw new Error(`Wallet not found for user ${userId}`);
        }

        const wallet = walletRes.rows[0];
        const cashBalance = Number(wallet.balance || 0);
        const bonusBalance = Number(wallet.bonus_balance || 0);
        const freebetBalance = Number(wallet.freebet_balance || 0);

        let newCash = cashBalance;
        let newBonus = bonusBalance;
        let newFreebet = freebetBalance;
        let ledgerAfter = cashBalance;

        if (fundSource === 'bonus') {
          if (bonusBalance < effectiveStake) {
            throw new Error(
              `INSUFFICIENT_BALANCE: Insufficient bonus balance. Required: ₹${effectiveStake}, Available: ₹${bonusBalance}`,
            );
          }
          newBonus = Number((bonusBalance - effectiveStake).toFixed(2));
          ledgerAfter = newBonus;
          await client.query(
            'UPDATE wallets SET bonus_balance = $1, updated_at = NOW() WHERE wallet_id = $2',
            [newBonus, wallet.wallet_id],
          );
        } else if (fundSource === 'freebet') {
          if (freebetBalance < effectiveStake) {
            throw new Error(
              `INSUFFICIENT_BALANCE: Insufficient freebet balance. Required: ₹${effectiveStake}, Available: ₹${freebetBalance}`,
            );
          }
          newFreebet = Number((freebetBalance - effectiveStake).toFixed(2));
          ledgerAfter = newFreebet;
          await client.query(
            'UPDATE wallets SET freebet_balance = $1, updated_at = NOW() WHERE wallet_id = $2',
            [newFreebet, wallet.wallet_id],
          );
        } else if (cashBalance < effectiveStake) {
          throw new Error(
            `INSUFFICIENT_BALANCE: Insufficient wallet balance. Required: ₹${effectiveStake}, Available: ₹${cashBalance}`,
          );
        } else {
          newCash = Number((cashBalance - effectiveStake).toFixed(2));
          ledgerAfter = newCash;
          await client.query(
            'UPDATE wallets SET balance = $1, updated_at = NOW() WHERE wallet_id = $2',
            [newCash, wallet.wallet_id],
          );
        }

        const betId = `bet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const targetMatchId = matchId || validatedSelections[0]?.matchId;
        const targetSelectionId = selectionId || validatedSelections[0]?.selectionId;
        const targetMarketId = marketId || validatedSelections[0]?.marketId;

        await client.query(
          `INSERT INTO bets (bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds, potential_payout, potential_profit, bet_type, status, idempotency_key, fund_source, vip_boost_pct, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ACCEPTED', $12, $13, $14, NOW())`,
          [betId, userId, targetMatchId, targetMarketId, targetSelectionId, effectiveStake, acceptedOdds, acceptedOdds, potentialPayout, potentialProfit, betType, idempotencyKey || null, fundSource, vipBoostPct],
        );

        for (const sel of validatedSelections) {
          const bsId = `bs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          await client.query(
            `INSERT INTO bet_selections (id, bet_id, match_id, market_id, selection_id, selection_name, odds, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACCEPTED')`,
            [bsId, betId, sel.matchId, sel.marketId, sel.selectionId, sel.selectionName || sel.selectionId, sel.odds],
          );
        }

        const txId = `tx_bet_${betId}`;
        await client.query(
          `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
           VALUES ($1, $2, 'BET_STAKE', $3, 'SUCCESS', NOW())`,
          [txId, userId, effectiveStake],
        );

        await client.query(
          `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
           VALUES ($1, $2, 'DEBIT', $3, $4, $5, NOW())`,
          [wallet.wallet_id, txId, effectiveStake, ledgerAfter, `Bet Stake #${betId} (${fundSource})`],
        );

        const loyaltyRow = await client.query(
          `SELECT points, tier FROM user_loyalty WHERE user_id = $1 FOR UPDATE`,
          [userId],
        );
        const currentTier = loyaltyRow.rows[0]?.tier || 'BRONZE';
        const loyaltyPoints = pointsFromSpendAtTier(effectiveStake, currentTier);
        if (loyaltyPoints > 0) {
          const loyaltyRes = await client.query(
            `INSERT INTO user_loyalty (user_id, points, tier, updated_at)
             VALUES ($1, $2, 'BRONZE', CURRENT_TIMESTAMP)
             ON CONFLICT (user_id) DO UPDATE
             SET points = user_loyalty.points + EXCLUDED.points, updated_at = CURRENT_TIMESTAMP
             RETURNING points`,
            [userId, loyaltyPoints],
          );
          const totalPoints = Number(loyaltyRes.rows[0]?.points || 0);
          const nextTier = loyaltyTierFromPoints(totalPoints);
          await client.query(
            `UPDATE user_loyalty SET tier = $1 WHERE user_id = $2`,
            [nextTier, userId],
          );
          await grantCrossedTierRewards(client, userId, currentTier, nextTier);
        }

        const eventId = `evt_${betId}`;
        await client.query(
          `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status, correlation_id, created_at)
           VALUES ($1, 'bet.created', 'bet', $2, $3, 'PENDING', $4, NOW())`,
          [eventId, betId, JSON.stringify({ betId, userId, stake: effectiveStake, odds: acceptedOdds, potentialPayout, vipBoostPct }), correlationId || null],
        );

        return {
          success: true,
          betId,
          transactionId: txId,
          stake: effectiveStake,
          odds: acceptedOdds,
          acceptedOdds,
          potentialPayout,
          potentialProfit,
          vipBoostPct,
          remainingBalance: newCash,
          remainingBonus: newBonus,
          remainingFreebet: newFreebet,
          fundSource,
          status: 'ACCEPTED',
          placedAt: new Date().toISOString(),
        };
      });

      if (idempotencyKey) {
        await idempotencyEngine.complete(idempotencyKey, result);
      }

      try {
        await riskAdjustmentEngine.recordBetLiability(
          marketId || validatedSelections[0]?.marketId,
          selectionId || validatedSelections[0]?.selectionId,
          result.stake,
          potentialPayout,
        );
      } catch {
        // Liability is best-effort; never fail an accepted bet.
      }

      return result;
    } catch (err) {
      if (idempotencyKey) {
        await idempotencyEngine.fail(idempotencyKey, err.message);
      }
      throw err;
    }
  }
}

export const betPlacementEngine = new BetPlacementEngine();
