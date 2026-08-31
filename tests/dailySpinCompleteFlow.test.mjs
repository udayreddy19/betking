import test from 'node:test';
import assert from 'node:assert/strict';
import { query, withTransaction } from '../db/pg.js';
import { claimDailySpin, getDailySpinStatus } from '../lib/dailySpinEngine.mjs';
import { getMe } from '../server/auth/authService.js';
import { validatePromoBetStake } from '../lib/walletPromoRules.mjs';
import { listUserAllRewards } from '../lib/discreteRewardEngine.mjs';

test('Daily Spin Complete Flow — Claim, Wallet Credit, Idempotency & Promotion Rules', async (t) => {
  const testUserId = `test_spin_user_${Date.now()}`;
  const testEmail = `spin_test_${Date.now()}@example.com`;

  // Setup test user & wallet
  await query(`INSERT INTO users (user_id, email, password_hash, status) VALUES ($1, $2, 'hash', 'ACTIVE')`, [testUserId, testEmail]);
  await query(`INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, freebet_balance) VALUES ($1, $2, 0.00, 0.00, 0.00)`, [`w_${testUserId}`, testUserId]);
  await query(`INSERT INTO user_loyalty (user_id, points, tier) VALUES ($1, 0, 'BRONZE')`, [testUserId]);

  try {
    // 1. Initial State
    const initialStatus = await getDailySpinStatus(testUserId);
    assert.equal(initialStatus.hasSpunToday, false, 'User must not have spun initially');
    assert.equal(initialStatus.wallet.bonusBalance, 0);
    assert.equal(initialStatus.wallet.freebetBalance, 0);

    // 2. Claim Daily Spin
    const spinResult = await claimDailySpin(testUserId);
    assert.equal(spinResult.success, true, 'Daily spin claim must succeed');
    assert.equal(spinResult.alreadySpun, false, 'First spin of the day must not be flagged alreadySpun');
    assert.ok(spinResult.prize, 'Prize must be returned');
    assert.ok(spinResult.prize.value > 0, 'Prize value must be > 0');

    // 3. Verify getMe (authoritative wallet API)
    const meRes = await getMe(query, testUserId);
    assert.equal(meRes.success, true, 'getMe must return success');
    const user = meRes.user;

    if (spinResult.prize.type === 'bonus') {
      assert.equal(user.bonusBalance, spinResult.prize.value, 'Bonus balance must be credited in getMe');
    } else if (spinResult.prize.type === 'freebet') {
      assert.equal(user.freebetBalance, spinResult.prize.value, 'Freebet balance must be credited in getMe');
    }

    // 4. Verify Discrete Reward is created
    if (['bonus', 'freebet'].includes(spinResult.prize.type)) {
      const rewardsList = await listUserAllRewards(testUserId);
      assert.ok(rewardsList.available.length >= 1, 'Discrete reward voucher must be available in user_rewards');
      const dailyReward = rewardsList.available.find((r) => r.source === 'DAILY_SPIN');
      assert.ok(dailyReward, 'Daily spin reward must exist in user_rewards');
      assert.equal(dailyReward.amount, spinResult.prize.value);
      assert.equal(dailyReward.status, 'AVAILABLE');
    }

    // 5. Idempotency Protection: Duplicate Spin must be rejected
    const duplicateSpin = await claimDailySpin(testUserId);
    assert.equal(duplicateSpin.success, true);
    assert.equal(duplicateSpin.alreadySpun, true, 'Duplicate spin on same day must be flagged alreadySpun');
    assert.equal(duplicateSpin.prize.index, spinResult.prize.index, 'Duplicate spin must return the original prize');

    // 6. Verify Exact Stake Rule on Won Reward
    if (['bonus', 'freebet'].includes(spinResult.prize.type)) {
      const prizeVal = spinResult.prize.value;
      // Partial use must be rejected
      await assert.rejects(
        () => validatePromoBetStake({ fundSource: spinResult.prize.type, requestedStake: Math.floor(prizeVal / 2), availableBalance: prizeVal }),
        /FULL_PROMO_AMOUNT_REQUIRED/,
        'Partial usage of daily spin reward must be rejected'
      );

      // Exact stake must be allowed
      await assert.doesNotReject(
        () => validatePromoBetStake({ fundSource: spinResult.prize.type, requestedStake: prizeVal, availableBalance: prizeVal }),
        'Full exact stake of daily spin reward must be allowed'
      );
    }

    console.log('✅ ALL DAILY SPIN COMPLETE FLOW ASSERTIONS PASSED!');
  } finally {
    // Cleanup test data
    await query(`DELETE FROM spin_wallet_grants WHERE user_id = $1`, [testUserId]).catch(() => {});
    await query(`DELETE FROM user_rewards WHERE user_id = $1`, [testUserId]).catch(() => {});
    await query(`DELETE FROM daily_spins WHERE user_id = $1`, [testUserId]).catch(() => {});
    await query(`DELETE FROM ledger_entries WHERE wallet_id = $1`, [`w_${testUserId}`]).catch(() => {});
    await query(`DELETE FROM transactions WHERE user_id = $1`, [testUserId]).catch(() => {});
    await query(`DELETE FROM user_loyalty WHERE user_id = $1`, [testUserId]).catch(() => {});
    await query(`DELETE FROM wallets WHERE user_id = $1`, [testUserId]).catch(() => {});
    await query(`DELETE FROM users WHERE user_id = $1`, [testUserId]).catch(() => {});
  }
});
