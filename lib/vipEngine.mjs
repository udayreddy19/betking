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
      await client.query('SAVEPOINT tier_up_reward');
      try {
        await client.query(
          `INSERT INTO vip_perk_claims (id, user_id, perk_kind, perk_key, reward_type, amount)
           VALUES ($1, $2, 'TIER_UP', $3, $4, $5)`,
          [claimId, userId, tier, reward.type, reward.amount],
        );
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT tier_up_reward');
        if (err.code === '23505') continue;
        if (err.code === '42P01') return granted;
        throw err;
      }
      await client.query('RELEASE SAVEPOINT tier_up_reward');
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
  // Reuse an open PG client; bare pool `query` is a function and must get its own txn.
  if (exec && typeof exec.query === 'function' && typeof exec.release === 'function') {
    return run(exec);
  }
  return withTransaction(run);
}

export async function getUserVipStatus(userId) {
  const res = await query(
    `SELECT points, COALESCE(vip_points, points) AS vip_points, tier FROM user_loyalty WHERE user_id = $1`,
    [userId],
  );
  const redeemablePoints = Number(res.rows[0]?.points || 0);
  const vipPoints = Number(res.rows[0]?.vip_points ?? res.rows[0]?.points ?? 0);
  const tier = res.rows[0]?.tier || loyaltyTierFromPoints(vipPoints);
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
    points: redeemablePoints,
    vipPoints,
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

/**
 * Admin VIP dashboard: tier counts + spend/points aggregates from user_loyalty.
 */
export async function getVipAdminDashboard() {
  const { VIP_TIER_ORDER, VIP_TIER_POINTS, getBenefitsForTier } = await import('./vipBenefits.mjs');

  const tierCounts = await query(
    `SELECT UPPER(COALESCE(tier, 'BRONZE')) AS tier,
            COUNT(*)::int AS users,
            COALESCE(SUM(points), 0)::float AS redeemable_points,
            COALESCE(SUM(COALESCE(vip_points, points)), 0)::float AS vip_points
     FROM user_loyalty
     GROUP BY UPPER(COALESCE(tier, 'BRONZE'))`,
  ).catch(() => ({ rows: [] }));

  const spendAgg = await query(
    `SELECT
       COUNT(DISTINCT ul.user_id)::int AS loyalty_users,
       COALESCE(SUM(CASE WHEN UPPER(t.type) = 'BET_STAKE' AND UPPER(t.status) = 'SUCCESS' THEN t.amount ELSE 0 END), 0)::float AS total_stake_tx,
       COALESCE(SUM(CASE WHEN UPPER(t.type) = 'DEPOSIT' AND UPPER(t.status) = 'SUCCESS' THEN t.amount ELSE 0 END), 0)::float AS total_deposits_tx
     FROM user_loyalty ul
     LEFT JOIN transactions t ON t.user_id = ul.user_id`,
  ).catch(() => ({ rows: [{}] }));

  const recentOverrides = await query(
    `SELECT user_id, previous_tier, new_tier, reason, changed_at
     FROM vip_tier_history
     WHERE reason ILIKE 'ADMIN_OVERRIDE%'
     ORDER BY changed_at DESC
     LIMIT 25`,
  ).catch(() => ({ rows: [] }));

  const countMap = new Map((tierCounts.rows || []).map((r) => [r.tier, r]));
  const tiers = VIP_TIER_ORDER.map((tier) => {
    const row = countMap.get(tier) || {};
    const benefits = getBenefitsForTier(tier);
    return {
      tier,
      label: benefits.label || tier,
      pointsRequired: VIP_TIER_POINTS[tier] ?? 0,
      users: Number(row.users || 0),
      redeemablePoints: Number(row.redeemable_points || 0),
      vipPoints: Number(row.vip_points || 0),
    };
  });

  const totals = spendAgg.rows?.[0] || {};
  return {
    success: true,
    tiers,
    totals: {
      loyaltyUsers: Number(totals.loyalty_users || 0),
      totalUsersInTiers: tiers.reduce((s, t) => s + t.users, 0),
      attributedStake: Number(totals.total_stake_tx || 0),
      attributedDeposits: Number(totals.total_deposits_tx || 0),
      totalVipPoints: tiers.reduce((s, t) => s + t.vipPoints, 0),
      totalRedeemablePoints: tiers.reduce((s, t) => s + t.redeemablePoints, 0),
    },
    recentOverrides: (recentOverrides.rows || []).map((r) => ({
      userId: r.user_id,
      previousTier: r.previous_tier,
      newTier: r.new_tier,
      reason: r.reason,
      changedAt: r.changed_at,
    })),
    source: 'database',
  };
}

/**
 * Audited manual VIP tier override — updates user_loyalty + vip_tier_history.
 * Pins vip_points to the tier floor so the next earnLoyaltyPoints recalculation
 * cannot wipe an admin upgrade (or silently re-promote after a downgrade).
 */
export async function adminOverrideVipTier({
  userId,
  newTier,
  reason = '',
  adminId = 'admin',
} = {}) {
  if (!userId) {
    throw Object.assign(new Error('userId is required'), { status: 400, code: 'USER_REQUIRED' });
  }
  const { normalizeVipTier, VIP_TIER_ORDER, VIP_TIER_POINTS } = await import('./vipBenefits.mjs');
  const { recordLoyaltyLedger, ensureLoyaltyLedgerSchema } = await import('./loyaltyPointsStore.mjs');
  const tier = normalizeVipTier(newTier);
  if (!VIP_TIER_ORDER.includes(tier)) {
    throw Object.assign(new Error(`Invalid VIP tier: ${newTier}`), { status: 400, code: 'INVALID_TIER' });
  }

  await ensureLoyaltyLedgerSchema().catch(() => null);

  return withTransaction(async (client) => {
    const current = await client.query(
      `SELECT points, COALESCE(vip_points, points) AS vip_points, tier
       FROM user_loyalty WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );

    const previous = current.rows[0]?.tier || 'BRONZE';
    const currentVip = Number(current.rows[0]?.vip_points ?? 0);
    const floor = Number(VIP_TIER_POINTS[tier] ?? 0);
    const previousIdx = VIP_TIER_ORDER.indexOf(normalizeVipTier(previous));
    const nextIdx = VIP_TIER_ORDER.indexOf(tier);
    // Upgrade: bump vip_points to at least the tier floor. Downgrade: pin to floor.
    const nextVip = nextIdx >= previousIdx
      ? Math.max(currentVip, floor)
      : floor;

    if (String(previous).toUpperCase() === tier && currentVip === nextVip && current.rows.length) {
      return { success: true, userId, previousTier: previous, newTier: tier, vipPoints: currentVip, unchanged: true };
    }

    await client.query(
      `INSERT INTO user_loyalty (user_id, points, vip_points, tier, updated_at)
       VALUES ($1, 0, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         tier = EXCLUDED.tier,
         vip_points = EXCLUDED.vip_points,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, nextVip, tier],
    );

    const auditReason = `ADMIN_OVERRIDE:${adminId}${reason ? ` — ${String(reason).slice(0, 80)}` : ''}`;
    await client.query(
      `INSERT INTO vip_tier_history (user_id, previous_tier, new_tier, reason)
       VALUES ($1, $2, $3, $4)`,
      [userId, previous, tier, auditReason],
    ).catch(() => null);

    const pointsAfter = Number(current.rows[0]?.points ?? 0);
    await recordLoyaltyLedger(client, {
      userId,
      entryType: 'ADJUST',
      pointsDelta: 0,
      pointsAfter,
      vipPointsAfter: nextVip,
      source: 'admin_override',
      referenceId: adminId,
    });

    try {
      const { enterpriseAuditEngine } = await import('./enterpriseAuditEngine.mjs');
      enterpriseAuditEngine.recordEvent?.({
        who: adminId,
        what: 'VIP_TIER_OVERRIDE',
        referenceId: userId,
        reason: auditReason,
        after: { previousTier: previous, newTier: tier, vipPoints: nextVip },
      });
    } catch {
      // optional audit sink
    }

    return {
      success: true,
      userId,
      previousTier: previous,
      newTier: tier,
      vipPoints: nextVip,
      reason: auditReason,
    };
  });
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

