import { withTransaction, query } from '../db/pg.js';
import { idempotencyEngine } from './idempotencyEngine.mjs';
import { transitionBetStatus } from './betStateMachine.mjs';
import { publishOutboxEvent } from './outboxEngine.mjs';
import { priceCashoutFromV3Snapshot } from './cashoutPricing.mjs';

/**
 * Quote live cashout without executing (My Bets / pre-confirm).
 */
export async function quoteBetCashout({ betId, userId }) {
  const betRes = await query(
    `SELECT bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds,
            potential_payout, status, bet_type, COALESCE(fund_source, 'cash') AS fund_source
     FROM bets WHERE bet_id = $1 AND user_id = $2`,
    [betId, userId],
  );
  if (betRes.rows.length === 0) {
    throw new Error('BET_NOT_FOUND: Bet does not exist or belong to user');
  }
  const bet = betRes.rows[0];
  if (bet.status !== 'PENDING' && bet.status !== 'ACCEPTED') {
    return { available: false, cashoutValue: 0, reason: `STATUS_${bet.status}` };
  }
  if (bet.fund_source === 'bonus' || bet.fund_source === 'freebet') {
    return { available: false, cashoutValue: 0, reason: 'BONUS_OR_FREEBET' };
  }

  const legsRes = await query(
    `SELECT match_id, market_id, selection_id, selection_name, odds FROM bet_selections WHERE bet_id = $1`,
    [betId],
  );
  const loyaltyRes = await query(`SELECT tier FROM user_loyalty WHERE user_id = $1`, [userId]);
  const primaryName = legsRes.rows[0]?.selection_name || null;

  return priceCashoutFromV3Snapshot({
    stake: parseFloat(bet.stake),
    acceptedOdds: parseFloat(bet.accepted_odds || bet.odds),
    odds: parseFloat(bet.accepted_odds || bet.odds),
    matchId: bet.match_id,
    marketId: bet.market_id,
    selectionId: bet.selection_id,
    selectionName: primaryName,
    legs: legsRes.rows.map((r) => ({
      matchId: r.match_id,
      marketId: r.market_id,
      selectionId: r.selection_id,
      selectionName: r.selection_name,
      odds: parseFloat(r.odds),
    })),
    vipTier: loyaltyRes.rows[0]?.tier || 'BRONZE',
  });
}

/**
 * Execute Atomic Bet Cashout — priced from current V3 snapshot, not stored potential.
 */
export async function executeBetCashout({
  betId,
  userId,
  requestedCashoutValue = null,
  idempotencyKey = null,
}) {
  const cKey = idempotencyKey || `cashout_${betId}`;
  const idCheck = await idempotencyEngine.checkOrLock(cKey, 'bet_cashout', `${betId}_${userId}`);
  if (idCheck.isDuplicate) {
    if (idCheck.status === 'COMPLETED') return idCheck.result;
    if (idCheck.status === 'PROCESSING') throw new Error('IDEMPOTENCY_CONFLICT: Cashout is processing');
  }

  try {
    // Pre-quote for UX / stale-price check; authoritative price is revalidated under lock.
    const previewQuote = await quoteBetCashout({ betId, userId });
    if (!previewQuote.available) {
      throw new Error(`CASHOUT_NOT_AVAILABLE: ${previewQuote.reason || 'Unable to price cashout from live odds'}`);
    }
    if (requestedCashoutValue != null
      && Math.abs(parseFloat(requestedCashoutValue) - previewQuote.cashoutValue) > 0.05 * Math.max(previewQuote.cashoutValue, 1)) {
      throw new Error('STALE_PRICE: Cashout value changed. Please accept updated value.');
    }

    const result = await withTransaction(async (client) => {
      const betRes = await client.query(`
        SELECT bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds,
               potential_payout, status, COALESCE(fund_source, 'cash') AS fund_source
        FROM bets
        WHERE bet_id = $1 AND user_id = $2
        FOR UPDATE;
      `, [betId, userId]);

      if (betRes.rows.length === 0) {
        throw new Error('BET_NOT_FOUND: Bet does not exist or belong to user');
      }

      const bet = betRes.rows[0];
      const curStatus = bet.status;

      if (curStatus !== 'PENDING' && curStatus !== 'ACCEPTED') {
        throw new Error(`CASHOUT_NOT_ALLOWED: Bet ${betId} in status '${curStatus}' cannot be cashed out`);
      }
      if (bet.fund_source === 'bonus' || bet.fund_source === 'freebet') {
        throw new Error('CASHOUT_NOT_ALLOWED: Bonus and freebet stakes cannot be cashed out');
      }

      // In-transaction revalidation: refuse if status raced to terminal; re-price from V3.
      const quote = await quoteBetCashout({ betId, userId });
      if (!quote.available) {
        throw new Error(`CASHOUT_NOT_AVAILABLE: ${quote.reason || 'Unable to price cashout from live odds'}`);
      }
      if (Math.abs(quote.cashoutValue - previewQuote.cashoutValue) > 0.05 * Math.max(previewQuote.cashoutValue, 1)) {
        throw new Error('STALE_PRICE: Cashout value changed during confirmation. Please accept updated value.');
      }
      const finalCashoutAmount = Number(quote.cashoutValue.toFixed(2));

      const wRes = await client.query(
        `SELECT wallet_id, balance, COALESCE(winnings_balance, 0) AS winnings_balance
         FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      if (wRes.rows.length === 0) throw new Error('WALLET_NOT_FOUND');

      const wallet = wRes.rows[0];
      const stake = parseFloat(bet.stake);
      const currentBal = parseFloat(wallet.balance);
      const currentWinnings = parseFloat(wallet.winnings_balance || 0);
      const cashoutProfit = parseFloat((finalCashoutAmount - stake).toFixed(2));
      const newBal = parseFloat((currentBal + finalCashoutAmount).toFixed(2));
      const newWinnings = parseFloat((currentWinnings + cashoutProfit).toFixed(2));

      await transitionBetStatus({
        betId,
        fromStatus: curStatus,
        toStatus: 'CASHED_OUT',
        reason: `User early cashout of ₹${finalCashoutAmount.toFixed(2)} (V3 live reprice)`,
        actorId: userId,
        client,
      });

      await client.query(
        `UPDATE bets
         SET actual_payout = $1,
             winnings_credited = $2,
             settled_at = COALESCE(settled_at, CURRENT_TIMESTAMP)
         WHERE bet_id = $3 AND status = 'CASHED_OUT'`,
        [finalCashoutAmount, cashoutProfit, betId],
      );

      await client.query(
        `UPDATE wallets
         SET balance = $1, winnings_balance = $2, updated_at = CURRENT_TIMESTAMP
         WHERE wallet_id = $3`,
        [newBal, newWinnings, wallet.wallet_id],
      );

      const txId = `tx_cashout_${betId}`;
      const txInsert = await client.query(`
        INSERT INTO transactions (transaction_id, user_id, type, amount, status)
        VALUES ($1, $2, 'BET_CASHOUT', $3, 'COMPLETED')
        ON CONFLICT (transaction_id) DO NOTHING
        RETURNING transaction_id;
      `, [txId, userId, finalCashoutAmount]);

      if (txInsert.rowCount === 0) {
        throw new Error('IDEMPOTENCY_CONFLICT: Cashout already processed');
      }

      await client.query(`
        INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
        VALUES ($1, $2, 'CREDIT', $3, $4, $5);
      `, [wallet.wallet_id, txId, finalCashoutAmount, newBal, `Bet early cashout (${betId})`]);

      await publishOutboxEvent(client, {
        eventType: 'BET_CASHED_OUT',
        aggregateType: 'BET',
        aggregateId: betId,
        payload: {
          betId,
          userId,
          cashoutAmount: finalCashoutAmount,
          newBalance: newBal,
          fairCashout: quote.fairCashout,
          currentLegs: quote.currentLegs,
        },
      });

      return {
        success: true,
        betId,
        cashoutAmount: finalCashoutAmount,
        fairCashout: quote.fairCashout,
        pricingSource: 'ODDS_ENGINE_V3',
        oldBalance: currentBal,
        newBalance: newBal,
        status: 'CASHED_OUT',
      };
    });

    await idempotencyEngine.complete(cKey, result);
    return result;
  } catch (err) {
    await idempotencyEngine.fail(cKey, err.message);
    throw err;
  }
}
