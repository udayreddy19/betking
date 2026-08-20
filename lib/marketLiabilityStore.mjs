/**
 * Persisted market liability for pricing shifts (survives restarts).
 */

import { query } from '../db/pg.js';

const memory = new Map();

function key(marketId, selectionId) {
  return `${marketId}::${selectionId}`;
}

export function getSelectionLiability(marketId, selectionId) {
  return memory.get(key(marketId, selectionId)) || 0;
}

export function getMarketLiabilityAggregate(marketId) {
  let totalStake = 0;
  let liabilityOver = 0;
  let liabilityUnder = 0;
  const bySelection = {};

  for (const [compound, net] of memory.entries()) {
    if (!compound.startsWith(`${marketId}::`)) continue;
    const selectionId = compound.split('::')[1];
    bySelection[selectionId] = net;
    if (/over/i.test(selectionId)) liabilityOver += net;
    else if (/under/i.test(selectionId)) liabilityUnder += net;
  }

  return { totalStake, liabilityOver, liabilityUnder, bySelection };
}

export async function hydrateMarketLiabilityStore() {
  try {
    const res = await query(
      `SELECT market_id, selection_id, net_liability FROM market_selection_liability`,
    );
    memory.clear();
    for (const row of res.rows) {
      memory.set(key(row.market_id, row.selection_id), Number(row.net_liability) || 0);
    }
  } catch {
    // Table may not exist during bootstrap migrations.
  }
}

export async function recordSelectionLiability({ marketId, selectionId, stake, potentialPayout }) {
  const net = Number(potentialPayout) - Number(stake);
  const compound = key(marketId, selectionId);
  const next = (memory.get(compound) || 0) + net;
  memory.set(compound, next);

  try {
    await query(
      `INSERT INTO market_selection_liability (market_id, selection_id, net_liability, total_stake, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (market_id, selection_id) DO UPDATE
       SET net_liability = market_selection_liability.net_liability + EXCLUDED.net_liability,
           total_stake = market_selection_liability.total_stake + EXCLUDED.total_stake,
           updated_at = NOW()`,
      [marketId, selectionId, net, Number(stake) || 0],
    );
  } catch {
    // Non-fatal — in-memory still updated.
  }

  return next;
}
