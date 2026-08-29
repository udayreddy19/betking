import { withTransaction, query } from '../db/pg.js';
import { redis } from '../db/redis.js';

const subscribers = new Map(); // eventType -> Array of handler functions

/** Register domain event subscriber handler */
export function subscribeToEvent(eventType, handler) {
  if (!subscribers.has(eventType)) {
    subscribers.set(eventType, []);
  }
  subscribers.get(eventType).push(handler);
}

// Register default Redis cache invalidation subscribers
subscribeToEvent('USER_PROFILE_UPDATED', async (payload) => {
  if (payload.userId) await redis.del(`user:${payload.userId}:profile`);
});

subscribeToEvent('BET_PLACED', async (payload) => {
  if (payload.userId) await redis.del(`user:${payload.userId}:bets`);
});

subscribeToEvent('BET_SETTLED', async (payload) => {
  if (payload.userId) {
    await redis.del(`user:${payload.userId}:wallet`);
    await redis.del(`user:${payload.userId}:bets`);
  }
  try {
    const { sendToUser } = await import('./websocketEngine.mjs');
    const profit = payload.payout != null && payload.stake != null
      ? parseFloat((Number(payload.payout) - Number(payload.stake)).toFixed(2))
      : null;
    sendToUser(payload.userId, 'BET_SETTLED', {
      eventId: `ws_settle_${payload.betId}_v${payload.settlementVersion || 1}`,
      betId: payload.betId,
      userId: payload.userId,
      status: payload.outcome || payload.status,
      payout: payload.payout,
      profit,
      stake: payload.stake,
      settledAt: payload.settledAt,
      matchId: payload.matchId,
      marketId: payload.marketId,
      selectionId: payload.selectionId,
      settlementVersion: payload.settlementVersion,
      settlementReason: payload.settlementReason,
      walletBalance: payload.walletBalance,
      availableBalance: payload.availableBalance,
      withdrawableBalance: payload.withdrawableBalance,
      winnings: payload.winnings,
    });
    if (payload.walletBalance != null) {
      sendToUser(payload.userId, 'WALLET_BALANCE_UPDATED', {
        eventId: `ws_wallet_${payload.betId}_v${payload.settlementVersion || 1}`,
        userId: payload.userId,
        betId: payload.betId,
        matchId: payload.matchId,
        walletBalance: payload.walletBalance,
        availableBalance: payload.availableBalance,
        withdrawableBalance: payload.withdrawableBalance,
        winnings: payload.winnings,
        settlementStatus: payload.outcome || payload.status,
        payout: payload.payout,
        settlementVersion: payload.settlementVersion,
        timestamp: Date.now(),
      });
    }
    console.log(JSON.stringify({
      event: 'OUTBOX_PUBLISHED',
      type: 'BET_SETTLED',
      betId: payload.betId,
      userId: payload.userId,
    }));
  } catch (err) {
    console.error('[Outbox BET_SETTLED WS]', err.message);
  }
});

subscribeToEvent('BET_CASHED_OUT', async (payload) => {
  if (payload.userId) {
    await redis.del(`user:${payload.userId}:wallet`);
    await redis.del(`user:${payload.userId}:bets`);
  }
  try {
    const { sendToUser } = await import('./websocketEngine.mjs');
    sendToUser(payload.userId, 'BET_CASHED_OUT', {
      eventId: `ws_cashout_${payload.betId}`,
      betId: payload.betId,
      userId: payload.userId,
      status: 'CASHED_OUT',
      cashoutAmount: payload.cashoutAmount,
      walletBalance: payload.newBalance,
    });
    if (payload.newBalance != null) {
      sendToUser(payload.userId, 'WALLET_BALANCE_UPDATED', {
        eventId: `ws_wallet_cashout_${payload.betId}`,
        userId: payload.userId,
        betId: payload.betId,
        matchId: payload.matchId,
        walletBalance: payload.newBalance,
        availableBalance: payload.availableBalance ?? payload.newBalance,
        withdrawableBalance: payload.withdrawableBalance,
        winnings: payload.winnings,
        settlementStatus: 'CASHED_OUT',
        payout: payload.cashoutAmount,
        timestamp: Date.now(),
      });
    }
  } catch (err) {
    console.error('[Outbox BET_CASHED_OUT WS]', err.message);
  }
});

subscribeToEvent('deposit.completed', async (payload) => {
  if (payload.userId) {
    await redis.del(`user:${payload.userId}:wallet`);
  }
  try {
    const { sendToUser } = await import('./websocketEngine.mjs');
    sendToUser(payload.userId, 'WALLET_BALANCE_UPDATED', {
      eventId: `ws_deposit_${payload.paymentId || payload.aggregateId || Date.now()}`,
      userId: payload.userId,
      walletBalance: payload.newBalance,
      availableBalance: payload.availableBalance ?? payload.newBalance,
      withdrawableBalance: payload.withdrawableBalance,
      reason: 'DEPOSIT',
      amount: payload.amount,
      paymentId: payload.paymentId,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('[Outbox deposit.completed WS]', err.message);
  }
  try {
    const { tryQualifyReferralAfterDeposit } = await import('./referralLoyaltyEngine.mjs');
    await tryQualifyReferralAfterDeposit({
      userId: payload.userId,
      amount: payload.amount,
    });
  } catch (err) {
    console.error('[Outbox deposit.completed referral]', err.message);
  }
  try {
    const { tryGrantDepositFreebet } = await import('./depositFreebetEngine.mjs');
    let depositId = payload.depositId || null;
    if (!depositId && payload.paymentId) {
      const { query } = await import('../db/pg.js');
      const dep = await query(
        `SELECT deposit_id FROM deposits WHERE payment_id = $1 LIMIT 1`,
        [payload.paymentId],
      );
      depositId = dep.rows[0]?.deposit_id || null;
    }
    if (depositId) {
      await tryGrantDepositFreebet({
        userId: payload.userId,
        depositId,
        amount: payload.amount,
      });
    }
  } catch (err) {
    console.error('[Outbox deposit.completed deposit-freebet]', err.message);
  }
});

subscribeToEvent('referral.rewarded', async (payload) => {
  try {
    const { sendToUser } = await import('./websocketEngine.mjs');
    const targets = [payload.referrerUserId, payload.referredUserId].filter(Boolean);
    for (const userId of targets) {
      sendToUser(userId, 'REFERRAL_REWARD_GRANTED', {
        eventId: `ws_ref_${payload.referralId}_${userId}`,
        timestamp: Date.now(),
        referralId: payload.referralId,
        rewardType: payload.rewardType || 'FREEBET',
        amount: userId === payload.referrerUserId ? payload.referrerAmount : payload.referredAmount,
      });
      sendToUser(userId, 'WALLET_BALANCE_UPDATED', {
        eventId: `ws_ref_wallet_${payload.referralId}_${userId}`,
        userId,
        reason: 'REFERRAL',
        timestamp: Date.now(),
      });
    }
  } catch (err) {
    console.error('[Outbox referral.rewarded WS]', err.message);
  }
});

subscribeToEvent('kyc.verified', async (payload) => {
  if (payload.userId) {
    try {
      const { tryQualifyReferralAfterVerification } = await import('./referralLoyaltyEngine.mjs');
      await tryQualifyReferralAfterVerification({ userId: payload.userId });
    } catch (err) {
      console.error('[Outbox kyc.verified referral]', err.message);
    }
  }
});

// Backward compatibility for legacy event names
subscribeToEvent('bet.settled', async (payload) => {
  if (payload.userId) {
    await redis.del(`user:${payload.userId}:wallet`);
    await redis.del(`user:${payload.userId}:bets`);
  }
});

subscribeToEvent('bet.created', async (payload) => {
  if (payload.userId) await redis.del(`user:${payload.userId}:bets`);
});

/**
 * Process Pending Outbox Events Batch using PostgreSQL FOR UPDATE SKIP LOCKED
 */
export async function processPendingOutboxEvents(batchSize = 20) {
  try {
    const events = await withTransaction(async (client) => {
      const claimRes = await client.query(`
        SELECT id, event_type, aggregate_type, aggregate_id, payload, attempts, correlation_id
        FROM outbox_events
        WHERE status IN ('PENDING', 'FAILED')
          AND available_at <= CURRENT_TIMESTAMP
          AND attempts < 5
        ORDER BY available_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED;
      `, [batchSize]);

      if (claimRes.rows.length === 0) return [];

      const claimedIds = claimRes.rows.map(r => r.id);
      await client.query(`
        UPDATE outbox_events
        SET status = 'PROCESSING', updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($1);
      `, [claimedIds]);

      return claimRes.rows;
    });

    let processedCount = 0;

    for (const evt of events) {
      try {
        const handlers = subscribers.get(evt.event_type) || [];
        const payload = typeof evt.payload === 'string' ? JSON.parse(evt.payload) : evt.payload;

        for (const handler of handlers) {
          await handler(payload, evt);
        }

        // Mark event as PROCESSED
        await query(`
          UPDATE outbox_events
          SET status = 'PROCESSED', processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1;
        `, [evt.id]);

        processedCount++;
      } catch (err) {
        const nextAttempts = (evt.attempts || 0) + 1;
        const maxAttempts = 5;
        const isDeadLetter = nextAttempts >= maxAttempts;
        const nextStatus = isDeadLetter ? 'DEAD_LETTER' : 'FAILED';

        // Exponential backoff: 2^attempts * 1000ms
        const delayMs = Math.pow(2, nextAttempts) * 1000;
        const nextAvailable = new Date(Date.now() + delayMs).toISOString();

        await query(`
          UPDATE outbox_events
          SET status = $1, attempts = $2, error_message = $3, available_at = $4, updated_at = CURRENT_TIMESTAMP
          WHERE id = $5;
        `, [nextStatus, nextAttempts, err.message, nextAvailable, evt.id]);
      }
    }

    return processedCount;
  } catch (err) {
    console.error('[Outbox Worker Error]', err.message);
    return 0;
  }
}
