/**
 * VIP status, catalog, and daily cashback for OddsYra.
 */

import crypto from 'crypto';
import { query, withTransaction } from '../db/pg.js';
import { loyaltyTierFromPoints } from './dailySpinPrizes.mjs';
import { spinDateInKolkata } from './dailySpinPrizes.mjs';
import {
  crossedVipTiers,
  getBenefitsForTier,
  isVipClubTier,
} from './vipBenefits.mjs';

export { getVipBenefitsCatalog } from './vipBenefits.mjs';

function previousKolkataDate(now = new Date()) {
  const today = spinDateInKolkata(now);
  const noonIst = new Date(`${today}T12:00:00+05:30`);
  noonIst.setDate(noonIst.getDate() - 1);
  return spinDateInKolkata(noonIst);
}

function kolkataMonthKey(now = new Date()) {
  return spinDateInKolkata(now).slice(0, 7);
}

async function creditWalletPerk(client, {
  userId,
  amount,
  rewardType,
  txType,
  method,
  description,
}) {
  const walletRes = await client.query(
    `SELECT wallet_id, balance, COALESCE(bonus_balance, 0) AS bonus_balance,
            COALESCE(freebet_balance, 0) AS freebet_balance
     FROM wallets WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  if (walletRes.rows.length === 0) {
    throw Object.assign(new Error('Wallet not found.'), { code: 'WALLET_NOT_FOUND', status: 400 });
  }
  const wallet = walletRes.rows[0];
  const value = Number(amount) || 0;
  let nextBalance = Number(wallet.balance || 0);
  let nextBonus = Number(wallet.bonus_balance || 0);
  let nextFreebet = Number(wallet.freebet_balance || 0);
  let ledgerAfter = nextBalance;

  if (rewardType === 'cash') {
    nextBalance = Number((nextBalance + value).toFixed(2));
    ledgerAfter = nextBalance;
    await client.query(
      `UPDATE wallets SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
      [nextBalance, wallet.wallet_id],
    );
  } else if (rewardType === 'freebet') {
    nextFreebet = Number((nextFreebet + value).toFixed(2));
    ledgerAfter = nextFreebet;
    await client.query(
      `UPDATE wallets SET freebet_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
      [nextFreebet, wallet.wallet_id],
    );
  } else {
    nextBonus = Number((nextBonus + value).toFixed(2));
    ledgerAfter = nextBonus;
    await client.query(
      `UPDATE wallets SET bonus_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
      [nextBonus, wallet.wallet_id],
    );
  }

  const txId = `tx_${crypto.randomBytes(8).toString('hex')}`;
  await client.query(
    `INSERT INTO transactions (transaction_id, user_id, type, method, amount, status)
     VALUES ($1, $2, $3, $4, $5, 'COMPLETED')`,
    [txId, userId, txType, method, value],
  );
  await client.query(
    `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
     VALUES ($1, $2, 'CREDIT', $3, $4, $5)`,
    [wallet.wallet_id, txId, value, ledgerAfter, description],
  );

  return {
    balance: nextBalance,
    bonusBalance: nextBonus,
    freebetBalance: nextFreebet,
  };
}

export async function grantCrossedTierRewards(exec, userId, fromTier, toTier) {
  const crossed = crossedVipTiers(fromTier, toTier);
  if (!crossed.length) return [];
  const run = async (client) => {
    const granted = [];
    for (const tier of crossed) {
      const reward = getBenefitsForTier(tier).tierUpReward;
      if (!reward?.amount) continue;
      const claimId = `tu_${crypto.randomBytes(8).toString('hex')}`;
      try {
        await client.query(
          `INSERT INTO vip_perk_claims (id, user_id, perk_kind, perk_key, reward_type, amount)
           VALUES ($1, $2, 'TIER_UP', $3, $4, $5)`,
          [claimId, userId, tier, reward.type, reward.amount],
        );
      } catch (err) {
        if (err.code === '23505') continue;
        if (err.code === '42P01') return granted;
        throw err;
      }
      const wallet = await creditWalletPerk(client, {
        userId,
        amount: reward.amount,
        rewardType: reward.type,
        txType: 'VIP_TIER_UP',
        method: 'VIP',
        description: `VIP ${tier} tier-up ${reward.type} ₹${reward.amount}`,
      });
      granted.push({ tier, ...reward, wallet });
    }
    return granted;
  };
  if (exec && typeof exec.query === 'function') return run(exec);
  return withTransaction(run);
}

export async function getUserVipStatus(userId) {
  const res = await query(
    `SELECT points, tier FROM user_loyalty WHERE user_id = $1`,
    [userId],
  );
  const points = Number(res.rows[0]?.points || 0);
  const tier = res.rows[0]?.tier || loyaltyTierFromPoints(points);
  const benefits = getBenefitsForTier(tier);
  const monthKey = kolkataMonthKey();
  let monthlyClaimed = false;
  try {
    if (benefits.monthlyReward?.amount) {
      const monthlyClaim = await query(
        `SELECT amount FROM vip_perk_claims
         WHERE user_id = $1 AND perk_kind = 'MONTHLY' AND perk_key = $2`,
        [userId, monthKey],
      );
      monthlyClaimed = monthlyClaim.rows.length > 0;
    }
  } catch {
    monthlyClaimed = false;
  }
  return {
    success: true,
    userId,
    points,
    isVip: isVipClubTier(tier),
    monthlyPeriod: monthKey,
    monthlyClaimed,
    ...benefits,
  };
}

export async function evaluateUserVipTier(userId, totalTurnover = 0) {
  const status = await getUserVipStatus(userId);
  return {
    userId,
    totalTurnover,
    ...status,
    updatedAt: new Date().toISOString(),
  };
}

export async function getVipTierHistory(userId) {
  const res = await query(
    `SELECT previous_tier, new_tier, reason, changed_at
     FROM vip_tier_history
     WHERE user_id = $1
     ORDER BY changed_at DESC
     LIMIT 50`,
    [userId],
  );
  return { success: true, userId, count: res.rows.length, history: res.rows };
}

export async function claimDailyCashback(userId) {
  if (!userId) {
    throw Object.assign(new Error('Please log in to claim cashback.'), {
      code: 'AUTH_REQUIRED',
      status: 401,
    });
  }

  const status = await getUserVipStatus(userId);
  if (!status.cashbackPct || status.cashbackPct <= 0) {
    throw Object.assign(new Error('Daily cashback is a VIP club benefit. Keep playing to reach Silver.'), {
      code: 'CASHBACK_NOT_ELIGIBLE',
      status: 403,
    });
  }

  const claimDate = previousKolkataDate();

  return withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT cashback_amount FROM vip_cashback_claims WHERE user_id = $1 AND claim_date = $2`,
      [userId, claimDate],
    );
    if (existing.rows.length > 0) {
      throw Object.assign(new Error('Yesterday’s cashback is already claimed.'), {
        code: 'CASHBACK_ALREADY_CLAIMED',
        status: 409,
      });
    }

    const lossRes = await client.query(
      `SELECT
         COALESCE((
           SELECT SUM(b.stake)
           FROM bets b
           WHERE b.user_id = $1
             AND COALESCE(b.fund_source, 'cash') = 'cash'
             AND b.created_at >= ($2::date AT TIME ZONE 'Asia/Kolkata')
             AND b.created_at < (($2::date + 1) AT TIME ZONE 'Asia/Kolkata')
         ), 0)
         - COALESCE((
           SELECT SUM(t.amount)
           FROM transactions t
           WHERE t.user_id = $1
             AND t.type IN ('BET_WIN', 'BET_PAYOUT', 'BET_CASHOUT')
             AND t.status IN ('SUCCESS', 'COMPLETED')
             AND t.created_at >= ($2::date AT TIME ZONE 'Asia/Kolkata')
             AND t.created_at < (($2::date + 1) AT TIME ZONE 'Asia/Kolkata')
         ), 0)
         AS net_loss`,
      [userId, claimDate],
    );
    const netLoss = Math.max(0, Number(lossRes.rows[0]?.net_loss || 0));
    const raw = Number(((netLoss * status.cashbackPct) / 100).toFixed(2));
    const cashbackAmount = Math.min(raw, Number(status.maxDailyCashback || 0));

    if (cashbackAmount < 1) {
      throw Object.assign(new Error('No cashback due for yesterday. Cashback is a share of net cash losses.'), {
        code: 'CASHBACK_NONE',
        status: 400,
      });
    }

    const walletRes = await client.query(
      `SELECT wallet_id, balance, COALESCE(bonus_balance, 0) AS bonus_balance,
              COALESCE(freebet_balance, 0) AS freebet_balance
       FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    if (walletRes.rows.length === 0) {
      throw Object.assign(new Error('Wallet not found.'), { code: 'WALLET_NOT_FOUND', status: 400 });
    }

    const wallet = walletRes.rows[0];
    const nextBalance = Number((Number(wallet.balance || 0) + cashbackAmount).toFixed(2));
    const claimId = `cb_${crypto.randomBytes(8).toString('hex')}`;
    const txId = `tx_${claimId}`;

    try {
      await client.query(
        `INSERT INTO vip_cashback_claims (id, user_id, claim_date, net_loss, cashback_amount)
         VALUES ($1, $2, $3, $4, $5)`,
        [claimId, userId, claimDate, netLoss, cashbackAmount],
      );
    } catch (err) {
      if (err.code === '23505') {
        throw Object.assign(new Error('Yesterday’s cashback is already claimed.'), {
          code: 'CASHBACK_ALREADY_CLAIMED',
          status: 409,
        });
      }
      throw err;
    }
    await client.query(
      `UPDATE wallets SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
      [nextBalance, wallet.wallet_id],
    );
    await client.query(
      `INSERT INTO transactions (transaction_id, user_id, type, method, amount, status)
       VALUES ($1, $2, 'VIP_CASHBACK', 'VIP', $3, 'COMPLETED')`,
      [txId, userId, cashbackAmount],
    );
    await client.query(
      `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'CREDIT', $3, $4, $5)`,
      [wallet.wallet_id, txId, cashbackAmount, nextBalance, `VIP cashback ${status.cashbackPct}% · ${claimDate}`],
    );

    return {
      success: true,
      claimDate,
      netLoss,
      cashbackAmount,
      cashbackPct: status.cashbackPct,
      wallet: {
        balance: nextBalance,
        bonusBalance: Number(wallet.bonus_balance || 0),
        freebetBalance: Number(wallet.freebet_balance || 0),
      },
    };
  });
}

export async function claimMonthlyClubReward(userId) {
  if (!userId) {
    throw Object.assign(new Error('Please log in to claim your club credit.'), {
      code: 'AUTH_REQUIRED',
      status: 401,
    });
  }

  const status = await getUserVipStatus(userId);
  if (!status.monthlyReward?.amount) {
    throw Object.assign(new Error('Monthly club credit starts at Silver VIP.'), {
      code: 'MONTHLY_NOT_ELIGIBLE',
      status: 403,
    });
  }
  if (status.monthlyClaimed) {
    throw Object.assign(new Error('This month’s club credit is already claimed.'), {
      code: 'MONTHLY_ALREADY_CLAIMED',
      status: 409,
    });
  }

  const monthKey = status.monthlyPeriod || kolkataMonthKey();
  const reward = status.monthlyReward;

  return withTransaction(async (client) => {
    const claimId = `mc_${crypto.randomBytes(8).toString('hex')}`;
    try {
      await client.query(
        `INSERT INTO vip_perk_claims (id, user_id, perk_kind, perk_key, reward_type, amount)
         VALUES ($1, $2, 'MONTHLY', $3, $4, $5)`,
        [claimId, userId, monthKey, reward.type, reward.amount],
      );
    } catch (err) {
      if (err.code === '23505') {
        throw Object.assign(new Error('This month’s club credit is already claimed.'), {
          code: 'MONTHLY_ALREADY_CLAIMED',
          status: 409,
        });
      }
      throw err;
    }

    const wallet = await creditWalletPerk(client, {
      userId,
      amount: reward.amount,
      rewardType: reward.type,
      txType: 'VIP_MONTHLY',
      method: 'VIP',
      description: `VIP ${status.tier} monthly ${reward.type} · ${monthKey}`,
    });

    return {
      success: true,
      period: monthKey,
      rewardType: reward.type,
      amount: reward.amount,
      wallet,
    };
  });
}

