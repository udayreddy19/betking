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
import { buildPlacementSnapshot } from './placementSnapshot.mjs';
import { accumulatorEngine } from './accumulatorEngine.mjs';
import { marketSuspensionEngine } from './marketSuspensionEngine.mjs';
import { idempotencyEngine } from './idempotencyEngine.mjs';
import { resolveServerOdds, unwrapServerOddsQuote } from './oddsQuoteService.mjs';
import { validatePlacementOdds } from './oddsPlacementValidation.mjs';
import { enforceBetRisk, recordBetRiskLiability } from './betRiskEnforcement.mjs';
import { holdAndRecheckLiveQuote } from './liveBetHold.mjs';
import { riskAdjustmentEngine } from './engines/riskAdjustmentEngine.mjs';
import { getBenefitsForTier, pointsFromSpendAtTier } from './vipBenefits.mjs';
import { earnLoyaltyPoints } from './loyaltyPointsStore.mjs';
import { expireSpinGrants, consumeSpinGrants } from './spinGrantEngine.mjs';
import { BONUS_MIN_BET_ODDS, everyLegMeetsBonusOdds } from './promoRules.mjs';
import { allocateCashStakeForWallet, walletViewFromRow } from './walletSettlement.mjs';
import { getAvailableBalance } from './wageringRules.mjs';
import { betRiskEngine } from './betRiskEngine.mjs';

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
      rewardId: rawRewardId,
      reward_id: rawRewardIdUnderscore,
      fundSource: rawFundSource,
    } = params;
    const rewardId = rawRewardId || rawRewardIdUnderscore || null;
    let fundSource = normalizeFundSource(rawFundSource);
    if (rewardId && !rawFundSource) {
      fundSource = 'freebet';
    }

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
      await accountEligibilityEngine.verifyEligibility(userId, { forBetting: true });

      const { assertEmergencyAllows } = await import('./emergencyState.mjs');
      await assertEmergencyAllows('bet');

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

      let oddsUpdates = [];
      let placementStateVersion = null;
      let placementOddsVersion = null;
      let quote = null;

      const enforceQuoteMatchesClient = (quoteObj, leg, legClientOdds) => {
        validatePlacementOdds({
          serverOdds: unwrapServerOddsQuote(quoteObj),
          clientOdds: legClientOdds,
          matchId: leg.matchId,
          marketId: quoteObj?.marketId || leg.marketId,
          selectionId: quoteObj?.selectionId || leg.selectionId,
          selectionName: leg.selectionName || leg.name || leg.selectionId,
          oddsVersion: quoteObj?.oddsVersion,
          quoteTimestamp: quoteObj?.quoteTimestamp || quoteObj?.generatedAt,
          userId,
          correlationId,
          betType,
        });
      };

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
        const { isSrlBettingClosed } = await import('./iplSrlOperatorState.mjs');
        for (const leg of selections) {
          if (isSrlBettingClosed(leg.matchId)) {
            throw new Error('MARKET_SUSPENDED: Betting is closed on this OddsYra SRL match');
          }
        }
        const accumResult = await accumulatorEngine.validateAccumulator(numericStake, selections, {
          userId,
          correlationId,
        });
        if (accumResult.oddsChanged && accumResult.oddsUpdates?.length > 0) {
          const prevOddsProduct = selections.reduce((acc, s) => acc * (Number(s.odds || s.clientOdds) || 1), 1);
          const err = new Error('ODDS_CHANGED: One or more selections in the accumulator have changed.');
          err.code = 'ODDS_CHANGED';
          err.httpStatus = 409;
          err.oddsUpdates = accumResult.oddsUpdates;
          err.changedSelections = accumResult.oddsUpdates.map((u) => ({
            selectionId: u.selectionId,
            selectionName: u.selectionName || u.name || u.selectionId,
            oldOdds: Number(u.oldOdds ?? u.previousOdds ?? u.clientOdds ?? 1),
            newOdds: Number(u.newOdds ?? u.odds ?? u.serverOdds ?? 1),
          }));
          err.previousTotalOdds = parseFloat(prevOddsProduct.toFixed(2));
          err.newTotalOdds = parseFloat(accumResult.combinedOdds.toFixed(2));
          err.requiresAcceptance = true;
          throw err;
        }
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

        const { isSrlBettingClosed } = await import('./iplSrlOperatorState.mjs');
        if (isSrlBettingClosed(singleMatchId)) {
          throw new Error('MARKET_SUSPENDED: Betting is closed on this OddsYra SRL match');
        }

        const causes = await marketSuspensionEngine.getActiveCauses(singleMarketId);
        if (causes.length > 0) {
          throw new Error(`MARKET_SUSPENDED: Market '${singleMarketId}' is currently suspended due to ${causes[0].reason}`);
        }

        quote = await resolveServerOdds({
          matchId: singleMatchId,
          marketId: singleMarketId,
          selectionId: singleSelectionId,
          clientOdds: singleClientOdds,
          selectionName: params.selectionName || params.selection_name || null,
        });
        enforceQuoteMatchesClient(quote, {
          matchId: singleMatchId,
          marketId: singleMarketId,
          selectionId: singleSelectionId,
          selectionName: params.selectionName || params.selection_name || singleSelectionId,
        }, singleClientOdds);

        // Live hold: reject if score fingerprint or odds moved during acceptance window
        if (quote?.isLive) {
          quote = await holdAndRecheckLiveQuote({
            initialQuote: quote,
            matchId: singleMatchId,
            marketId: singleMarketId,
            selectionId: singleSelectionId,
            selectionName: params.selectionName || params.selection_name || null,
            clientOdds: singleClientOdds,
          });
          enforceQuoteMatchesClient(quote, {
            matchId: singleMatchId,
            marketId: singleMarketId,
            selectionId: singleSelectionId,
            selectionName: params.selectionName || params.selection_name || singleSelectionId,
          }, singleClientOdds);
        }

        const serverOdds = unwrapServerOddsQuote(quote);
        const calc = betRiskEngine.calculateSinglePayout(numericStake, serverOdds);
        acceptedOdds = calc.odds;
        potentialPayout = calc.potentialPayout;
        potentialProfit = calc.potentialProfit;

        placementStateVersion = quote?.stateVersion ?? null;
        placementOddsVersion = quote?.oddsVersion ?? null;
        validatedSelections.push({
          matchId: singleMatchId,
          marketId: quote?.marketId || singleMarketId,
          selectionId: quote?.selectionId || singleSelectionId,
          selectionName: params.selectionName || params.selection_name || singleSelectionId,
          odds: serverOdds,
          stateVersion: placementStateVersion,
          innings: quote?.innings ?? quote?.currentInnings ?? params.innings ?? null,
          scoreAtPlacement: quote?.scoreAtPlacement ?? null,
          stateKey: quote?.stateKey ?? null,
          team1Name: params.team1Name || params.team1_name || null,
          team2Name: params.team2Name || params.team2_name || null,
          matchName: params.matchName || params.match_name || null,
          league: params.league || null,
          sport: params.sport || null,
        });
      }

      const effectiveStake = await enforceBetRisk({
        userId,
        stake: numericStake,
        validatedSelections,
        betType,
        fundSource,
      });

      if (fundSource === 'bonus' || fundSource === 'freebet') {
        const oddsToCheck = validatedSelections.length
          ? validatedSelections.map((sel) => Number(sel.odds))
          : [acceptedOdds];
        if (!everyLegMeetsBonusOdds(oddsToCheck)) {
          const label = fundSource === 'freebet' ? 'Free bet' : 'Bonus';
          throw new Error(
            `${fundSource === 'freebet' ? 'FREEBET' : 'BONUS'}_ODDS_GATE: ${label} requires odds of ${BONUS_MIN_BET_ODDS.toFixed(2)} or higher on every selection`,
          );
        }
      }

      // 5. Atomic PostgreSQL Financial Transaction
      const result = await withTransaction(async (client) => {
        const walletRes = await client.query(
          `SELECT wallet_id, balance, bonus_balance,
                  COALESCE(freebet_balance, 0) AS freebet_balance,
                  COALESCE(locked_deposit_balance, 0) AS locked_deposit_balance,
                  COALESCE(reserved_balance, 0) AS reserved_balance,
                  COALESCE(winnings_balance, 0) AS winnings_balance
           FROM wallets WHERE user_id = $1 FOR UPDATE`,
          [userId],
        );

        if (walletRes.rows.length === 0) {
          throw new Error(`Wallet not found for user ${userId}`);
        }

        await expireSpinGrants(client, userId);
        const { expireDepositFreebetGrants, consumeDepositFreebetGrants } = await import('./depositFreebetEngine.mjs');
        await expireDepositFreebetGrants(client, userId);

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

        let stakeFromLocked = 0;
        let stakeFromWinnings = 0;
        let stakeFromCash = 0;

        const betId = `bet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        let returnsStake = fundSource === 'cash' || fundSource === 'bonus';
        let discreteRewardInfo = null;

        if (rewardId) {
          const {
            lockAndValidateRewardForBet,
            consumeRewardForBet,
            debitPromoWalletBucketSilent,
          } = await import('./discreteRewardEngine.mjs');
          discreteRewardInfo = await lockAndValidateRewardForBet({
            rewardId,
            userId,
            requestedStake: effectiveStake,
            validatedSelections,
            combinedOdds: acceptedOdds,
            betType,
            client,
          });
          fundSource = discreteRewardInfo.rewardType;
          returnsStake = Boolean(discreteRewardInfo?.returnsStake);
          const consumedReward = await consumeRewardForBet({
            rewardId,
            userId,
            betId,
            client,
          });
          // Mirrored promos (daily spin / deposit freebet) credit the wallet separately from
          // user_rewards. Selecting the voucher must debit the bucket + grants, or the wallet
          // stays funded after the reward is CONSUMED.
          if (!consumedReward.walletAlreadyDebited && (fundSource === 'freebet' || fundSource === 'bonus')) {
            const debit = await debitPromoWalletBucketSilent(client, {
              userId,
              rewardType: fundSource,
              amount: effectiveStake,
            });
            if (fundSource === 'freebet') {
              newFreebet = debit.nextBalance ?? Math.max(0, Number((freebetBalance - effectiveStake).toFixed(2)));
              ledgerAfter = newFreebet;
              const fromSpin = await consumeSpinGrants(client, userId, 'freebet', effectiveStake);
              const leftover = Number((effectiveStake - Number(fromSpin || 0)).toFixed(2));
              if (leftover > 0) {
                await consumeDepositFreebetGrants(client, userId, leftover);
              }
            } else {
              newBonus = debit.nextBalance ?? Math.max(0, Number((bonusBalance - effectiveStake).toFixed(2)));
              ledgerAfter = newBonus;
              await consumeSpinGrants(client, userId, 'bonus', effectiveStake);
            }
          } else {
            ledgerAfter = cashBalance;
          }
        } else if (fundSource === 'bonus') {
          if (bonusBalance <= 0 || bonusBalance < effectiveStake) {
            throw new Error(
              `INSUFFICIENT_BALANCE: Insufficient bonus balance. Required: ₹${effectiveStake}, Available: ₹${bonusBalance}`,
            );
          }
          const { validatePromoBetStake } = await import('./walletPromoRules.mjs');
          await validatePromoBetStake({ fundSource: 'bonus', requestedStake: effectiveStake, availableBalance: bonusBalance, userId });
          newBonus = Math.max(0, Number((bonusBalance - effectiveStake).toFixed(2)));
          ledgerAfter = newBonus;
          await client.query(
            'UPDATE wallets SET bonus_balance = $1, updated_at = NOW() WHERE wallet_id = $2',
            [newBonus, wallet.wallet_id],
          );
          await consumeSpinGrants(client, userId, 'bonus', effectiveStake);
          const { consumeMatchingDiscreteRewardsForWalletSpend } = await import('./discreteRewardEngine.mjs');
          await consumeMatchingDiscreteRewardsForWalletSpend({
            userId,
            rewardType: 'bonus',
            amount: effectiveStake,
            betId,
            client,
          });
        } else if (fundSource === 'freebet') {
          if (freebetBalance <= 0) {
            throw new Error(
              `INSUFFICIENT_BALANCE: Insufficient freebet balance. Required: ₹${effectiveStake}, Available: ₹${freebetBalance}`,
            );
          }
          const { validatePromoBetStake } = await import('./walletPromoRules.mjs');
          await validatePromoBetStake({ fundSource: 'freebet', requestedStake: effectiveStake, availableBalance: freebetBalance, userId });
          newFreebet = 0.00;
          ledgerAfter = newFreebet;
          await client.query(
            'UPDATE wallets SET freebet_balance = 0.00, updated_at = NOW() WHERE wallet_id = $1',
            [wallet.wallet_id],
          );
          const fromSpin = await consumeSpinGrants(client, userId, 'freebet', effectiveStake);
          const leftover = Number((effectiveStake - Number(fromSpin || 0)).toFixed(2));
          if (leftover > 0) {
            await consumeDepositFreebetGrants(client, userId, leftover);
          }
          const { consumeMatchingDiscreteRewardsForWalletSpend } = await import('./discreteRewardEngine.mjs');
          await consumeMatchingDiscreteRewardsForWalletSpend({
            userId,
            rewardType: 'freebet',
            amount: effectiveStake,
            betId,
            client,
          });
        } else {
          const availableCash = getAvailableBalance(walletViewFromRow(wallet));
          if (availableCash < effectiveStake) {
            throw new Error(
              `INSUFFICIENT_BALANCE: Insufficient available balance. Required: ₹${effectiveStake}, Available: ₹${availableCash}`,
            );
          }
          const allocation = allocateCashStakeForWallet(wallet, effectiveStake);
          stakeFromLocked = allocation.fromLocked;
          stakeFromWinnings = allocation.fromWinnings;
          stakeFromCash = allocation.fromNonWinnings;
          newCash = Number((cashBalance - effectiveStake).toFixed(2));
          const newLocked = Number((Number(wallet.locked_deposit_balance || 0) - stakeFromLocked).toFixed(2));
          ledgerAfter = newCash;
          await client.query(
            `UPDATE wallets
             SET balance = $1,
                 locked_deposit_balance = $2,
                 updated_at = NOW()
             WHERE wallet_id = $3`,
            [newCash, newLocked, wallet.wallet_id],
          );
        }

        const targetMatchId = matchId || validatedSelections[0]?.matchId;
        const targetSelectionId = selectionId || validatedSelections[0]?.selectionId;
        const targetMarketId = marketId || validatedSelections[0]?.marketId;
        const placementSnapshot = buildPlacementSnapshot({
          betType,
          validatedSelections,
          stateVersion: placementStateVersion,
          oddsVersion: placementOddsVersion ?? 1,
          inningsAtPlacement: quote?.innings ?? quote?.currentInnings ?? validatedSelections[0]?.innings ?? null,
          matchOversAtPlacement: quote?.overs ?? quote?.oversStr ?? null,
        });

        await client.query(
          `INSERT INTO bets (
             bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds,
             potential_payout, potential_profit, bet_type, status, idempotency_key, fund_source,
             vip_boost_pct, stake_from_locked, stake_from_winnings, stake_from_cash,
             odds_version, placement_snapshot, reward_id, returns_stake, state_key, created_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ACCEPTED', $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW())`,
          [
            betId, userId, targetMatchId, targetMarketId, targetSelectionId, effectiveStake, acceptedOdds, acceptedOdds,
            potentialPayout, potentialProfit, betType, idempotencyKey || null, fundSource, vipBoostPct,
            stakeFromLocked, stakeFromWinnings, stakeFromCash,
            placementOddsVersion ?? 1, JSON.stringify(placementSnapshot),
            rewardId || null, returnsStake,
            quote?.stateKey || validatedSelections[0]?.stateKey || null,
          ],
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

        const ledgerDesc = rewardId
          ? `Bet Stake #${betId} (${fundSource === 'freebet' ? '🎁 Free Bet' : '⭐ Bonus'} #${rewardId})`
          : `Bet Stake #${betId} (${fundSource})`;

        await client.query(
          `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
           VALUES ($1, $2, 'DEBIT', $3, $4, $5, NOW())`,
          [wallet.wallet_id, txId, effectiveStake, ledgerAfter, ledgerDesc],
        );

        const loyaltyRow = await client.query(
          `SELECT tier FROM user_loyalty WHERE user_id = $1 FOR UPDATE`,
          [userId],
        );
        const currentTier = loyaltyRow.rows[0]?.tier || 'BRONZE';
        const loyaltyPoints = pointsFromSpendAtTier(effectiveStake, currentTier);
        if (loyaltyPoints > 0) {
          await earnLoyaltyPoints(client, userId, loyaltyPoints);
        }

        const eventId = `evt_${betId}`;
        await client.query(
          `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status, correlation_id, created_at)
           VALUES ($1, 'BET_PLACED', 'bet', $2, $3, 'PENDING', $4, NOW())`,
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

      try {
        await recordBetRiskLiability(validatedSelections, result.stake);
      } catch {
        // Persisted exposure is best-effort; open-bets query remains authoritative.
      }

      return {
        ...result,
        oddsUpdates: [],
        oddsChanged: false,
      };
    } catch (err) {
      if (idempotencyKey) {
        await idempotencyEngine.fail(idempotencyKey, err.message);
      }
      throw err;
    }
  }
}

export const betPlacementEngine = new BetPlacementEngine();
