/**
 * Daily net-win / sharp-tier guards for house protection.
 */

import { query } from '../db/pg.js';
import { setUserRiskProfile, getUserRiskProfile } from './riskEngine.mjs';
import { getLinkedUserIds } from './linkedAccountPool.mjs';

export const DAILY_HOUSE_CAPS = Object.freeze({
  maxDailyNetWin: 25000,
  sharpNetWinThreshold: 10000,
  sharpMaxStake: 2000,
  sharpTotalsMaxStake: 1000,
});

/**
 * Net profit today (IST) from settled cash bets — pooled across linked accounts.
 */
export async function getUserDailyNetWin(userId, client = null) {
  if (!userId) return { netWin: 0, settled: 0, won: 0, winRate: 0 };
  const run = client?.query?.bind(client) || query;
  const userIds = await getLinkedUserIds(userId, client);
  const res = await run(
    `SELECT
       COALESCE(SUM(
         CASE
           WHEN UPPER(status) = 'WON' THEN COALESCE(actual_payout, 0) - stake
           WHEN UPPER(status) = 'LOST' THEN -stake
           WHEN UPPER(status) = 'CASHED_OUT' THEN COALESCE(actual_payout, 0) - stake
           ELSE 0
         END
       ), 0)::float AS net_win,
       COUNT(*) FILTER (WHERE UPPER(status) IN ('WON','LOST','CASHED_OUT'))::int AS settled,
       COUNT(*) FILTER (WHERE UPPER(status) = 'WON')::int AS won
     FROM bets
     WHERE user_id = ANY($1::text[])
       AND COALESCE(fund_source, 'cash') = 'cash'
       AND COALESCE(settled_at, created_at) >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')`,
    [userIds],
  );
  const row = res.rows[0] || {};
  const settled = Number(row.settled || 0);
  const won = Number(row.won || 0);
  return {
    netWin: Number(row.net_win || 0),
    settled,
    won,
    winRate: settled > 0 ? won / settled : 0,
    linkedUserCount: userIds.length,
  };
}

export async function assertDailyNetWinCap(userId, { fundSource = 'cash', client = null } = {}) {
  if (String(fundSource || 'cash').toLowerCase() !== 'cash') return null;
  const stats = await getUserDailyNetWin(userId, client);
  if (stats.netWin >= DAILY_HOUSE_CAPS.maxDailyNetWin) {
    const err = new Error(
      `HOUSE_PROTECTION: Daily net-win limit of ₹${DAILY_HOUSE_CAPS.maxDailyNetWin} reached — betting paused until tomorrow`,
    );
    err.code = 'DAILY_NET_WIN_CAP';
    err.status = 403;
    throw err;
  }

  if (stats.settled >= 5) {
    const sharp = stats.winRate >= 0.68 || stats.netWin >= DAILY_HOUSE_CAPS.sharpNetWinThreshold;
    setUserRiskProfile(userId, {
      totalBets: Math.max(stats.settled, 11),
      winningBets: stats.won,
      winRate: stats.winRate,
      ...(sharp ? { tier: 'SHARP' } : {}),
    });
  }
  return stats;
}

export function assertSharpStakeCap({ userId, stake, isTotals = false }) {
  const profile = getUserRiskProfile(userId);
  const tier = String(profile?.tier || 'STANDARD').toUpperCase();
  if (tier !== 'SHARP') return;
  const s = Number(stake) || 0;
  const max = isTotals ? DAILY_HOUSE_CAPS.sharpTotalsMaxStake : DAILY_HOUSE_CAPS.sharpMaxStake;
  if (s > max) {
    const err = new Error(
      `HOUSE_PROTECTION: Sharp-account max stake is ₹${max} on this market`,
    );
    err.code = 'SHARP_STAKE_CAP';
    err.status = 403;
    throw err;
  }
}
