import test from 'node:test';
import assert from 'node:assert/strict';
import { query, withTransaction } from '../db/pg.js';
import { betPlacementEngine } from '../lib/betPlacementEngine.mjs';
import { betSettlementEngine } from '../lib/betSettlementEngine.mjs';
import { depositEngine } from '../lib/depositEngine.mjs';
import { BONUS_MIN_BET_ODDS } from '../lib/promoRules.mjs';
import { MIN_DEPOSIT_INR } from '../lib/vipBenefits.mjs';

test('PRODUCTION-LEVEL COMPLETE BETTING LIFECYCLE AUDIT', async (t) => {
  const testUserId = `usr_audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const testEmail = `${testUserId}@example.com`;

  // Setup test user & wallet
  await query(
    `INSERT INTO users (user_id, email, role, status, created_at)
     VALUES ($1, $2, 'USER', 'ACTIVE', NOW())
     ON CONFLICT (user_id) DO NOTHING`,
    [testUserId, testEmail]
  );

  const walletRes = await query(
    `INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, freebet_balance, locked_deposit_balance, winnings_balance, currency)
     VALUES ($1, $2, 1000.00, 900.00, 500.00, 200.00, 0.00, 'INR')
     ON CONFLICT (user_id) DO UPDATE SET balance = 1000.00, bonus_balance = 900.00, freebet_balance = 500.00, locked_deposit_balance = 200.00
     RETURNING *`,
    [`wal_${testUserId}`, testUserId]
  );

  const matchId = `match_audit_${Date.now()}`;
  const marketId = `mkt_audit_${Date.now()}`;
  const sel1 = 'sel_team1';
  const sel2 = 'sel_team2';
  const selFav = 'sel_heavy_fav';

  await query(
    `INSERT INTO matches (match_id, competition_id, team1_id, team2_id, status, live_score1, live_score2)
     VALUES ($1, 'Audit League', 'Team Alpha', 'Team Beta', 'LIVE', '100', '150')
     ON CONFLICT (match_id) DO NOTHING`,
    [matchId]
  );

  await query(
    `INSERT INTO markets (market_id, match_id, name, status)
     VALUES ($1, $2, 'Match Winner', 'OPEN')
     ON CONFLICT (market_id) DO UPDATE SET status = 'OPEN'`,
    [marketId, matchId]
  );

  await query(
    `INSERT INTO selections (selection_id, market_id, name, odds, status)
     VALUES ($1, $2, 'Team Alpha', 2.50, 'OPEN'),
            ($3, $2, 'Team Beta', 2.00, 'OPEN'),
            ($4, $2, 'Heavy Favorite', 1.20, 'OPEN')
     ON CONFLICT (selection_id) DO UPDATE SET status = 'OPEN'`,
    [sel1, marketId, sel2, selFav]
  );

  await t.test('1. Minimum Deposit Rules Enforcement (₹1,000)', async () => {
    assert.strictEqual(MIN_DEPOSIT_INR, 1000, 'MIN_DEPOSIT_INR constant must equal 1000');

    // Test rejection of under-minimum deposit in depositEngine
    await assert.rejects(
      async () => {
        await depositEngine.createOrder({
          userId: testUserId,
          amount: 500,
          provider: 'CASHFREE',
        });
      },
      (err) => err.message.includes('Minimum deposit amount is ₹1,000') || err.message.includes('MIN_DEPOSIT'),
      'Deposit under ₹1,000 must be rejected'
    );
  });

  await t.test('2. Cash Bet Placement, Deduction & Gross Win Settlement', async () => {
    const stake = 200;
    const odds = 2.50;

    const placeResult = await betPlacementEngine.placeBet({
      userId: testUserId,
      matchId,
      marketId,
      selectionId: sel1,
      selectionName: 'Team Alpha',
      stake,
      clientOdds: odds,
      fundSource: 'cash',
      idempotencyKey: `idemp_cash_win_${Date.now()}`,
    });

    assert.ok(placeResult.success, 'Bet placement must succeed');
    const betId = placeResult.betId;

    // Check wallet balance after placement
    const wAfterPlace = (await query(`SELECT balance, locked_deposit_balance FROM wallets WHERE user_id = $1`, [testUserId])).rows[0];
    assert.strictEqual(Number(wAfterPlace.balance), 800, 'Cash balance must be debited by 200 (1000 -> 800)');
    assert.strictEqual(Number(wAfterPlace.locked_deposit_balance), 0, 'Locked deposit must be used first in waterfall deduction (200 -> 0)');

    // Settle Bet as WON
    const settleResult = await betSettlementEngine.settleSingleBet({
      betId,
      matchState: {
        __bypassAuth: true,
        status: 'COMPLETED',
        winner: '1',
        __forcedOutcome: 'WON',
      },
    });

    assert.strictEqual(settleResult.outcome, 'WON', 'Settlement must succeed as WON');

    // Verify wallet credited with Gross Payout (₹500)
    const wAfterWin = (await query(`SELECT balance, winnings_balance FROM wallets WHERE user_id = $1`, [testUserId])).rows[0];
    assert.strictEqual(Number(wAfterWin.balance), 1300, 'Cash balance must equal 800 + 500 = 1300');
    assert.strictEqual(Number(wAfterWin.winnings_balance), 300, 'Net winnings must record 500 - 200 = 300');

    // Verify settlement idempotency (calling settleSingleBet again does nothing)
    const secondSettle = await betSettlementEngine.settleSingleBet({
      betId,
      matchState: {
        __bypassAuth: true,
        status: 'COMPLETED',
        winner: '1',
        __forcedOutcome: 'WON',
      },
    });
    assert.strictEqual(secondSettle.status, 'ALREADY_SETTLED', 'Second settlement must be marked as already settled');

    const wAfterDuplicate = (await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId])).rows[0];
    assert.strictEqual(Number(wAfterDuplicate.balance), 1300, 'Balance must remain exactly 1300 without duplicate credit');
  });

  await t.test('3. Bonus Bet Full-Usage & Minimum Odds Enforcement', async () => {
    // 3A. Reject partial bonus bet
    await assert.rejects(
      async () => {
        await betPlacementEngine.placeBet({
          userId: testUserId,
          matchId,
          marketId,
          selectionId: sel1,
          selectionName: 'Team Alpha',
          stake: 500, // Available bonus is 900
          clientOdds: 2.00,
          fundSource: 'bonus',
          idempotencyKey: `idemp_partial_bonus_${Date.now()}`,
        });
      },
      (err) => err.message.includes('must be used in full') || err.message.includes('PROMO_STAKE_MUST_BE_EXACT'),
      'Partial bonus bet must be rejected'
    );

    // 3B. Reject bonus bet under minimum odds (e.g. 1.20 < 1.40/1.75)
    await assert.rejects(
      async () => {
        await betPlacementEngine.placeBet({
          userId: testUserId,
          matchId,
          marketId,
          selectionId: selFav,
          selectionName: 'Heavy Favorite',
          stake: 900,
          clientOdds: 1.20,
          fundSource: 'bonus',
          idempotencyKey: `idemp_low_odds_bonus_${Date.now()}`,
        });
      },
      (err) => err.message.includes('BONUS_ODDS_GATE') || err.message.includes('1.75') || err.message.includes('1.40'),
      'Bonus bet on odds < threshold must be rejected'
    );

    // 3C. Place full bonus bet (₹900 @ 2.00)
    const bonusPlace = await betPlacementEngine.placeBet({
      userId: testUserId,
      matchId,
      marketId,
      selectionId: sel2,
      selectionName: 'Team Beta',
      stake: 900,
      clientOdds: 2.00,
      fundSource: 'bonus',
      idempotencyKey: `idemp_valid_bonus_${Date.now()}`,
    });

    assert.ok(bonusPlace.success, 'Valid full bonus bet must succeed');
    const bonusBetId = bonusPlace.betId;

    // Verify bonus balance debited to 0
    const wBonusAfter = (await query(`SELECT bonus_balance FROM wallets WHERE user_id = $1`, [testUserId])).rows[0];
    assert.strictEqual(Number(wBonusAfter.bonus_balance), 0, 'Bonus balance must be 0 after ₹900 bet');

    // Settle as VOID -> Bonus must be returned to bonus_balance
    const voidSettle = await betSettlementEngine.settleSingleBet({
      betId: bonusBetId,
      matchState: {
        __bypassAuth: true,
        status: 'COMPLETED',
        isCancelled: true,
        __forcedOutcome: 'VOID',
      },
    });

    assert.strictEqual(voidSettle.outcome, 'VOID');
    const wBonusRestored = (await query(`SELECT bonus_balance FROM wallets WHERE user_id = $1`, [testUserId])).rows[0];
    assert.strictEqual(Number(wBonusRestored.bonus_balance), 900, 'Bonus balance must be restored to 900 on VOID');
  });

  await t.test('4. Free Bet Full-Usage & Profit-Only Settlement', async () => {
    // 4A. Reject partial free bet
    await assert.rejects(
      async () => {
        await betPlacementEngine.placeBet({
          userId: testUserId,
          matchId,
          marketId,
          selectionId: sel1,
          selectionName: 'Team Alpha',
          stake: 200, // Available freebet is 500
          clientOdds: 2.00,
          fundSource: 'freebet',
          idempotencyKey: `idemp_partial_freebet_${Date.now()}`,
        });
      },
      (err) => err.message.includes('must be used in full') || err.message.includes('PROMO_STAKE_MUST_BE_EXACT'),
      'Partial free bet must be rejected'
    );

    // 4B. Place valid full free bet (₹500 @ 2.50)
    const freebetPlace = await betPlacementEngine.placeBet({
      userId: testUserId,
      matchId,
      marketId,
      selectionId: sel1,
      selectionName: 'Team Alpha',
      stake: 500,
      clientOdds: 2.50,
      fundSource: 'freebet',
      idempotencyKey: `idemp_valid_freebet_${Date.now()}`,
    });

    assert.ok(freebetPlace.success, 'Valid full free bet must succeed');
    const freebetBetId = freebetPlace.betId;

    const wFreebetAfter = (await query(`SELECT freebet_balance, balance FROM wallets WHERE user_id = $1`, [testUserId])).rows[0];
    assert.strictEqual(Number(wFreebetAfter.freebet_balance), 0, 'Free bet balance must be 0 after placement');
    const balanceBeforeWin = Number(wFreebetAfter.balance);

    // Settle as WON: Profit only = 500 * (2.50 - 1) = ₹750 cash credit
    const settleFreebet = await betSettlementEngine.settleSingleBet({
      betId: freebetBetId,
      matchState: {
        __bypassAuth: true,
        status: 'COMPLETED',
        winner: '1',
        __forcedOutcome: 'WON',
      },
    });

    assert.strictEqual(settleFreebet.outcome, 'WON');
    const wFreebetWin = (await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId])).rows[0];
    assert.strictEqual(Number(wFreebetWin.balance), balanceBeforeWin + 750, 'Free bet win must credit net profit of ₹750');
  });

  await t.test('5. Concurrency & Double-Spend Protection', async () => {
    // Current user cash balance is 1300 + 750 = 2050.
    // Attempt two simultaneous ₹1500 bets (Total ₹3000 needed > ₹2050 available)
    const [res1, res2] = await Promise.allSettled([
      betPlacementEngine.placeBet({
        userId: testUserId,
        matchId,
        marketId,
        selectionId: sel1,
        selectionName: 'Team Alpha',
        stake: 1500,
        clientOdds: 2.50,
        fundSource: 'cash',
        idempotencyKey: `idemp_race_1_${Date.now()}`,
      }),
      betPlacementEngine.placeBet({
        userId: testUserId,
        matchId,
        marketId,
        selectionId: sel2,
        selectionName: 'Team Beta',
        stake: 1500,
        clientOdds: 2.00,
        fundSource: 'cash',
        idempotencyKey: `idemp_race_2_${Date.now()}`,
      }),
    ]);

    const successes = [res1, res2].filter((r) => r.status === 'fulfilled' && r.value?.success);
    const failures = [res1, res2].filter((r) => r.status === 'rejected' || !r.value?.success);

    assert.strictEqual(successes.length, 1, 'Exactly ONE concurrent bet must succeed');
    assert.strictEqual(failures.length, 1, 'The other concurrent bet must be rejected for insufficient funds');

    // Final balance check: 2050 - 1500 = 550
    const wFinal = (await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId])).rows[0];
    assert.strictEqual(Number(wFinal.balance), 550, 'Balance must accurately reflect exactly one deduction');
  });

  // Cleanup test user
  await query(`DELETE FROM bets WHERE user_id = $1`, [testUserId]);
  await query(`DELETE FROM wallets WHERE user_id = $1`, [testUserId]);
  await query(`DELETE FROM users WHERE user_id = $1`, [testUserId]);
});
