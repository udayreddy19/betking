import { withTransaction, query } from '../db/pg.js';
import { idempotencyEngine } from './idempotencyEngine.mjs';
import { transitionBetStatus } from './betStateMachine.mjs';
import { publishOutboxEvent } from './outboxEngine.mjs';
import { priceCashoutFromV3Snapshot, calculatePartialCashout } from './cashoutPricing.mjs';
import { toPaise, fromPaise } from './money.mjs';

async function priceCashoutForBetRow(bet, legs, vipTier) {
  if (bet.status !== 'PENDING' && bet.status !== 'ACCEPTED') {
    return { available: false, cashoutValue: 0, reason: `STATUS_${bet.status}` };
  }
  if (bet.fund_source === 'bonus' || bet.fund_source === 'freebet') {
    return { available: false, cashoutValue: 0, reason: 'BONUS_OR_FREEBET' };
  }
  const primaryName = legs[0]?.selection_name || null;
  return priceCashoutFromV3Snapshot({
    stake: parseFloat(bet.stake),
    acceptedOdds: parseFloat(bet.accepted_odds || bet.odds),
    odds: parseFloat(bet.accepted_odds || bet.odds),
    matchId: bet.match_id,
    marketId: bet.market_id,
    selectionId: bet.selection_id,
    selectionName: primaryName,
    legs: legs.map((r) => ({
      matchId: r.match_id,
      marketId: r.market_id,
      selectionId: r.selection_id,
      selectionName: r.selection_name,
      odds: parseFloat(r.odds),
    })),
    vipTier: vipTier || 'BRONZE',
  });
}

/**
 * Quote live cashout without executing (My Bets / pre-confirm).
 */
export async function quoteBetCashout({ betId, userId, exec = null }) {
  const { assertEmergencyAllows } = await import('./emergencyState.mjs');
  try {
    await assertEmergencyAllows('cashout');
    const { assertProductEnabled } = await import('./productConfig.mjs');
    await assertProductEnabled('betting');
  } catch (err) {
    return { available: false, cashoutValue: 0, reason: err.message || 'CASHOUT_PAUSED' };
  }
  const q = exec?.query ? exec.query.bind(exec) : query;
  const betRes = await q(
    `SELECT bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds,
            potential_payout, status, bet_type, COALESCE(fund_source, 'cash') AS fund_source
     FROM bets WHERE bet_id = $1 AND user_id = $2`,
    [betId, userId],
  );
  if (betRes.rows.length === 0) {
    throw new Error('BET_NOT_FOUND: Bet does not exist or belong to user');
  }
  const bet = betRes.rows[0];
  const legsRes = await q(
    `SELECT match_id, market_id, selection_id, selection_name, odds FROM bet_selections WHERE bet_id = $1`,
    [betId],
  );
  const loyaltyRes = await q(`SELECT tier FROM user_loyalty WHERE user_id = $1`, [userId]);
  return priceCashoutForBetRow(bet, legsRes.rows, loyaltyRes.rows[0]?.tier || 'BRONZE');
}

/**
 * Batch cashout quotes for My Bets — one DB round-trip for bets + legs + loyalty.
 */
export async function quoteBetCashoutsBatch({ betIds, userId, exec = null }) {
  const ids = [...new Set((betIds || []).map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 50);
  const empty = { success: true, quotes: {} };
  if (ids.length === 0) return empty;

  const { assertEmergencyAllows } = await import('./emergencyState.mjs');
  try {
    await assertEmergencyAllows('cashout');
  } catch (err) {
    const reason = err.message || 'CASHOUT_PAUSED';
    return {
      success: true,
      quotes: Object.fromEntries(ids.map((id) => [id, { available: false, cashoutValue: 0, reason }])),
    };
  }

  const q = exec?.query ? exec.query.bind(exec) : query;
  const [betsRes, legsRes, loyaltyRes] = await Promise.all([
    q(
      `SELECT bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds,
              potential_payout, status, bet_type, COALESCE(fund_source, 'cash') AS fund_source
       FROM bets WHERE user_id = $1 AND bet_id = ANY($2::text[])`,
      [userId, ids],
    ),
    q(
      `SELECT bet_id, match_id, market_id, selection_id, selection_name, odds
       FROM bet_selections WHERE bet_id = ANY($1::text[])`,
      [ids],
    ),
    q(`SELECT tier FROM user_loyalty WHERE user_id = $1`, [userId]),
  ]);

  const vipTier = loyaltyRes.rows[0]?.tier || 'BRONZE';
  const legsByBet = new Map();
  for (const row of legsRes.rows) {
    const key = String(row.bet_id);
    if (!legsByBet.has(key)) legsByBet.set(key, []);
    legsByBet.get(key).push(row);
  }

  const quotes = {};
  const found = new Set();
  for (const bet of betsRes.rows) {
    const id = String(bet.bet_id);
    found.add(id);
    quotes[id] = await priceCashoutForBetRow(bet, legsByBet.get(id) || [], vipTier);
  }
  for (const id of ids) {
    if (!found.has(id)) {
      quotes[id] = { available: false, cashoutValue: 0, reason: 'BET_NOT_FOUND' };
    }
  }
  return { success: true, quotes };
}

/**
 * Execute Atomic Bet Cashout — priced from current V3 snapshot, not stored potential.
 */
export async function executeBetCashout({
  betId,
  userId,
  requestedCashoutValue = null,
  fraction = null,
  percentage = null,
  idempotencyKey = null,
}) {
  const rawFrac = fraction != null ? Number(fraction) : (percentage != null ? Number(percentage) : null);
  const isPartial = rawFrac != null && Number.isFinite(rawFrac) && rawFrac > 0 && rawFrac < 1;
  const frac = isPartial ? Math.max(0.1, Math.min(0.9, rawFrac > 1 ? rawFrac / 100 : rawFrac)) : 1;
  const cKey = idempotencyKey || (isPartial ? `cashout_partial_${betId}_${Math.round(frac * 100)}` : `cashout_${betId}`);
  const idCheck = await idempotencyEngine.checkOrLock(cKey, 'bet_cashout', `${betId}_${userId}_${Math.round(frac * 100)}`);
  if (idCheck.isDuplicate) {
    if (idCheck.status === 'COMPLETED') return idCheck.result;
    if (idCheck.status === 'PROCESSING') throw new Error('IDEMPOTENCY_CONFLICT: Cashout is processing');
  }

  try {
    const { assertEmergencyAllows } = await import('./emergencyState.mjs');
    await assertEmergencyAllows('cashout');
    const { assertProductEnabled } = await import('./productConfig.mjs');
    await assertProductEnabled('betting');
    // Pre-quote for UX / stale-price check; authoritative price is revalidated under lock.
    const previewQuote = await quoteBetCashout({ betId, userId });
    if (!previewQuote.available) {
      throw new Error(`CASHOUT_NOT_AVAILABLE: ${previewQuote.reason || 'Unable to price cashout from live odds'}`);
    }
    const previewPartial = isPartial ? calculatePartialCashout(previewQuote, frac) : null;
    const previewAmount = isPartial ? previewPartial.partialCashoutValue : previewQuote.cashoutValue;
    if (requestedCashoutValue != null
      && Math.abs(parseFloat(requestedCashoutValue) - previewAmount) > 0.05 * Math.max(previewAmount, 1)) {
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

      // In-transaction revalidation under the same DB lock as wallet/bet updates.
      const quote = await quoteBetCashout({ betId, userId, exec: client });
      if (!quote.available) {
        throw new Error(`CASHOUT_NOT_AVAILABLE: ${quote.reason || 'Unable to price cashout from live odds'}`);
      }
      const partial = isPartial ? calculatePartialCashout(quote, frac) : null;
      if (isPartial && !partial?.available) {
        throw new Error(`CASHOUT_NOT_AVAILABLE: ${partial?.reason || 'Partial cashout unavailable'}`);
      }
      const finalCashoutAmount = fromPaise(toPaise(isPartial ? partial.partialCashoutValue : quote.cashoutValue));
      if (Math.abs(finalCashoutAmount - previewAmount) > 0.05 * Math.max(previewAmount, 1)) {
        throw new Error('STALE_PRICE: Cashout value changed during confirmation. Please accept updated value.');
      }

      const wRes = await client.query(
        `SELECT wallet_id, balance, COALESCE(winnings_balance, 0) AS winnings_balance
         FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      if (wRes.rows.length === 0) throw new Error('WALLET_NOT_FOUND');

      const wallet = wRes.rows[0];
      const stake = fromPaise(toPaise(bet.stake));
      const cashedStake = isPartial ? fromPaise(toPaise(stake * frac)) : stake;
      const currentBal = fromPaise(toPaise(wallet.balance));
      const currentWinnings = fromPaise(toPaise(wallet.winnings_balance || 0));
      const cashoutProfit = fromPaise(toPaise(finalCashoutAmount) - toPaise(cashedStake));
      const newBal = fromPaise(toPaise(currentBal) + toPaise(finalCashoutAmount));
      const newWinnings = fromPaise(toPaise(currentWinnings) + toPaise(cashoutProfit));

      if (isPartial) {
        const remainingStake = fromPaise(toPaise(partial.remainingStake));
        const remainingPayout = fromPaise(toPaise(partial.remainingPotentialPayout));
        await client.query(
          `UPDATE bets
           SET stake = $1,
               potential_payout = $2
           WHERE bet_id = $3 AND status IN ('PENDING','ACCEPTED')`,
          [remainingStake, remainingPayout, betId],
        );
      } else {
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
      }

      await client.query(
        `UPDATE wallets
         SET balance = $1, winnings_balance = $2, updated_at = CURRENT_TIMESTAMP
         WHERE wallet_id = $3`,
        [newBal, newWinnings, wallet.wallet_id],
      );

      const txId = isPartial
        ? `tx_cashout_p${Math.round(frac * 100)}_${betId}_${Date.now().toString(36)}`
        : `tx_cashout_${betId}`;
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
      `, [
        wallet.wallet_id,
        txId,
        finalCashoutAmount,
        newBal,
        isPartial
          ? `Partial cashout ${Math.round(frac * 100)}% (${betId}); stake left ₹${partial.remainingStake}`
          : `Bet early cashout (${betId})`,
      ]);

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
          partial: isPartial,
          fraction: isPartial ? frac : 1,
          remainingStake: isPartial ? partial.remainingStake : 0,
          status: isPartial ? curStatus : 'CASHED_OUT',
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
        status: isPartial ? curStatus : 'CASHED_OUT',
        partial: isPartial,
        fraction: isPartial ? frac : 1,
        remainingStake: isPartial ? partial.remainingStake : 0,
        remainingPotentialPayout: isPartial ? partial.remainingPotentialPayout : 0,
      };
    });

    await idempotencyEngine.complete(cKey, result);
    return result;
  } catch (err) {
    await idempotencyEngine.fail(cKey, err.message);
    throw err;
  }
}
