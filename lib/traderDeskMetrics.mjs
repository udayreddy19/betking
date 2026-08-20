/**
 * Trader desk KPIs: GGR, hold %, open liability from Postgres + liability store.
 */

import { query } from '../db/pg.js';
import { getSystemWideExposureSummary } from './exposureEngine.mjs';

export async function buildTraderDeskMetrics({ from = null, to = null } = {}) {
  const params = [];
  const timeClauses = [];
  let idx = 1;
  if (from) {
    timeClauses.push(`created_at >= $${idx++}`);
    params.push(from);
  }
  if (to) {
    timeClauses.push(`created_at <= $${idx++}`);
    params.push(to);
  }
  const timeSql = timeClauses.length ? ` AND ${timeClauses.join(' AND ')}` : '';

  const [stakeTx, payoutTx, openRes, liabilityRes, cashoutRes, settledBetsRes] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(amount), 0)::float AS total
       FROM transactions
       WHERE type = 'BET_STAKE' AND status IN ('SUCCESS', 'COMPLETED')${timeSql}`,
      params,
    ).catch(() => ({ rows: [{ total: 0 }] })),
    query(
      `SELECT COALESCE(SUM(amount), 0)::float AS total
       FROM transactions
       WHERE type IN ('BET_WIN', 'BET_CASHOUT', 'BET_VOID')
         AND status IN ('SUCCESS', 'COMPLETED')${timeSql}`,
      params,
    ).catch(() => ({ rows: [{ total: 0 }] })),
    query(
      `SELECT
         COUNT(*)::int AS open_bets,
         COALESCE(SUM(stake), 0)::float AS open_stake,
         COALESCE(SUM(COALESCE(potential_payout, stake * COALESCE(accepted_odds, odds, 1))), 0)::float AS open_potential_payout
       FROM bets
       WHERE status IN ('ACCEPTED', 'PENDING', 'OPEN')${timeSql}`,
      params,
    ),
    query(
      `SELECT
         COALESCE(SUM(net_liability), 0)::float AS stored_net_liability,
         COALESCE(SUM(total_stake), 0)::float AS stored_total_stake,
         COUNT(*)::int AS selection_rows
       FROM market_selection_liability`,
    ).catch(() => ({ rows: [{ stored_net_liability: 0, stored_total_stake: 0, selection_rows: 0 }] })),
    query(
      `SELECT COUNT(*)::int AS cashout_count,
              COALESCE(SUM(stake), 0)::float AS cashed_stake
       FROM bets
       WHERE status = 'CASHED_OUT'${timeSql}`,
      params,
    ),
    query(
      `SELECT COUNT(*)::int AS settled_bets,
              COALESCE(SUM(stake), 0)::float AS settled_stake
       FROM bets
       WHERE status IN ('SETTLED', 'WON', 'LOST', 'CASHED_OUT')${timeSql}`,
      params,
    ),
  ]);

  const handle = Number(stakeTx.rows[0]?.total) || 0;
  const paidOut = Number(payoutTx.rows[0]?.total) || 0;
  const ggr = Number((handle - paidOut).toFixed(2));
  const holdPct = handle > 0 ? Number(((ggr / handle) * 100).toFixed(2)) : 0;

  const o = openRes.rows[0] || {};
  const l = liabilityRes.rows[0] || {};
  const c = cashoutRes.rows[0] || {};
  const sb = settledBetsRes.rows[0] || {};

  const openStake = Number(o.open_stake) || 0;
  const openPotential = Number(o.open_potential_payout) || 0;
  const openLiability = Number(Math.max(0, openPotential - openStake).toFixed(2));
  const mem = getSystemWideExposureSummary();

  const topMarkets = await query(
    `SELECT market_id, selection_id, net_liability, total_stake, updated_at
     FROM market_selection_liability
     ORDER BY ABS(net_liability) DESC
     LIMIT 25`,
  ).catch(() => ({ rows: [] }));

  return {
    success: true,
    window: { from, to },
    ggr,
    holdPct,
    handle,
    paidOut,
    settledStake: Number(sb.settled_stake) || 0,
    settledBets: Number(sb.settled_bets) || 0,
    openBets: Number(o.open_bets) || 0,
    openStake,
    openPotentialPayout: openPotential,
    openLiability,
    storedMarketLiability: Number(l.stored_net_liability) || 0,
    storedSelectionRows: Number(l.selection_rows) || 0,
    memoryWorstCaseLoss: mem.globalWorstCaseLoss || 0,
    cashouts: {
      count: Number(c.cashout_count) || 0,
      stake: Number(c.cashed_stake) || 0,
    },
    topLiabilities: (topMarkets.rows || []).map((row) => ({
      marketId: row.market_id,
      selectionId: row.selection_id,
      netLiability: Number(row.net_liability) || 0,
      totalStake: Number(row.total_stake) || 0,
      updatedAt: row.updated_at,
    })),
    formulas: {
      ggr: 'BET_STAKE credits − (BET_WIN + BET_CASHOUT + BET_VOID) credits',
      holdPct: 'ggr / handle × 100',
      openLiability: 'open_potential_payout − open_stake',
    },
    timestamp: new Date().toISOString(),
  };
}
