/**
 * Hard house-protection gates for bet placement.
 * Fail closed: any breach rejects the bet (no soft ACCEPT_WITH_LIMIT).
 */

import { query } from '../db/pg.js';

/** Conservative limits — prefer rejecting edge bets over bleeding liability. */
export const HOUSE_LIMITS = Object.freeze({
  globalMaxStake: 25000,
  /** Max potential profit (payout − stake) on a single bet */
  globalMaxWin: 75000,
  liveTotalsMaxStakeCash: 5000,
  liveTotalsMaxStakePromo: 2000,
  /** Combined Over stake on totals markets for one user+match */
  liveTotalsMatchOverStakeCap: 8000,
  /** Max accepted Over bets on totals for one user+match (rolling 8h) */
  liveTotalsMatchOverBetCap: 2,
  liveTotalsMaxOdds: 1.65,
  matchLiabilityTotals: 75000,
  matchLiabilityDefault: 200000,
});

export function isTotalsMarket(marketId) {
  const m = String(marketId || '').toLowerCase();
  if (!m) return false;
  if (m.includes('fours') || m.includes('sixes') || m.includes('wicket')) return false;
  return (
    m === 'team_total'
    || m.startsWith('team_total')
    || m === 'match_total'
    || m.startsWith('match_total')
    || m.includes('_team_total')
    || m.includes('innings_total')
    || /total_pts|total_sets|match_total/.test(m)
  );
}

export function isOverSelection(selectionId, selectionName = '') {
  const raw = `${selectionId || ''} ${selectionName || ''}`.toLowerCase();
  if (/\bunder\b/.test(raw)) return false;
  return /\bover\b/.test(raw) || /sel_over_|:over|points:over/i.test(raw);
}

function reject(code, message) {
  const err = new Error(`HOUSE_PROTECTION: ${message}`);
  err.code = code;
  err.status = 403;
  throw err;
}

/**
 * Sync stake/odds/win ceilings (no DB). Call before wallet debit.
 */
export function assertHouseStakeAndOddsLimits({
  stake,
  odds,
  marketId,
  selectionId,
  selectionName,
  fundSource = 'cash',
}) {
  const s = Number(stake) || 0;
  const o = Number(odds) || 1;
  const profit = s * Math.max(0, o - 1);
  const totals = isTotalsMarket(marketId);
  const over = isOverSelection(selectionId, selectionName);
  const promo = ['bonus', 'freebet'].includes(String(fundSource || '').toLowerCase());

  if (s > HOUSE_LIMITS.globalMaxStake) {
    reject('MAX_STAKE', `Maximum stake is ₹${HOUSE_LIMITS.globalMaxStake}`);
  }
  if (profit > HOUSE_LIMITS.globalMaxWin) {
    reject(
      'MAX_WIN',
      `Maximum potential win is ₹${HOUSE_LIMITS.globalMaxWin} (this bet would win ₹${profit.toFixed(2)})`,
    );
  }

  if (totals) {
    const maxStake = promo ? HOUSE_LIMITS.liveTotalsMaxStakePromo : HOUSE_LIMITS.liveTotalsMaxStakeCash;
    if (s > maxStake) {
      reject('LIVE_TOTALS_STAKE_CAP', `Live/totals markets max stake is ₹${maxStake}`);
    }
    if (over && o > HOUSE_LIMITS.liveTotalsMaxOdds + 0.001) {
      reject(
        'LIVE_TOTALS_ODDS_CAP',
        `Over odds above ${HOUSE_LIMITS.liveTotalsMaxOdds.toFixed(2)} are not accepted on totals`,
      );
    }
  }
}

/**
 * Async ladder / repeat-Over guard for totals on the same match.
 */
export async function assertTotalsLadderLimits({
  userId,
  matchId,
  marketId,
  selectionId,
  selectionName,
  stake,
  client = null,
}) {
  if (!userId || !matchId || !isTotalsMarket(marketId)) return;
  if (!isOverSelection(selectionId, selectionName)) return;

  const run = client?.query?.bind(client) || query;
  const s = Number(stake) || 0;

  const res = await run(
    `SELECT
       COUNT(*)::int AS over_bets,
       COALESCE(SUM(stake), 0)::float AS over_stake
     FROM bets
     WHERE user_id = $1
       AND match_id = $2
       AND created_at > NOW() - INTERVAL '8 hours'
       AND UPPER(status) IN ('ACCEPTED', 'PENDING', 'OPEN', 'WON', 'LOST', 'CASHED_OUT')
       AND (
         LOWER(COALESCE(market_id, '')) LIKE '%team_total%'
         OR LOWER(COALESCE(market_id, '')) LIKE '%match_total%'
         OR LOWER(COALESCE(market_id, '')) LIKE '%innings_total%'
         OR LOWER(COALESCE(market_id, '')) = 'total_pts'
       )
       AND (
         LOWER(COALESCE(selection_id, '')) LIKE '%over%'
         OR EXISTS (
           SELECT 1 FROM bet_selections bs
           WHERE bs.bet_id = bets.bet_id
             AND LOWER(COALESCE(bs.selection_name, '')) LIKE '%over%'
             AND LOWER(COALESCE(bs.selection_name, '')) NOT LIKE '%under%'
         )
       )`,
    [userId, matchId],
  );

  const overBets = Number(res.rows[0]?.over_bets || 0);
  const overStake = Number(res.rows[0]?.over_stake || 0);

  if (overBets >= HOUSE_LIMITS.liveTotalsMatchOverBetCap) {
    reject(
      'TOTALS_LADDER_BET_CAP',
      `Max ${HOUSE_LIMITS.liveTotalsMatchOverBetCap} Over bets on totals for this match`,
    );
  }
  if (overStake + s > HOUSE_LIMITS.liveTotalsMatchOverStakeCap) {
    reject(
      'TOTALS_LADDER_STAKE_CAP',
      `Max ₹${HOUSE_LIMITS.liveTotalsMatchOverStakeCap} combined Over stake on totals for this match`,
    );
  }
}

export function liabilityLimitForMarket(marketId) {
  return isTotalsMarket(marketId)
    ? HOUSE_LIMITS.matchLiabilityTotals
    : HOUSE_LIMITS.matchLiabilityDefault;
}

/**
 * Full pre-accept house gate used by placement risk enforcement.
 */
export async function enforceHouseProtection({
  userId,
  stake,
  odds,
  matchId,
  marketId,
  selectionId,
  selectionName,
  fundSource = 'cash',
  client = null,
}) {
  assertHouseStakeAndOddsLimits({
    stake,
    odds,
    marketId,
    selectionId,
    selectionName,
    fundSource,
  });
  await assertTotalsLadderLimits({
    userId,
    matchId,
    marketId,
    selectionId,
    selectionName,
    stake,
    client,
  });
}
