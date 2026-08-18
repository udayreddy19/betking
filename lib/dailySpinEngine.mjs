import crypto from 'crypto';
import { query, withTransaction } from '../db/pg.js';
import { DAILY_SPIN_PRIZES, spinDateInKolkata, loyaltyTierFromPoints } from './dailySpinPrizes.mjs';

function prizePayload(rowOrPrize) {
  if (!rowOrPrize) return null;
  const index = Number(rowOrPrize.prize_index ?? rowOrPrize.index);
  const fromTable = DAILY_SPIN_PRIZES[index];
  return {
    index,
    type: rowOrPrize.prize_type || fromTable?.type,
    value: Number(rowOrPrize.prize_value ?? fromTable?.value) || 0,
    amount: fromTable?.amount || rowOrPrize.amount,
    subtitle: fromTable?.subtitle || rowOrPrize.subtitle,
  };
}

async function readWalletSnapshot(clientOrQuery, userId) {
  const exec = clientOrQuery.query ? clientOrQuery.query.bind(clientOrQuery) : clientOrQuery;
  const walletRes = await exec(
    `SELECT balance, bonus_balance, COALESCE(freebet_balance, 0) AS freebet_balance
     FROM wallets WHERE user_id = $1`,
    [userId],
  );
  const loyaltyRes = await exec(
    `SELECT points FROM user_loyalty WHERE user_id = $1`,
    [userId],
  );
  const wallet = walletRes.rows[0] || { balance: 0, bonus_balance: 0, freebet_balance: 0 };
  const loyaltyPoints = Number(loyaltyRes.rows[0]?.points || 0);
  return {
    balance: Number(wallet.balance || 0),
    bonusBalance: Number(wallet.bonus_balance || 0),
    freebetBalance: Number(wallet.freebet_balance || 0),
    loyaltyPoints,
  };
}

export async function getDailySpinStatus(userId) {
  const spinDate = spinDateInKolkata();
  const existing = await query(
    `SELECT prize_type, prize_value, prize_index
     FROM daily_spins WHERE user_id = $1 AND spin_date = $2`,
    [userId, spinDate],
  );
  const wallet = await readWalletSnapshot(query, userId);
  if (existing.rows.length === 0) {
    return { hasSpunToday: false, prize: null, wallet };
  }
  return { hasSpunToday: true, prize: prizePayload(existing.rows[0]), wallet };
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
      `SELECT prize_type, prize_value, prize_index
       FROM daily_spins WHERE user_id = $1 AND spin_date = $2 FOR UPDATE`,
      [userId, spinDate],
    );

    if (existing.rows.length > 0) {
      const wallet = await readWalletSnapshot(client, userId);
      return {
        success: true,
        alreadySpun: true,
        prize: prizePayload(existing.rows[0]),
        wallet,
      };
    }

    const prize = DAILY_SPIN_PRIZES[crypto.randomInt(0, DAILY_SPIN_PRIZES.length)];
    const wallet = walletRes.rows[0];
    const txId = `tx_spin_${userId}_${spinDate.replace(/-/g, '')}`;
    const spinId = `spin_${userId}_${spinDate}`;

    await client.query(
      `INSERT INTO transactions (transaction_id, user_id, type, method, amount, status)
       VALUES ($1, $2, 'BONUS_CLAIM', 'DAILY_SPIN', $3, 'COMPLETED')`,
      [txId, userId, prize.value],
    );

    if (prize.type === 'bonus') {
      const nextBonus = Number(wallet.bonus_balance || 0) + prize.value;
      await client.query(
        `UPDATE wallets SET bonus_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
        [nextBonus, wallet.wallet_id],
      );
      await client.query(
        `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
         VALUES ($1, $2, 'CREDIT', $3, $4, $5)`,
        [wallet.wallet_id, txId, prize.value, nextBonus, `Daily spin bonus · ${prize.amount}`],
      );
    } else if (prize.type === 'freebet') {
      const nextFreebet = Number(wallet.freebet_balance || 0) + prize.value;
      await client.query(
        `UPDATE wallets SET freebet_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
        [nextFreebet, wallet.wallet_id],
      );
      await client.query(
        `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
         VALUES ($1, $2, 'CREDIT', $3, $4, $5)`,
        [wallet.wallet_id, txId, prize.value, nextFreebet, `Daily spin freebet · ${prize.amount}`],
      );
    } else {
      const loyaltyRes = await client.query(
        `SELECT points FROM user_loyalty WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      const nextPoints = Number(loyaltyRes.rows[0]?.points || 0) + prize.value;
      const tier = loyaltyTierFromPoints(nextPoints);
      await client.query(
        `INSERT INTO user_loyalty (user_id, points, tier, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id) DO UPDATE SET
           points = EXCLUDED.points,
           tier = EXCLUDED.tier,
           updated_at = CURRENT_TIMESTAMP`,
        [userId, nextPoints, tier],
      );
    }

    await client.query(
      `INSERT INTO daily_spins (spin_id, user_id, spin_date, prize_type, prize_value, prize_index)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [spinId, userId, spinDate, prize.type, prize.value, prize.index],
    );

    const snapshot = await readWalletSnapshot(client, userId);
    return {
      success: true,
      alreadySpun: false,
      prize: prizePayload(prize),
      wallet: snapshot,
    };
  });
}
