/**
 * Authenticated settlement → outbox → WebSocket lifecycle (no Razorpay).
 * Funds via non-prod helper; settles with __forcedOutcome; asserts sendToUser events.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../lib/oddsQuoteService.mjs', () => ({
  resolveServerOdds: vi.fn(async ({ clientOdds, marketId, selectionId }) => ({
    odds: clientOdds != null ? Number(clientOdds) : 1.5,
    changed: false,
    previousOdds: clientOdds != null ? Number(clientOdds) : null,
    marketId,
    selectionId,
    stateVersion: 1,
    oddsVersion: 1,
    generatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5000).toISOString(),
  })),
  unwrapServerOddsQuote: (quote) => (quote?.odds != null ? Number(quote.odds) : Number(quote)),
}));

const sendToUser = vi.fn(() => ({ sent: 1, broadcastedCount: 1 }));

vi.mock('../../db/redis.js', () => ({
  redis: {
    status: 'ready',
    publish: vi.fn(async () => 1),
    duplicate: vi.fn(() => ({
      on: vi.fn(),
      subscribe: vi.fn(async () => {}),
      connect: vi.fn(async () => {}),
    })),
    del: vi.fn(async () => 1),
    connect: vi.fn(async () => {}),
  },
}));

vi.mock('../../lib/websocketEngine.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    sendToUser: (...args) => sendToUser(...args),
  };
});

import { query } from '../../db/pg.js';
import { betPlacementEngine } from '../../lib/betPlacementEngine.mjs';
import { betSettlementEngine } from '../../lib/betSettlementEngine.mjs';
import { marketSuspensionEngine } from '../../lib/marketSuspensionEngine.mjs';
import { processPendingOutboxEvents } from '../../lib/outboxWorker.mjs';
import { canSubscribeToChannel } from '../../lib/websocketEngine.mjs';
import { fundTestWallet, assertNonProductionFunding } from '../helpers/testFundWallet.mjs';
import {
  shouldApplyFinancialWsEvent,
  isFinancialWsEventType,
} from '../../src/utils/wsFinancialEvents.js';

describe('Authenticated settlement WebSocket lifecycle (no Razorpay)', () => {
  const userId = 'usr_settle_ws';
  const matchId = 'm_settle_ws';
  const marketId = 'match_winner_settle_ws';
  const selectionId = 'sel_home_settle_ws';

  beforeEach(async () => {
    sendToUser.mockReset();
    sendToUser.mockImplementation(() => ({ sent: 1, broadcastedCount: 1 }));
    await marketSuspensionEngine.clearSuspensionCause(marketId, 'STALE_ODDS');
    await query(`DELETE FROM ledger_entries WHERE wallet_id IN (SELECT wallet_id FROM wallets WHERE user_id = $1)`, [userId]);
    await query(`DELETE FROM transactions WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM bets WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM outbox_events WHERE payload::text LIKE $1`, [`%${userId}%`]);
    await query(`DELETE FROM wallets WHERE user_id = $1`, [userId]);
    await query(
      `INSERT INTO matches (match_id, status) VALUES ($1, 'LIVE')
       ON CONFLICT (match_id) DO UPDATE SET status = 'LIVE'`,
      [matchId],
    );
    await query(
      `INSERT INTO markets (market_id, match_id, name, status) VALUES ($1, $2, 'Winner', 'OPEN')
       ON CONFLICT (market_id) DO UPDATE SET status = 'OPEN'`,
      [marketId, matchId],
    );
    await query(
      `INSERT INTO selections (selection_id, market_id, name, odds, status)
       VALUES ($1, $2, 'Home', 1.5, 'OPEN')
       ON CONFLICT (selection_id) DO UPDATE SET odds = 1.5, status = 'OPEN'`,
      [selectionId, marketId],
    );
  });

  async function place({ stake, key }) {
    const res = await betPlacementEngine.placeBet({
      userId,
      matchId,
      marketId,
      selectionId,
      stake,
      clientOdds: 1.5,
      fundSource: 'cash',
      idempotencyKey: key,
    });
    expect(res.success).toBe(true);
    return res.betId;
  }

  async function drainOutbox() {
    for (let i = 0; i < 25; i++) {
      await processPendingOutboxEvents(50);
    }
  }

  it('forbids test funding in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    expect(() => assertNonProductionFunding()).toThrow(/TEST_FUND_FORBIDDEN/);
    process.env.NODE_ENV = prev;
  });

  it('WIN: place → settle → BET_SETTLED + WALLET_BALANCE_UPDATED to same user only', async () => {
    await fundTestWallet({ userId, amount: 1000 });
    const betId = await place({ stake: 100, key: `ws_win_${Date.now()}` });
    await query(
      `UPDATE bets SET odds = 1.5, accepted_odds = 1.5, potential_payout = 150 WHERE bet_id = $1`,
      [betId],
    );
    const settled = await betSettlementEngine.settleSingleBet({
      betId,
      matchState: { matchId, status: 'COMPLETED', __forcedOutcome: 'WON' },
    });
    expect(settled.outcome).toBe('WON');
    await drainOutbox();

    const settleCalls = sendToUser.mock.calls.filter((c) => c[1] === 'BET_SETTLED' && c[2]?.betId === betId);
    const walletCalls = sendToUser.mock.calls.filter(
      (c) => c[1] === 'WALLET_BALANCE_UPDATED' && (c[2]?.betId === betId || c[2]?.userId === userId),
    );
    expect(settleCalls.length).toBeGreaterThanOrEqual(1);
    expect(settleCalls[0][0]).toBe(userId);
    expect(settleCalls[0][2].userId).toBe(userId);
    expect(walletCalls.length).toBeGreaterThanOrEqual(1);
    expect(walletCalls.every((c) => c[0] === userId)).toBe(true);

    expect(await canSubscribeToChannel({ userId }, `user:${userId}`)).toBe(true);
    expect(await canSubscribeToChannel({ userId }, `user:other_user`)).toBe(false);

    const seen = new Set();
    const lastTs = { current: 0 };
    const evt = {
      eventId: settleCalls[0][2].eventId,
      timestamp: Date.now(),
      payload: { eventId: settleCalls[0][2].eventId },
    };
    expect(isFinancialWsEventType('BET_SETTLED')).toBe(true);
    expect(shouldApplyFinancialWsEvent(evt, seen, lastTs).apply).toBe(true);
    expect(shouldApplyFinancialWsEvent(evt, seen, lastTs).reason).toBe('duplicate');
  });

  it('LOSS and VOID emit settlement events without fake payouts', async () => {
    await fundTestWallet({ userId, amount: 2000 });
    const lossId = await place({ stake: 100, key: `ws_loss_${Date.now()}` });
    await betSettlementEngine.settleSingleBet({
      betId: lossId,
      matchState: { matchId, status: 'COMPLETED', __forcedOutcome: 'LOST' },
    });
    await drainOutbox();
    expect(sendToUser.mock.calls.some((c) => c[1] === 'BET_SETTLED' && c[2]?.betId === lossId)).toBe(true);

    sendToUser.mockClear();
    const voidId = await place({ stake: 100, key: `ws_void_${Date.now()}` });
    await betSettlementEngine.settleSingleBet({
      betId: voidId,
      matchState: { matchId, status: 'COMPLETED', __forcedOutcome: 'VOID' },
    });
    await drainOutbox();
    expect(sendToUser.mock.calls.some((c) => c[1] === 'BET_SETTLED' && c[2]?.betId === voidId)).toBe(true);
    const w = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [userId]);
    // 2000 - 100 (loss) - 100 (void stake) + 100 (void refund) = 1900
    expect(Number(w.rows[0].balance)).toBe(1900);
  });
});
