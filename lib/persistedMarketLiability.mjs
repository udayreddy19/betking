/**
 * DB-backed match liability for multi-instance bet rejection.
 * Open ACCEPTED/PENDING/OPEN bets are the source of truth (survives restarts).
 */

import { query } from '../db/pg.js';
import { recordSelectionLiability } from './marketLiabilityStore.mjs';
import { recordBetExposure } from './exposureEngine.mjs';

const OPEN_STATUSES = `('ACCEPTED', 'PENDING', 'OPEN')`;

/**
 * Worst-case net liability for open bets on a match (sum of max(0, payout − stake)).
 */
export async function getOpenMatchNetLiability(matchId, exec = query) {
  if (!matchId) return 0;
  const res = await exec(
    `SELECT COALESCE(SUM(
       GREATEST(
         0,
         COALESCE(
           potential_payout,
           stake * COALESCE(accepted_odds, odds, 1)
         ) - stake
       )
     ), 0)::float AS liability
     FROM bets
     WHERE match_id = $1
       AND UPPER(COALESCE(status, '')) IN ${OPEN_STATUSES}`,
    [String(matchId)],
  );
  return Number(res.rows[0]?.liability || 0);
}

/**
 * Hard-reject when accepting this stake would push match open liability over the house cap.
 */
export async function assertPersistedMatchLiabilityCapacity({
  matchId,
  stake,
  odds,
  maxLiabilityLimit,
  exec = query,
} = {}) {
  const limit = Number(maxLiabilityLimit);
  if (!matchId || !Number.isFinite(limit) || limit <= 0) {
    return { skipped: true, currentLiability: 0, remainingCapacity: limit || 0 };
  }

  const current = await getOpenMatchNetLiability(matchId, exec);
  const s = Number(stake) || 0;
  const o = Number(odds) || 1;
  const add = Math.max(0, s * o - s);
  const newWorstCase = current + add;
  const remainingCapacity = Math.max(0, limit - current);

  if (newWorstCase > limit) {
    throw Object.assign(
      new Error(
        `RISK_REJECTED: Market liability full — max remaining capacity ₹${Math.floor(remainingCapacity)}`,
      ),
      {
        code: 'MARKET_LIABILITY_FULL',
        currentLiability: current,
        newWorstCase,
        maxLiabilityLimit: limit,
        remainingCapacity,
      },
    );
  }

  return {
    exceedsMaxLiability: false,
    currentLiability: current,
    newWorstCase,
    maxLiabilityLimit: limit,
    remainingCapacity,
  };
}

/**
 * Persist liability after a bet is accepted (PG + Redis + in-memory exposure).
 * market_id is match-scoped so keys do not collide across fixtures.
 */
export async function recordAcceptedBetLiability({
  matchId,
  marketId,
  selectionId,
  stake,
  odds,
} = {}) {
  const s = Number(stake) || 0;
  const o = Number(odds) || 1;
  const potentialPayout = s * o;
  const scopedMarketId = matchId
    ? `${String(matchId)}::${String(marketId || 'market')}`
    : String(marketId || 'market');

  try {
    await recordSelectionLiability({
      marketId: scopedMarketId,
      selectionId: String(selectionId || 'sel'),
      stake: s,
      potentialPayout,
    });
  } catch {
    // Non-fatal — open-bets query remains authoritative on next check
  }

  try {
    recordBetExposure({
      matchId: matchId || 'global',
      marketId: marketId || 'winner',
      selectionId: selectionId || 'home',
      stake: s,
      odds: o,
    });
  } catch {
    // Non-fatal
  }
}
