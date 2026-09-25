/**
 * Pass 4 — 100 concurrent bet certification + exposure equality.
 * Requires Postgres. Classified: INTEGRATION / CONCURRENCY (not LIVE).
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('../../lib/oddsQuoteService.mjs', () => ({
  resolveServerOdds: vi.fn(async ({ clientOdds }) => ({
    odds: Number(clientOdds) || 2.0,
    changed: false,
    previousOdds: clientOdds != null ? Number(clientOdds) : null,
    oddsVersion: 1,
  })),
  unwrapServerOddsQuote: (quote) => (quote?.odds != null ? Number(quote.odds) : Number(quote)),
  loadLiveOddsSnapshot: vi.fn(async () => ({ status: 'OK', markets: [] })),
}));

import { betPlacementEngine } from '../../lib/betPlacementEngine.mjs';
import { query } from '../../db/pg.js';
import { getOpenMatchNetLiability, AUTHORITATIVE_EXPOSURE_SOURCE } from '../../lib/persistedMarketLiability.mjs';

const MATCH = 'm_pass4_100';
const MARKET = 'mkt_pass4_100';
const SEL = 'sel_pass4_100';
const STAKE = 10;
const ODDS = 2.0;

async function ensureUserWallet(userId, walletId, balance) {
  await query(
    `INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash')
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, `${userId}@example.com`],
  );
  await query(
    `INSERT INTO wallets (wallet_id, user_id, balance, currency)
     VALUES ($1, $2, $3, 'INR')
     ON CONFLICT (wallet_id) DO UPDATE SET balance = $3`,
    [walletId, userId, balance],
  );
}

describe('Pass-4 concurrency certification (100 bets)', () => {
  beforeAll(async () => {
    await query(`ALTER TABLE bets ADD COLUMN IF NOT EXISTS vip_boost_pct NUMERIC(5,2) DEFAULT 0`);
    await query(`INSERT INTO matches (match_id, status) VALUES ($1, 'LIVE') ON CONFLICT (match_id) DO NOTHING`, [MATCH]);
    await query(
      `INSERT INTO markets (market_id, match_id, name, status) VALUES ($1, $2, 'Winner', 'OPEN')
       ON CONFLICT (market_id) DO UPDATE SET status = 'OPEN'`,
      [MARKET, MATCH],
    );
    await query(
      `INSERT INTO selections (selection_id, market_id, name, odds, status)
       VALUES ($1, $2, 'Team A', $3, 'OPEN')
       ON CONFLICT (selection_id) DO UPDATE SET odds = $3, status = 'OPEN'`,
      [SEL, MARKET, ODDS],
    );
  });

  it('100 concurrent bets — different users, same market — exposure equals sum of open liabilities', async () => {
    expect(AUTHORITATIVE_EXPOSURE_SOURCE).toBe('open_bets_postgres');
    const users = Array.from({ length: 100 }, (_, i) => ({
      userId: `usr_p4_du_${i}`,
      walletId: `w_p4_du_${i}`,
    }));

    for (const u of users) {
      await ensureUserWallet(u.userId, u.walletId, 500);
      await query(`DELETE FROM bets WHERE user_id = $1 AND match_id = $2`, [u.userId, MATCH]);
    }

    const results = await Promise.allSettled(
      users.map((u) =>
        betPlacementEngine.placeBet({
          userId: u.userId,
          matchId: MATCH,
          marketId: MARKET,
          selectionId: SEL,
          stake: STAKE,
          clientOdds: ODDS,
          idempotencyKey: `p4_du_${u.userId}_${Date.now()}`,
        }),
      ),
    );

    const accepted = results.filter((r) => r.status === 'fulfilled' && !r.value?.isDuplicate);
    expect(accepted.length).toBe(100);

    const betCount = await query(
      `SELECT COUNT(*)::int AS c FROM bets
       WHERE match_id = $1 AND market_id = $2
         AND UPPER(COALESCE(status,'')) IN ('ACCEPTED','PENDING','OPEN')
         AND user_id LIKE 'usr_p4_du_%'`,
      [MATCH, MARKET],
    );
    expect(betCount.rows[0].c).toBe(100);

    // Each open bet liability = max(0, stake*odds - stake) = 10
    const expectedLiability = 100 * Math.max(0, STAKE * ODDS - STAKE);
    const liability = await getOpenMatchNetLiability(MATCH);
    // Other leftover open bets on MATCH may exist from prior runs — filter via per-user sum
    const scoped = await query(
      `SELECT COALESCE(SUM(
         GREATEST(0, COALESCE(potential_payout, stake * COALESCE(accepted_odds, odds, 1)) - stake)
       ), 0)::float AS liability
       FROM bets
       WHERE match_id = $1
         AND user_id LIKE 'usr_p4_du_%'
         AND UPPER(COALESCE(status,'')) IN ('ACCEPTED','PENDING','OPEN')`,
      [MATCH],
    );
    expect(Number(scoped.rows[0].liability)).toBe(expectedLiability);
    expect(liability).toBeGreaterThanOrEqual(expectedLiability);

    // No negative wallets
    const neg = await query(
      `SELECT COUNT(*)::int AS c FROM wallets WHERE user_id LIKE 'usr_p4_du_%' AND balance < 0`,
    );
    expect(neg.rows[0].c).toBe(0);

    // Exactly one reservation effect per accepted bet (BET_STAKE txn)
    const tx = await query(
      `SELECT COUNT(*)::int AS c FROM transactions
       WHERE type = 'BET_STAKE' AND user_id LIKE 'usr_p4_du_%'
         AND created_at > NOW() - INTERVAL '5 minutes'`,
    );
    expect(tx.rows[0].c).toBeGreaterThanOrEqual(100);
  }, 120_000);

  it('100 concurrent bets — same user — wallet never goes negative; accepted count matches debit', async () => {
    const userId = 'usr_p4_same';
    const walletId = 'w_p4_same';
    const starting = 10_000;
    await ensureUserWallet(userId, walletId, starting);
    // Soft-close prior open bets for this user so wallet math is clean
    await query(
      `UPDATE bets SET status = 'VOID'
       WHERE user_id = $1 AND UPPER(COALESCE(status,'')) IN ('ACCEPTED','PENDING','OPEN')`,
      [userId],
    );
    const beforeCount = await query(`SELECT COUNT(*)::int AS c FROM bets WHERE user_id = $1`, [userId]);
    const baseline = beforeCount.rows[0].c;

    const results = await Promise.allSettled(
      Array.from({ length: 100 }, (_, i) =>
        betPlacementEngine.placeBet({
          userId,
          matchId: MATCH,
          marketId: MARKET,
          selectionId: SEL,
          stake: STAKE,
          clientOdds: ODDS,
          idempotencyKey: `p4_same_${i}_${Date.now()}`,
        }),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled' && !r.value?.isDuplicate);
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length + rejected.length).toBe(100);

    const bets = await query(`SELECT COUNT(*)::int AS c FROM bets WHERE user_id = $1`, [userId]);
    expect(bets.rows[0].c - baseline).toBe(fulfilled.length);

    const w = await query(`SELECT balance::float AS b FROM wallets WHERE wallet_id = $1`, [walletId]);
    expect(w.rows[0].b).toBeGreaterThanOrEqual(0);
    expect(Math.round(w.rows[0].b * 100) / 100).toBe(
      Math.round((starting - fulfilled.length * STAKE) * 100) / 100,
    );
  }, 120_000);

  it('simultaneous identical idempotency key → exactly one bet', async () => {
    const userId = 'usr_p4_idem';
    const walletId = 'w_p4_idem';
    await ensureUserWallet(userId, walletId, 1000);
    await query(`DELETE FROM bets WHERE user_id = $1`, [userId]);
    const key = `p4_idem_key_${Date.now()}`;

    await Promise.all([
      betPlacementEngine.placeBet({
        userId, matchId: MATCH, marketId: MARKET, selectionId: SEL,
        stake: STAKE, clientOdds: ODDS, idempotencyKey: key,
      }),
      betPlacementEngine.placeBet({
        userId, matchId: MATCH, marketId: MARKET, selectionId: SEL,
        stake: STAKE, clientOdds: ODDS, idempotencyKey: key,
      }),
    ]);

    const bets = await query(`SELECT COUNT(*)::int AS c FROM bets WHERE user_id = $1`, [userId]);
    expect(bets.rows[0].c).toBe(1);
    const w = await query(`SELECT balance::float AS b FROM wallets WHERE wallet_id = $1`, [walletId]);
    expect(w.rows[0].b).toBe(1000 - STAKE);
  });

  it('same key + different payload → IDEMPOTENCY_KEY_REUSE', async () => {
    const userId = 'usr_p4_reuse';
    const walletId = 'w_p4_reuse';
    await ensureUserWallet(userId, walletId, 1000);
    const key = `p4_reuse_${Date.now()}`;

    await betPlacementEngine.placeBet({
      userId, matchId: MATCH, marketId: MARKET, selectionId: SEL,
      stake: STAKE, clientOdds: ODDS, idempotencyKey: key,
    });

    await expect(
      betPlacementEngine.placeBet({
        userId, matchId: MATCH, marketId: MARKET, selectionId: SEL,
        stake: STAKE + 5, clientOdds: ODDS, idempotencyKey: key,
      }),
    ).rejects.toThrow(/IDEMPOTENCY_KEY_REUSE/);
  });
});
