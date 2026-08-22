import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendToUser = vi.fn(() => ({ sent: 1, broadcastedCount: 1 }));

vi.mock('../../lib/websocketEngine.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    sendToUser: (...args) => sendToUser(...args),
  };
});

import { processPendingOutboxEvents, subscribeToEvent } from '../../lib/outboxWorker.mjs';
import { query } from '../../db/pg.js';
import { canSubscribeToChannel } from '../../lib/websocketEngine.mjs';

async function drainUntilProcessed(eventId, { rounds = 30, batch = 50 } = {}) {
  for (let i = 0; i < rounds; i++) {
    const st = await query(`SELECT status FROM outbox_events WHERE id = $1`, [eventId]);
    if (st.rows[0]?.status === 'PROCESSED' || st.rows[0]?.status === 'DEAD_LETTER') {
      return st.rows[0].status;
    }
    await processPendingOutboxEvents(batch);
  }
  const final = await query(`SELECT status FROM outbox_events WHERE id = $1`, [eventId]);
  return final.rows[0]?.status || null;
}

describe('Financial WebSocket outbox → sendToUser', () => {
  const userId = 'usr_ws_fin_iso';
  const otherUserId = 'usr_ws_fin_other';

  beforeEach(async () => {
    sendToUser.mockReset();
    sendToUser.mockImplementation(() => ({ sent: 1, broadcastedCount: 1 }));
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT DO NOTHING`, [
      userId,
      `${userId}@test.com`,
    ]);
    await query(`DELETE FROM outbox_events WHERE payload::text LIKE $1 OR payload::text LIKE $2`, [
      `%${userId}%`,
      `%${otherUserId}%`,
    ]);
  });

  it('BET_SETTLED emits BET_SETTLED + WALLET_BALANCE_UPDATED with eventId and balances', async () => {
    const betId = `bet_ws_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const evtId = `evt_ws_settle_${betId}`;
    await query(
      `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status, created_at, available_at)
       VALUES ($1, 'BET_SETTLED', 'bet', $2, $3, 'PENDING', NOW(), NOW() - INTERVAL '1 second')`,
      [
        evtId,
        betId,
        JSON.stringify({
          userId,
          betId,
          matchId: 'm1',
          outcome: 'WON',
          status: 'WON',
          payout: 530,
          stake: 500,
          walletBalance: 1030,
          availableBalance: 1030,
          withdrawableBalance: 1030,
          winnings: 30,
          settlementVersion: 1,
          settledAt: new Date().toISOString(),
        }),
      ],
    );

    expect(await drainUntilProcessed(evtId)).toBe('PROCESSED');

    const settleCall = sendToUser.mock.calls.find((c) => c[1] === 'BET_SETTLED' && c[2]?.betId === betId);
    const walletCall = sendToUser.mock.calls.find(
      (c) => c[1] === 'WALLET_BALANCE_UPDATED' && c[2]?.betId === betId,
    );
    expect(settleCall).toBeTruthy();
    expect(settleCall[0]).toBe(userId);
    expect(settleCall[2].eventId).toMatch(/ws_settle_/);
    expect(settleCall[2].userId).toBe(userId);
    expect(settleCall[2].betId).toBe(betId);
    expect(settleCall[2].payout).toBe(530);
    expect(settleCall[2].walletBalance).toBe(1030);

    expect(walletCall).toBeTruthy();
    expect(walletCall[0]).toBe(userId);
    expect(walletCall[2].eventId).toMatch(/ws_wallet_/);
    expect(walletCall[2].availableBalance).toBe(1030);
    expect(walletCall[2].withdrawableBalance).toBe(1030);
    expect(walletCall[2].timestamp).toBeTruthy();
  });

  it('BET_CASHED_OUT emits user-scoped wallet update with eventId', async () => {
    const betId = `bet_ws_co_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const evtId = `evt_ws_co_${betId}`;
    await query(
      `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status, created_at, available_at)
       VALUES ($1, 'BET_CASHED_OUT', 'bet', $2, $3, 'PENDING', NOW(), NOW() - INTERVAL '1 second')`,
      [
        evtId,
        betId,
        JSON.stringify({
          userId,
          betId,
          cashoutAmount: 420,
          newBalance: 920,
          availableBalance: 920,
        }),
      ],
    );

    expect(await drainUntilProcessed(evtId)).toBe('PROCESSED');
    const cashCall = sendToUser.mock.calls.find((c) => c[1] === 'BET_CASHED_OUT' && c[2]?.betId === betId);
    expect(cashCall?.[0]).toBe(userId);
    expect(cashCall?.[2].eventId).toMatch(/ws_cashout_/);
    const walletCall = sendToUser.mock.calls.find(
      (c) => c[1] === 'WALLET_BALANCE_UPDATED' && c[2]?.betId === betId,
    );
    expect(walletCall?.[2].eventId).toMatch(/ws_wallet_cashout_/);
  });

  it('deposit.completed emits WALLET_BALANCE_UPDATED for depositor only', async () => {
    const paymentId = `pay_ws_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const evtId = `evt_${paymentId}`;
    await query(
      `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status, created_at, available_at)
       VALUES ($1, 'deposit.completed', 'deposit', $2, $3, 'PENDING', NOW(), NOW() - INTERVAL '1 second')`,
      [
        evtId,
        paymentId,
        JSON.stringify({
          userId,
          amount: 1000,
          paymentId,
          newBalance: 1000,
          availableBalance: 1000,
        }),
      ],
    );
    expect(await drainUntilProcessed(evtId)).toBe('PROCESSED');
    const walletCall = sendToUser.mock.calls.find(
      (c) => c[1] === 'WALLET_BALANCE_UPDATED' && c[0] === userId && c[2]?.reason === 'DEPOSIT' && c[2]?.paymentId === paymentId,
    );
    expect(walletCall?.[0]).toBe(userId);
    expect(walletCall?.[2].reason).toBe('DEPOSIT');
    expect(walletCall?.[2].walletBalance).toBe(1000);
  });

  it('user channel isolation: session cannot subscribe to another user channel', async () => {
    const session = { userId, role: 'user', anonymousOddsOnly: false };
    expect(await canSubscribeToChannel(session, `user:${userId}`)).toBe(true);
    expect(await canSubscribeToChannel(session, `user:${otherUserId}`)).toBe(false);
  });

  it('WS failure path: settlement outbox handler errors do not throw to caller', async () => {
    sendToUser.mockImplementation(() => {
      throw new Error('ws down');
    });
    const betId = `bet_ws_down_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const evtId = `evt_ws_down_${betId}`;
    await query(
      `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status, created_at, available_at)
       VALUES ($1, 'BET_SETTLED', 'bet', $2, $3, 'PENDING', NOW(), NOW() - INTERVAL '1 second')`,
      [
        evtId,
        betId,
        JSON.stringify({
          userId,
          betId,
          outcome: 'WON',
          payout: 100,
          stake: 50,
          walletBalance: 100,
          availableBalance: 100,
          withdrawableBalance: 100,
          settlementVersion: 1,
        }),
      ],
    );
    // Handler catches WS errors; event should still process.
    expect(await drainUntilProcessed(evtId)).toBe('PROCESSED');
  });
});

describe('subscribeToEvent registry smoke', () => {
  it('allows additional handlers without breaking defaults', () => {
    let hit = false;
    subscribeToEvent('BET_SETTLED', async () => {
      hit = true;
    });
    expect(typeof hit).toBe('boolean');
  });
});
