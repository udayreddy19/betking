/**
 * Server-Authoritative Bet Placement Engine
 * Executes complete financial bet-placement lifecycle inside a PostgreSQL transaction boundary.
 * Enforces atomic wallet row locking (FOR UPDATE), idempotency, account eligibility, canonical market status,
 * server odds validation, stake limits, risk liability, ledger DEBIT, and outbox event creation.
 */

import { withTransaction, query } from '../db/pg.js';
import { accountEligibilityEngine } from './accountEligibilityEngine.mjs';
import { stakeLimitEngine } from './stakeLimitEngine.mjs';
import { betRiskEngine } from './betRiskEngine.mjs';
import { accumulatorEngine } from './accumulatorEngine.mjs';
import { marketSuspensionEngine } from './marketSuspensionEngine.mjs';
import { idempotencyEngine } from './idempotencyEngine.mjs';
import { evaluateMarketAgainstMatchState } from './marketEvaluationEngine.mjs';
import { assertBettableQuote, findQuotedSelection } from './odds-v3/bookIntegrity.mjs';
import { riskAdjustmentEngine } from './engines/riskAdjustmentEngine.mjs';
import { MIN_DECIMAL_ODDS } from './odds-v3/pricing/MarginCalculator.mjs';

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
    } = params;

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

      // 3. Stake Limits Validation
      const numericStake = stakeLimitEngine.validateStake(stake);

      let betType = 'SINGLE';
      let acceptedOdds = 1.0;
      let potentialPayout = 0;
      let potentialProfit = 0;
      let validatedSelections = [];

      // 4. Single vs Accumulator Validation
      if (Array.isArray(selections) && selections.length >= 2) {
        betType = 'ACCUMULATOR';
        const accumResult = await accumulatorEngine.validateAccumulator(numericStake, selections);
        acceptedOdds = accumResult.combinedOdds;
        potentialPayout = accumResult.potentialPayout;
        potentialProfit = accumResult.potentialProfit;
        validatedSelections = accumResult.selections;
      } else {
        betType = 'SINGLE';
        if (!matchId || !marketId || !selectionId) {
          throw new Error('INVALID_BET: matchId, marketId, and selectionId are required for single bet');
        }

        // Market State Check
        const causes = await marketSuspensionEngine.getActiveCauses(marketId);
        if (causes.length > 0) {
          throw new Error(`MARKET_SUSPENDED: Market '${marketId}' is currently suspended due to ${causes[0].reason}`);
        }

        let serverOdds = null;

        try {
          const { buildMatchOddsPayload } = await import('./liveScoresApiHandlers.mjs');
          const liveSnap = await buildMatchOddsPayload({ matchId, force: false });
          if (liveSnap?.status === 'UNSUPPORTED_SPORT') {
            throw new Error('ODDS_UNAVAILABLE: Cricket pricing is not used for this sport');
          }
          if (liveSnap?.status === 'DETERMINED') {
            throw new Error('MARKET_ALREADY_DETERMINED: Match markets are closed');
          }
          if (Array.isArray(liveSnap?.markets) && liveSnap.markets.length > 0) {
            const quoted = findQuotedSelection(liveSnap, marketId, selectionId);
            if (!quoted) {
              throw new Error(`ODDS_UNAVAILABLE: Selection '${selectionId}' is not on the live snapshot`);
            }
            serverOdds = assertBettableQuote(quoted.odds, clientOdds);
          }
        } catch (err) {
          if (
            err.message.startsWith('ODDS_CHANGED')
            || err.message.startsWith('MARKET_ALREADY_DETERMINED')
            || err.message.startsWith('MARKET_SUSPENDED')
            || err.message.startsWith('ODDS_LOCKED')
            || err.message.startsWith('ODDS_UNAVAILABLE: Selection')
            || err.message.startsWith('ODDS_UNAVAILABLE: Cricket')
          ) {
            throw err;
          }
        }

        if (serverOdds == null) {
          try {
            const { canonicalMatchStateEngine } = await import('./canonicalMatchState.mjs');
            const canonicalState = canonicalMatchStateEngine.getMatchState(matchId);
            if (canonicalState && (canonicalState.sport === 'CRICKET' || canonicalState.team1)) {
              const { generate } = await import('./odds-v3/OddsEngineV3.mjs');
              const v3Snap = generate(canonicalState);
              if (v3Snap && v3Snap.status === 'OK') {
                const quoted = findQuotedSelection(v3Snap, marketId, selectionId);
                if (quoted) {
                  serverOdds = assertBettableQuote(quoted.odds, clientOdds);
                }
              }
            }
          } catch (err) {
            if (
              err.message.startsWith('ODDS_CHANGED')
              || err.message.startsWith('MARKET_ALREADY_DETERMINED')
              || err.message.startsWith('MARKET_SUSPENDED')
              || err.message.startsWith('ODDS_LOCKED')
            ) throw err;
          }
        }

        // Authoritative Database Selection Check
        if (!serverOdds) {
          try {
            const selRes = await query('SELECT odds, status FROM selections WHERE selection_id = $1', [selectionId]);
            if (selRes.rows.length > 0) {
              if (selRes.rows[0].status === 'SUSPENDED') {
                throw new Error(`SELECTION_SUSPENDED: Selection '${selectionId}' is suspended`);
              }
              if (selRes.rows[0].status === 'DETERMINED' || selRes.rows[0].status === 'CLOSED' || selRes.rows[0].status === 'SETTLED') {
                throw new Error(`MARKET_ALREADY_DETERMINED: Market or selection '${selectionId}' is already determined and closed for betting`);
              }
              const dbOdds = parseFloat(selRes.rows[0].odds);
              serverOdds = assertBettableQuote(dbOdds, clientOdds);
            }
          } catch (dbErr) {
            if (dbErr.message.includes('ODDS_CHANGED') || dbErr.message.includes('SUSPENDED') || dbErr.message.includes('MARKET_ALREADY_DETERMINED')) throw dbErr;
          }
        }

        if (!serverOdds || isNaN(serverOdds) || serverOdds < MIN_DECIMAL_ODDS) {
          throw new Error(`ODDS_UNAVAILABLE: Authoritative odds unavailable or invalid for selection '${selectionId}' on match '${matchId}'`);
        }

        // Live Score Market Line Determination Check
        if (selectionId && matchId) {
          try {
            const matchRes = await query('SELECT live_score1, live_score2, status FROM matches WHERE match_id = $1', [matchId]);
            if (matchRes.rows.length > 0) {
              const mRow = matchRes.rows[0];
              const evalRes = evaluateMarketAgainstMatchState(
                { id: marketId, marketType: marketId, title: marketId, options: [{ id: selectionId, selection: selectionId, name: selectionId }] },
                { liveDetails: { runs: parseInt(mRow.live_score1 || 0, 10), score2: parseInt(mRow.live_score2 || 0, 10) }, status: mRow.status }
              );
              if (evalRes.determined || (evalRes.options && evalRes.options[0]?.determined)) {
                throw new Error(`MARKET_ALREADY_DETERMINED: Market selection '${selectionId}' is already determined based on live score`);
              }
            }
          } catch (mErr) {
            if (mErr.message.includes('MARKET_ALREADY_DETERMINED')) throw mErr;
          }
        }

        const calc = betRiskEngine.calculateSinglePayout(numericStake, serverOdds);
        acceptedOdds = calc.odds;
        potentialPayout = calc.potentialPayout;
        potentialProfit = calc.potentialProfit;

        validatedSelections.push({
          matchId,
          marketId,
          selectionId,
          odds: acceptedOdds,
        });
      }

      // 5. Atomic PostgreSQL Financial Transaction
      const result = await withTransaction(async (client) => {
        // A. Lock User Wallet Row FOR UPDATE
        const walletRes = await client.query(
          'SELECT wallet_id, balance, currency FROM wallets WHERE user_id = $1 FOR UPDATE',
          [userId]
        );

        if (walletRes.rows.length === 0) {
          throw new Error(`Wallet not found for user ${userId}`);
        }

        const wallet = walletRes.rows[0];
        const currentBalance = parseFloat(wallet.balance);

        // B. Balance Check
        if (currentBalance < numericStake) {
          throw new Error(`INSUFFICIENT_BALANCE: Insufficient wallet balance. Required: ₹${numericStake}, Available: ₹${currentBalance}`);
        }

        // C. Atomic Wallet Debit
        const newBalanceRes = await client.query(
          'UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE wallet_id = $2 RETURNING balance',
          [numericStake, wallet.wallet_id]
        );

        const newBalance = parseFloat(newBalanceRes.rows[0].balance);

        // D. Create Primary Bet Record
        const betId = `bet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const targetMatchId = matchId || validatedSelections[0]?.matchId;
        const targetSelectionId = selectionId || validatedSelections[0]?.selectionId;
        const targetMarketId = marketId || validatedSelections[0]?.marketId;

        await client.query(
          `INSERT INTO bets (bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds, potential_payout, potential_profit, bet_type, status, idempotency_key, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ACCEPTED', $12, NOW())`,
          [betId, userId, targetMatchId, targetMarketId, targetSelectionId, numericStake, acceptedOdds, acceptedOdds, potentialPayout, potentialProfit, betType, idempotencyKey || null]
        );

        // E. Create Bet Selections Records
        for (const sel of validatedSelections) {
          const bsId = `bs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          await client.query(
            `INSERT INTO bet_selections (id, bet_id, match_id, market_id, selection_id, selection_name, odds, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACCEPTED')`,
            [bsId, betId, sel.matchId, sel.marketId, sel.selectionId, sel.selectionName || sel.selectionId, sel.odds]
          );
        }

        // F. Create Transaction Record
        const txId = `tx_bet_${betId}`;
        await client.query(
          `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
           VALUES ($1, $2, 'BET_STAKE', $3, 'SUCCESS', NOW())`,
          [txId, userId, numericStake]
        );

        // G. Create Ledger Entry DEBIT
        await client.query(
          `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
           VALUES ($1, $2, 'DEBIT', $3, $4, $5, NOW())`,
          [wallet.wallet_id, txId, numericStake, newBalance, `Bet Stake #${betId}`]
        );

        // H. Create Outbox Event
        const eventId = `evt_${betId}`;
        await client.query(
          `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status, correlation_id, created_at)
           VALUES ($1, 'bet.created', 'bet', $2, $3, 'PENDING', $4, NOW())`,
          [eventId, betId, JSON.stringify({ betId, userId, stake: numericStake, odds: acceptedOdds, potentialPayout }), correlationId || null]
        );

        return {
          success: true,
          betId,
          transactionId: txId,
          stake: numericStake,
          odds: acceptedOdds,
          acceptedOdds,
          potentialPayout,
          potentialProfit,
          remainingBalance: newBalance,
          status: 'ACCEPTED',
          placedAt: new Date().toISOString(),
        };
      });

      if (idempotencyKey) {
        await idempotencyEngine.complete(idempotencyKey, result);
      }

      try {
        riskAdjustmentEngine.recordBetLiability(
          marketId || validatedSelections[0]?.marketId,
          selectionId || validatedSelections[0]?.selectionId,
          numericStake,
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
