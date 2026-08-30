import test from 'node:test';
import assert from 'node:assert/strict';
import {
  issueDiscreteReward,
  lockAndValidateRewardForBet,
  consumeRewardForBet,
  reverseRewardForVoidedBet,
  adminCancelReward,
  adminExtendRewardExpiry,
} from '../../lib/discreteRewardEngine.mjs';
import { splitSettlementWinCredits } from '../../lib/walletSettlement.mjs';

// In-memory mock database runner for testing pure engine business rules and concurrency
class MockDbClient {
  constructor() {
    this.rewards = new Map();
    this.ledger = [];
  }

  async query(sql, params = []) {
    const text = sql.trim();

    if (text.startsWith('INSERT INTO user_rewards')) {
      const row = {
        reward_id: params[0],
        user_id: params[1],
        reward_type: params[2],
        amount: params[3],
        status: 'AVAILABLE',
        title: params[4],
        source: params[5],
        promotion_id: params[6],
        min_odds: params[7],
        max_odds: params[8],
        allowed_sports: params[9],
        allowed_markets: params[10],
        single_only: params[11],
        accumulator_allowed: params[12],
        returns_stake: params[13],
        allow_partial_use: params[14],
        expires_at: params[15],
        metadata: params[16] || {},
        used_bet_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.rewards.set(row.reward_id, row);
      return { rows: [{ ...row }], rowCount: 1 };
    }

    if (text.startsWith('SELECT') && text.includes('FROM user_rewards') && text.includes('FOR UPDATE')) {
      const rewardId = params[0];
      const row = this.rewards.get(rewardId);
      if (!row) return { rows: [], rowCount: 0 };
      return { rows: [{ ...row }], rowCount: 1 };
    }

    if (text.startsWith('UPDATE user_rewards') && text.includes("status = 'CONSUMED'")) {
      const betId = params[0];
      const rewardId = params[1];
      const userId = params[2];
      const row = this.rewards.get(rewardId);
      if (row && row.user_id === userId && row.status === 'AVAILABLE') {
        row.status = 'CONSUMED';
        row.used_bet_id = betId;
        row.used_at = new Date().toISOString();
        row.updated_at = new Date().toISOString();
        return { rows: [{ ...row }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (text.startsWith('UPDATE user_rewards') && text.includes("status = 'EXPIRED'")) {
      const rewardId = params[0];
      const row = this.rewards.get(rewardId);
      if (row) {
        row.status = 'EXPIRED';
        row.updated_at = new Date().toISOString();
        return { rows: [{ ...row }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (text.startsWith('UPDATE user_rewards') && text.includes("status = 'CANCELLED'")) {
      const rewardId = params[0];
      const row = this.rewards.get(rewardId);
      if (row && row.status === 'AVAILABLE') {
        row.status = 'CANCELLED';
        row.updated_at = new Date().toISOString();
        return { rows: [{ ...row }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (text.startsWith('UPDATE user_rewards') && text.includes("status = 'AVAILABLE'")) {
      const rewardId = params[0];
      const row = this.rewards.get(rewardId);
      if (row && row.status === 'CONSUMED') {
        row.status = 'AVAILABLE';
        row.used_bet_id = null;
        row.updated_at = new Date().toISOString();
        return { rows: [{ ...row }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (text.startsWith('INSERT INTO reward_ledger')) {
      const isConsumed = text.includes('REWARD_CONSUMED');
      const isIssued = text.includes('REWARD_ISSUED');
      const isExpired = text.includes('REWARD_EXPIRED');

      let entry = {
        event_id: params[0],
        reward_id: params[1],
        user_id: params[2],
        created_at: new Date().toISOString(),
      };

      if (isConsumed) {
        entry = {
          ...entry,
          bet_id: params[3],
          amount: params[4],
          event_type: 'REWARD_CONSUMED',
          previous_status: 'AVAILABLE',
          new_status: 'CONSUMED',
          notes: params[5],
        };
      } else if (isIssued) {
        entry = {
          ...entry,
          amount: params[3],
          event_type: 'REWARD_ISSUED',
          previous_status: null,
          new_status: 'AVAILABLE',
          notes: params[4],
          admin_id: params[5],
        };
      } else if (isExpired) {
        entry = {
          ...entry,
          amount: params[3],
          event_type: 'REWARD_EXPIRED',
          previous_status: 'AVAILABLE',
          new_status: 'EXPIRED',
        };
      } else {
        entry = {
          ...entry,
          amount: params[3],
          event_type: 'REWARD_LOG',
        };
      }
      this.ledger.push(entry);
      return { rows: [{ ...entry }], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  }
}

test('Discrete Reward Engine: 10/10 Hardened Security & Exact Stake Test Suite', async (t) => {
  const db = new MockDbClient();
  const USER_A = 'usr_alice_123';
  const USER_B = 'usr_bob_456';

  // Issue rewards
  const fb500 = await issueDiscreteReward({
    userId: USER_A,
    rewardType: 'freebet',
    amount: 500,
    title: 'Welcome ₹500 Free Bet',
    minOdds: 1.50,
    returnsStake: false,
    allowPartialUse: false,
    expiresAt: new Date(Date.now() + 86400000 * 7),
    client: db,
  });

  const fb1000 = await issueDiscreteReward({
    userId: USER_A,
    rewardType: 'freebet',
    amount: 1000,
    title: 'Loyalty ₹1,000 Free Bet',
    minOdds: 1.50,
    returnsStake: false,
    allowPartialUse: false,
    expiresAt: new Date(Date.now() + 86400000 * 7),
    client: db,
  });

  await t.test('Scenario 1: Reject Partial Stake for Free Bet ₹500', async () => {
    // Attempting ₹100 stake with ₹500 Free Bet
    await assert.rejects(
      async () => {
        await lockAndValidateRewardForBet({
          rewardId: fb500.reward_id,
          userId: USER_A,
          requestedStake: 100,
          combinedOdds: 2.00,
          validatedSelections: [{ sport: 'cricket', odds: 2.00 }],
          client: db,
        });
      },
      (err) => {
        assert.match(err.message, /EXACT_STAKE_REQUIRED/);
        return true;
      },
    );

    // Attempting ₹499 stake
    await assert.rejects(
      async () => {
        await lockAndValidateRewardForBet({
          rewardId: fb500.reward_id,
          userId: USER_A,
          requestedStake: 499,
          combinedOdds: 2.00,
          validatedSelections: [{ sport: 'cricket', odds: 2.00 }],
          client: db,
        });
      },
      (err) => {
        assert.match(err.message, /EXACT_STAKE_REQUIRED/);
        return true;
      },
    );
  });

  await t.test('Scenario 2: Reject Over Stake for Free Bet ₹500', async () => {
    // Attempting ₹501 stake with ₹500 Free Bet
    await assert.rejects(
      async () => {
        await lockAndValidateRewardForBet({
          rewardId: fb500.reward_id,
          userId: USER_A,
          requestedStake: 501,
          combinedOdds: 2.00,
          validatedSelections: [{ sport: 'cricket', odds: 2.00 }],
          client: db,
        });
      },
      (err) => {
        assert.match(err.message, /EXACT_STAKE_REQUIRED/);
        return true;
      },
    );
  });

  await t.test('Scenario 3: Reject Below Minimum Odds Requirement', async () => {
    // Attempting 1.30 odds when minOdds is 1.50
    await assert.rejects(
      async () => {
        await lockAndValidateRewardForBet({
          rewardId: fb500.reward_id,
          userId: USER_A,
          requestedStake: 500,
          combinedOdds: 1.30,
          validatedSelections: [{ sport: 'cricket', odds: 1.30 }],
          client: db,
        });
      },
      (err) => {
        assert.match(err.message, /REWARD_ODDS_TOO_LOW/);
        return true;
      },
    );
  });

  await t.test('Scenario 4: Accept Exact Stake and Atomically Consume Reward', async () => {
    const validated = await lockAndValidateRewardForBet({
      rewardId: fb500.reward_id,
      userId: USER_A,
      requestedStake: 500,
      combinedOdds: 2.50,
      validatedSelections: [{ sport: 'cricket', odds: 2.50 }],
      client: db,
    });

    assert.equal(validated.rewardId, fb500.reward_id);
    assert.equal(Number(validated.amount), 500);

    // Consume reward for bet
    const BET_ID = 'bet_test_500_fb';
    const consumed = await consumeRewardForBet({
      rewardId: fb500.reward_id,
      userId: USER_A,
      betId: BET_ID,
      client: db,
    });

    assert.equal(consumed.status, 'CONSUMED');
    assert.equal(consumed.used_bet_id, BET_ID);

    // Verify row in DB is now CONSUMED
    const stored = db.rewards.get(fb500.reward_id);
    assert.equal(stored.status, 'CONSUMED');
    assert.equal(stored.used_bet_id, BET_ID);

    // Verify ledger audit entry
    const ledgerEntry = db.ledger.find((l) => l.reward_id === fb500.reward_id && l.event_type === 'REWARD_CONSUMED');
    assert.ok(ledgerEntry);
    assert.equal(ledgerEntry.new_status, 'CONSUMED');
  });

  await t.test('Scenario 5: Prevent Double Spending / Reuse of Consumed Reward', async () => {
    await assert.rejects(
      async () => {
        await lockAndValidateRewardForBet({
          rewardId: fb500.reward_id,
          userId: USER_A,
          requestedStake: 500,
          combinedOdds: 2.50,
          validatedSelections: [{ sport: 'cricket', odds: 2.50 }],
          client: db,
        });
      },
      (err) => {
        assert.match(err.message, /REWARD_NOT_AVAILABLE/);
        return true;
      },
    );
  });

  await t.test('Scenario 6: Reject Unauthorized User Access', async () => {
    // User B attempts to spend User A's ₹1,000 Free Bet
    await assert.rejects(
      async () => {
        await lockAndValidateRewardForBet({
          rewardId: fb1000.reward_id,
          userId: USER_B,
          requestedStake: 1000,
          combinedOdds: 2.00,
          validatedSelections: [{ sport: 'cricket', odds: 2.00 }],
          client: db,
        });
      },
      (err) => {
        assert.match(err.message, /REWARD_UNAUTHORIZED/);
        return true;
      },
    );
  });

  await t.test('Scenario 7: Reject Expired Reward', async () => {
    const expiredReward = await issueDiscreteReward({
      userId: USER_A,
      rewardType: 'freebet',
      amount: 250,
      title: 'Expired Free Bet',
      expiresAt: new Date(Date.now() - 10000), // in the past
      client: db,
    });

    await assert.rejects(
      async () => {
        await lockAndValidateRewardForBet({
          rewardId: expiredReward.reward_id,
          userId: USER_A,
          requestedStake: 250,
          combinedOdds: 2.00,
          validatedSelections: [{ sport: 'cricket', odds: 2.00 }],
          client: db,
        });
      },
      (err) => {
        assert.match(err.message, /REWARD_EXPIRED/);
        return true;
      },
    );
  });

  await t.test('Scenario 8: Rewards are Discrete Instruments (Cannot Merge ₹500 + ₹1,000)', async () => {
    // fb1000 requires exact 1000 stake, attempting 1500 fails
    await assert.rejects(
      async () => {
        await lockAndValidateRewardForBet({
          rewardId: fb1000.reward_id,
          userId: USER_A,
          requestedStake: 1500,
          combinedOdds: 2.00,
          validatedSelections: [{ sport: 'cricket', odds: 2.00 }],
          client: db,
        });
      },
      (err) => {
        assert.match(err.message, /EXACT_STAKE_REQUIRED/);
        return true;
      },
    );
  });

  await t.test('Scenario 9: Multiple Identical Rewards Are Independent Instruments', async () => {
    const fbA = await issueDiscreteReward({
      userId: USER_A,
      rewardType: 'freebet',
      amount: 500,
      title: 'First ₹500 Free Bet',
      expiresAt: new Date(Date.now() + 86400000),
      client: db,
    });
    const fbB = await issueDiscreteReward({
      userId: USER_A,
      rewardType: 'freebet',
      amount: 500,
      title: 'Second ₹500 Free Bet',
      expiresAt: new Date(Date.now() + 86400000),
      client: db,
    });

    assert.notEqual(fbA.reward_id, fbB.reward_id);

    // Consume first
    await lockAndValidateRewardForBet({
      rewardId: fbA.reward_id,
      userId: USER_A,
      requestedStake: 500,
      combinedOdds: 2.00,
      validatedSelections: [{ sport: 'cricket', odds: 2.00 }],
      client: db,
    });
    await consumeRewardForBet({
      rewardId: fbA.reward_id,
      userId: USER_A,
      betId: 'bet_1',
      client: db,
    });

    // Second remains AVAILABLE and can be used
    const valB = await lockAndValidateRewardForBet({
      rewardId: fbB.reward_id,
      userId: USER_A,
      requestedStake: 500,
      combinedOdds: 2.00,
      validatedSelections: [{ sport: 'cricket', odds: 2.00 }],
      client: db,
    });
    assert.equal(valB.rewardId, fbB.reward_id);
  });

  await t.test('Scenario 10: Free Bet Settlement Profit Only Rule (returnsStake = false)', async () => {
    // Bet of ₹500 Free Bet with odds 2.50
    // Total Payout = 500 * 2.50 = 1250
    // Because returns_stake is false, promotional stake (500) is deducted -> 750 profit is credited to cash.
    const bet = {
      bet_id: 'bet_fb_settle_test',
      fund_source: 'freebet',
      reward_id: 'fb_123',
      returns_stake: false,
      stake: 500,
      cash_stake: 0,
      bonus_stake: 0,
      freebet_stake: 500,
    };

    const payout = 1250;
    const split = splitSettlementWinCredits(bet, payout);

    assert.equal(split.cashCredit, 750, 'Cash credited must equal profit only (₹750)');
    assert.equal(split.bonusCredit, 0);
    assert.equal(split.freebetCredit, 0);
    assert.equal(split.winningsCredit, 750);
  });
});
