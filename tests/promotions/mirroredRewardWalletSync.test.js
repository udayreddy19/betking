import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { query, withTransaction } from '../../db/pg.js';
import {
  issueDiscreteReward,
  consumeMatchingDiscreteRewardsForWalletSpend,
  reconcileUnfundedMirroredRewards,
  listUserAvailableRewards,
  listUserAllRewards,
} from '../../lib/discreteRewardEngine.mjs';

describe('mirrored freebet/bonus wallet sync', () => {
  const userId = `usr_mirror_sync_${Date.now()}`;
  const walletId = `wal_${userId}`;

  beforeAll(async () => {
    await query(
      `INSERT INTO users (user_id, email, password_hash, status)
       VALUES ($1, $2, 'hash', 'ACTIVE')
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, `${userId}@example.com`],
    );
    await query(
      `INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, freebet_balance, currency)
       VALUES ($1, $2, 0, 0, 500, 'INR')
       ON CONFLICT (wallet_id) DO UPDATE
       SET freebet_balance = 500, bonus_balance = 0`,
      [walletId, userId],
    );
  });

  afterAll(async () => {
    await query(`DELETE FROM reward_ledger WHERE user_id = $1`, [userId]).catch(() => {});
    await query(`DELETE FROM user_rewards WHERE user_id = $1`, [userId]).catch(() => {});
    await query(`DELETE FROM wallets WHERE user_id = $1`, [userId]).catch(() => {});
    await query(`DELETE FROM users WHERE user_id = $1`, [userId]).catch(() => {});
  });

  it('consumes discrete freebet when wallet freebet is spent without rewardId', async () => {
    const issued = await issueDiscreteReward({
      userId,
      rewardType: 'freebet',
      amount: 500,
      title: 'Daily Spin Free Bet',
      source: 'DAILY_SPIN',
      creditWallet: false,
      metadata: { walletMirrored: true },
      expiryDays: 1,
    });

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE wallets SET freebet_balance = 0 WHERE user_id = $1`,
        [userId],
      );
      const consumed = await consumeMatchingDiscreteRewardsForWalletSpend({
        userId,
        rewardType: 'freebet',
        amount: 500,
        betId: 'bet_mirror_test_1',
        client,
      });
      expect(consumed).toHaveLength(1);
      expect(consumed[0].rewardId).toBe(issued.reward_id || issued.rewardId);
    });

    const row = await query(
      `SELECT status, used_bet_id FROM user_rewards WHERE reward_id = $1`,
      [issued.reward_id || issued.rewardId],
    );
    expect(row.rows[0].status).toBe('CONSUMED');
    expect(row.rows[0].used_bet_id).toBe('bet_mirror_test_1');
  });

  it('reconciles stale AVAILABLE freebet when wallet bucket is empty', async () => {
    await query(`UPDATE wallets SET freebet_balance = 500 WHERE user_id = $1`, [userId]);
    const issued = await issueDiscreteReward({
      userId,
      rewardType: 'freebet',
      amount: 500,
      title: 'Stale Spin Free Bet',
      source: 'DAILY_SPIN',
      creditWallet: false,
      metadata: { walletMirrored: true },
      expiryDays: 1,
    });
    await query(`UPDATE wallets SET freebet_balance = 0 WHERE user_id = $1`, [userId]);

    const healed = await reconcileUnfundedMirroredRewards(userId);
    expect(healed.freebet).toBeGreaterThanOrEqual(1);

    const available = await listUserAvailableRewards(userId);
    expect(available.find((r) => r.rewardId === (issued.reward_id || issued.rewardId))).toBeUndefined();

    const all = await listUserAllRewards(userId);
    expect(all.available).toHaveLength(0);
    const stale = all.rewards.find((r) => r.rewardId === (issued.reward_id || issued.rewardId));
    expect(stale?.status).toBe('CONSUMED');
  });
});
