/**
 * Authoritative exposure / liability — open bets in PostgreSQL are source of truth.
 *
 * Cache layers (marketLiabilityStore memory/Redis, exposureEngine memory) are
 * derived acceleration only and MUST NOT be used for accept/reject decisions.
 *
 * authoritativeExposureSource = 'open_bets_postgres'
 */

import { query } from '../db/pg.js';
import { recordSelectionLiability } from './marketLiabilityStore.mjs';
import { recordBetExposure } from './exposureEngine.mjs';

export const AUTHORITATIVE_EXPOSURE_SOURCE = 'open_bets_postgres';

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
 * Authoritative exposure check — same shape as legacy calculateExposureRisk.
 * Decision path MUST use this (or assertPersistedMatchLiabilityCapacity).
 */
export async function calculateAuthoritativeExposureRisk({
  matchId,
  stake = 0,
  odds = 1,
  maxLiabilityLimit = 500000,
  exec = query,
} = {}) {
  const limit = Number(maxLiabilityLimit) || 0;
  const current = await getOpenMatchNetLiability(matchId, exec);
  const s = Number(stake) || 0;
  const o = Number(odds) || 1;
  const add = Math.max(0, s * o - s);
  const newWorstCase = current + add;
  const remainingCapacity = Math.max(0, limit - current);
  return {
    exceedsMaxLiability: limit > 0 && newWorstCase > limit,
    currentLiability: current,
    projectedLiability: newWorstCase,
    newWorstCase,
    maxLiabilityLimit: limit,
    remainingCapacity,
    authoritativeExposureSource: AUTHORITATIVE_EXPOSURE_SOURCE,
  };
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

  const check = await calculateAuthoritativeExposureRisk({
    matchId,
    stake,
    odds,
    maxLiabilityLimit: limit,
    exec,
  });

  if (check.exceedsMaxLiability) {
    throw Object.assign(
      new Error(
        `RISK_REJECTED: Market liability full — max remaining capacity ₹${Math.floor(check.remainingCapacity)}`,
      ),
      {
        code: 'MARKET_LIABILITY_FULL',
        reasonCode: 'EVENT_EXPOSURE_LIMIT',
        ...check,
      },
    );
  }

  return {
    exceedsMaxLiability: false,
    ...check,
  };
}

/**
 * Persist derived cache after bet accept (non-authoritative).
 * Open-bets query remains authoritative on next check.
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

/**
 * Compare market_selection_liability store vs sum of open bets (authoritative).
 */
export async function reconcileExposureFromOpenBets({ matchId = null, limit = 200 } = {}) {
  const params = [];
  let matchFilter = '';
  if (matchId) {
    params.push(String(matchId));
    matchFilter = `AND match_id = $1`;
  }

  const betsRes = await query(
    `SELECT match_id,
            COALESCE(SUM(
              GREATEST(0, COALESCE(potential_payout, stake * COALESCE(accepted_odds, odds, 1)) - stake)
            ), 0)::float AS calculated
     FROM bets
     WHERE UPPER(COALESCE(status, '')) IN ${OPEN_STATUSES}
       ${matchFilter}
     GROUP BY match_id
     ORDER BY calculated DESC
     LIMIT ${Math.min(500, Math.max(1, Number(limit) || 200))}`,
    params,
  );

  const storeRes = await query(
    `SELECT split_part(market_id, '::', 1) AS match_id,
            COALESCE(SUM(net_liability), 0)::float AS stored
     FROM market_selection_liability
     WHERE market_id LIKE '%::%'
     GROUP BY split_part(market_id, '::', 1)`,
  );
  const storedByMatch = new Map(storeRes.rows.map((r) => [String(r.match_id), Number(r.stored) || 0]));

  const diffs = [];
  let matches = 0;
  let mismatches = 0;

  for (const row of betsRes.rows) {
    const mid = String(row.match_id);
    const calculated = Number(row.calculated) || 0;
    const stored = storedByMatch.get(mid) ?? 0;
    const delta = Math.round((calculated - stored) * 100) / 100;
    if (Math.abs(delta) < 0.01) {
      matches += 1;
      diffs.push({
        matchId: mid,
        calculated,
        stored,
        difference: 0,
        code: 'EXPOSURE_MATCH',
      });
    } else {
      mismatches += 1;
      diffs.push({
        matchId: mid,
        calculated,
        stored,
        difference: delta,
        code: 'EXPOSURE_MISMATCH',
      });
    }
  }

  return {
    authoritativeExposureSource: AUTHORITATIVE_EXPOSURE_SOURCE,
    matches,
    mismatches,
    code: mismatches ? 'EXPOSURE_MISMATCH' : 'EXPOSURE_MATCH',
    differences: diffs.filter((d) => d.code === 'EXPOSURE_MISMATCH').slice(0, 50),
    sample: diffs.slice(0, 20),
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Rebuild market_selection_liability from open bets.
 * dryRun=true returns the plan only.
 */
export async function rebuildExposureFromOpenBets({ dryRun = true, matchId = null } = {}) {
  const recon = await reconcileExposureFromOpenBets({ matchId, limit: 500 });
  if (dryRun) {
    return {
      dryRun: true,
      code: 'EXPOSURE_REBUILD_DRY_RUN',
      ...recon,
      message: 'Dry run only — no writes. Pass dryRun:false with admin confirmation to rebuild.',
    };
  }

  try {
    if (matchId) {
      await query(
        `DELETE FROM market_selection_liability WHERE market_id LIKE $1`,
        [`${String(matchId)}::%`],
      );
    } else {
      await query(`DELETE FROM market_selection_liability`);
    }

    const params = matchId ? [String(matchId)] : [];
    const matchFilter = matchId ? 'AND match_id = $1' : '';
    const agg = await query(
      `SELECT match_id,
              COALESCE(market_id, 'market') AS market_id,
              COALESCE(selection_id, 'sel') AS selection_id,
              COALESCE(SUM(stake), 0)::float AS total_stake,
              COALESCE(SUM(
                GREATEST(0, COALESCE(potential_payout, stake * COALESCE(accepted_odds, odds, 1)) - stake)
              ), 0)::float AS net_liability
       FROM bets
       WHERE UPPER(COALESCE(status, '')) IN ${OPEN_STATUSES}
         ${matchFilter}
       GROUP BY match_id, COALESCE(market_id, 'market'), COALESCE(selection_id, 'sel')`,
      params,
    );

    let written = 0;
    for (const row of agg.rows) {
      const scoped = `${row.match_id}::${row.market_id}`;
      await query(
        `INSERT INTO market_selection_liability (market_id, selection_id, net_liability, total_stake, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (market_id, selection_id) DO UPDATE
         SET net_liability = EXCLUDED.net_liability,
             total_stake = EXCLUDED.total_stake,
             updated_at = NOW()`,
        [scoped, row.selection_id, row.net_liability, row.total_stake],
      );
      written += 1;
    }

    return {
      dryRun: false,
      code: 'EXPOSURE_REBUILT',
      written,
      prior: recon,
      authoritativeExposureSource: AUTHORITATIVE_EXPOSURE_SOURCE,
      rebuiltAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      dryRun: false,
      code: 'EXPOSURE_RECONCILIATION_FAILED',
      error: err.message,
      prior: recon,
    };
  }
}
