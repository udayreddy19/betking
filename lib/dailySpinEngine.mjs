import crypto from 'crypto';
import { query, withTransaction } from '../db/pg.js';
import { DAILY_SPIN_PRIZES, spinDateInKolkata, SPIN_PRIZE_TTL_MS } from './dailySpinPrizes.mjs';
import { scaleSpinPrize } from './vipBenefits.mjs';
import { addSpinLoyaltyPoints } from './loyaltyPointsStore.mjs';
import {
  createSpinGrant,
  expireSpinGrants,
  getActiveSpinGrantSummary,
  spinPrizeExpiresAt,
} from './spinGrantEngine.mjs';

function prizePayload(rowOrPrize) {
  if (!rowOrPrize) return null;
  const index = Number(rowOrPrize.prize_index ?? rowOrPrize.index);
  const fromTable = DAILY_SPIN_PRIZES[index];
  const expiresAt = rowOrPrize.prize_expires_at || rowOrPrize.expiresAt || null;
  const expiresMs = expiresAt ? new Date(expiresAt).getTime() : null;
  const expired = expiresMs != null && expiresMs <= Date.now()
    && ['bonus', 'freebet'].includes(rowOrPrize.prize_type || fromTable?.type);
  return {
    index,
    type: rowOrPrize.prize_type || fromTable?.type,
    value: Number(rowOrPrize.prize_value ?? fromTable?.value) || 0,
    amount: fromTable?.amount || rowOrPrize.amount,
    subtitle: fromTable?.subtitle || rowOrPrize.subtitle,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    expiresInMs: expiresMs != null ? Math.max(0, expiresMs - Date.now()) : null,
    expired,
    useWithinHours: SPIN_PRIZE_TTL_MS / (60 * 60 * 1000),
  };
}

async function readWalletSnapshot(clientOrQuery, userId) {
  const exec = clientOrQuery.query ? clientOrQuery : clientOrQuery;
  await expireSpinGrants(exec, userId);
  const q = exec.query ? exec.query.bind(exec) : exec;
  const walletRes = await q(
    `SELECT balance, bonus_balance, COALESCE(freebet_balance, 0) AS freebet_balance
     FROM wallets WHERE user_id = $1`,
    [userId],
  );
  const loyaltyRes = await q(
    `SELECT points, COALESCE(vip_points, points) AS vip_points FROM user_loyalty WHERE user_id = $1`,
    [userId],
  );
  const wallet = walletRes.rows[0] || { balance: 0, bonus_balance: 0, freebet_balance: 0 };
  const loyaltyPoints = Number(loyaltyRes.rows[0]?.points || 0);
  const vipPoints = Number(loyaltyRes.rows[0]?.vip_points || loyaltyPoints);
  return {
    balance: Number(wallet.balance || 0),
    bonusBalance: Number(wallet.bonus_balance || 0),
    freebetBalance: Number(wallet.freebet_balance || 0),
    loyaltyPoints,
    vipPoints,
  };
}

export async function getDailySpinStatus(userId) {
  const spinDate = spinDateInKolkata();
  await expireSpinGrants(query, userId);
  const existing = await query(
    `SELECT prize_type, prize_value, prize_index, prize_expires_at
     FROM daily_spins WHERE user_id = $1 AND spin_date = $2`,
    [userId, spinDate],
  );
  const wallet = await readWalletSnapshot(query, userId);
  const spinGrants = await getActiveSpinGrantSummary(query, userId);
  if (existing.rows.length === 0) {
    return { hasSpunToday: false, prize: null, wallet, spinGrants, prizeTtlHours: SPIN_PRIZE_TTL_MS / (60 * 60 * 1000) };
  }
  return {
    hasSpunToday: true,
    prize: prizePayload(existing.rows[0]),
    wallet,
    spinGrants,
    prizeTtlHours: SPIN_PRIZE_TTL_MS / (60 * 60 * 1000),
  };
}

export async function claimDailySpin(userId) {
  const spinDate = spinDateInKolkata();

  return withTransaction(async (client) => {
    const walletRes = await client.query(
      `SELECT wallet_id, balance, bonus_balance, COALESCE(freebet_balance, 0) AS freebet_balance
       FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );

    if (walletRes.rows.length === 0) {
      throw Object.assign(new Error('WALLET_NOT_FOUND'), { code: 'WALLET_NOT_FOUND', status: 400 });
    }

    const existing = await client.query(
      `SELECT prize_type, prize_value, prize_index, prize_expires_at
       FROM daily_spins WHERE user_id = $1 AND spin_date = $2 FOR UPDATE`,
      [userId, spinDate],
    );

    if (existing.rows.length > 0) {
      const wallet = await readWalletSnapshot(client, userId);
      const spinGrants = await getActiveSpinGrantSummary(client, userId);
      return {
        success: true,
        alreadySpun: true,
        prize: prizePayload(existing.rows[0]),
        wallet,
        spinGrants,
        prizeTtlHours: SPIN_PRIZE_TTL_MS / (60 * 60 * 1000),
      };
    }

    const prize = DAILY_SPIN_PRIZES[crypto.randomInt(0, DAILY_SPIN_PRIZES.length)];
    const loyaltyNow = await client.query(`SELECT points, tier FROM user_loyalty WHERE user_id = $1 FOR UPDATE`, [userId]);
    const previousTier = loyaltyNow.rows[0]?.tier || 'BRONZE';
    const scaledValue = scaleSpinPrize(prize.value, previousTier);
    const wallet = walletRes.rows[0];
    const txId = `tx_spin_${userId}_${spinDate.replace(/-/g, '')}`;
    const spinId = `spin_${userId}_${spinDate}`;
    const prizeExpiresAt = spinPrizeExpiresAt();

    await client.query(
      `INSERT INTO transactions (transaction_id, user_id, type, method, amount, status)
       VALUES ($1, $2, 'BONUS_CLAIM', 'DAILY_SPIN', $3, 'COMPLETED')`,
      [txId, userId, scaledValue],
    );

    if (prize.type === 'bonus') {
      const nextBonus = Number(wallet.bonus_balance || 0) + scaledValue;
      await client.query(
        `UPDATE wallets SET bonus_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
        [nextBonus, wallet.wallet_id],
      );
      await client.query(
        `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
         VALUES ($1, $2, 'CREDIT', $3, $4, $5)`,
        [wallet.wallet_id, txId, scaledValue, nextBonus, `Daily spin bonus · ${prize.amount} · use within 24h`],
      );
    } else if (prize.type === 'freebet') {
      const nextFreebet = Number(wallet.freebet_balance || 0) + scaledValue;
      await client.query(
        `UPDATE wallets SET freebet_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
        [nextFreebet, wallet.wallet_id],
      );
      await client.query(
        `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
         VALUES ($1, $2, 'CREDIT', $3, $4, $5)`,
        [wallet.wallet_id, txId, scaledValue, nextFreebet, `Daily spin freebet · ${prize.amount} · use within 24h`],
      );
    } else {
      await addSpinLoyaltyPoints(client, userId, scaledValue);
    }

    await client.query(
      `INSERT INTO daily_spins (spin_id, user_id, spin_date, prize_type, prize_value, prize_index, prize_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [spinId, userId, spinDate, prize.type, scaledValue, prize.index, prizeExpiresAt],
    );

    if (prize.type === 'bonus' || prize.type === 'freebet') {
      await createSpinGrant(client, {
        userId,
        spinId,
        grantType: prize.type,
        amount: scaledValue,
        expiresAt: prizeExpiresAt,
      });

      try {
        const { issueDiscreteReward } = await import('./discreteRewardEngine.mjs');
        await issueDiscreteReward({
          userId,
          rewardType: prize.type,
          amount: scaledValue,
          title: `Daily Spin ${prize.type === 'freebet' ? 'Free Bet' : 'Bonus'}`,
          source: 'DAILY_SPIN',
          allowPartialUse: false,
          expiresAt: prizeExpiresAt,
          client,
        });
      } catch (rewardErr) {
        console.warn('[DailySpin] Non-fatal discrete reward sync warning:', rewardErr.message);
      }
    }

    const snapshot = await readWalletSnapshot(client, userId);
    const spinGrants = await getActiveSpinGrantSummary(client, userId);
    return {
      success: true,
      alreadySpun: false,
      prize: prizePayload({
        ...prize,
        prize_value: scaledValue,
        value: scaledValue,
        prize_expires_at: prizeExpiresAt,
      }),
      wallet: snapshot,
      spinGrants,
      prizeTtlHours: SPIN_PRIZE_TTL_MS / (60 * 60 * 1000),
    };
  });
}
