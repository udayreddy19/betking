/**
 * Hard house-protection gates for bet placement.
 * Fail closed: any breach rejects the bet (no soft ACCEPT_WITH_LIMIT).
 */

import { query } from '../db/pg.js';
import { getLinkedUserIds } from './linkedAccountPool.mjs';

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
  /** Max combined potential profit on open totals for one user(+linked)+match */
  liveTotalsMatchUserLiabilityCap: 15000,
  matchLiabilityTotals: 75000,
  matchLiabilityDefault: 200000,
  /** SRL / simulated leagues — tighter (not disabled) */
  srlTotalsMaxStakeCash: 2500,
  srlTotalsMaxStakePromo: 1000,
  srlMatchOverStakeCap: 4000,
  srlMatchOverBetCap: 1,
  srlTotalsMaxOdds: 1.55,
  srlMatchLiabilityTotals: 40000,
  srlMatchUserLiabilityCap: 8000,
});

export function isSrlContext({ league, sport, matchName, isSrl } = {}) {
  if (isSrl === true) return true;
  const raw = [league, sport, matchName].filter(Boolean).join(' ').toUpperCase();
  return /\bSRL\b|SIMULATED\s*REALITY|VIRTUAL\s*CRICKET|VIRTUAL-CRICKET/.test(raw)
    || String(sport || '').toLowerCase() === 'virtual-cricket';
}

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
  league = null,
  sport = null,
  matchName = null,
  isSrl = false,
}) {
  const s = Number(stake) || 0;
  const o = Number(odds) || 1;
  const profit = s * Math.max(0, o - 1);
  const totals = isTotalsMarket(marketId);
  const over = isOverSelection(selectionId, selectionName);
  const promo = ['bonus', 'freebet'].includes(String(fundSource || '').toLowerCase());
  const srl = isSrl || isSrlContext({ league, sport, matchName, isSrl });

  if (s > HOUSE_LIMITS.globalMaxStake) {
    reject('MAX_STAKE', `Maximum stake is ₹${HOUSE_LIMITS.globalMaxStake}`);
  }
  if (profit > HOUSE_LIMITS.globalMaxWin) {
    reject(
      'MAX_WIN',
      `Maximum potential win is ₹${HOUSE_LIMITS.globalMaxWin} (this bet would win ₹${profit.toFixed(2)})`,
    );
  }

  if (totals && promo) {
    reject(
      'PROMO_TOTALS_BAN',
      'Bonus and freebet cannot be used on live totals markets',
    );
  }

  if (totals) {
    const maxStake = srl
      ? HOUSE_LIMITS.srlTotalsMaxStakeCash
      : HOUSE_LIMITS.liveTotalsMaxStakeCash;
    const maxOdds = srl ? HOUSE_LIMITS.srlTotalsMaxOdds : HOUSE_LIMITS.liveTotalsMaxOdds;
    if (s > maxStake) {
      reject('LIVE_TOTALS_STAKE_CAP', `${srl ? 'SRL ' : ''}Totals max stake is ₹${maxStake}`);
    }
    if (over && o > maxOdds + 0.001) {
      reject(
        'LIVE_TOTALS_ODDS_CAP',
        `Over odds above ${maxOdds.toFixed(2)} are not accepted on ${srl ? 'SRL ' : ''}totals`,
      );
    }
  }
}

/**
 * Async ladder / repeat-Over guard for totals on the same match (shared across linked accounts).
 */
export async function assertTotalsLadderLimits({
  userId,
  matchId,
  marketId,
  selectionId,
  selectionName,
  stake,
  client = null,
  league = null,
  sport = null,
  matchName = null,
  isSrl = false,
}) {
  if (!userId || !matchId || !isTotalsMarket(marketId)) return;
  if (!isOverSelection(selectionId, selectionName)) return;

  const run = client?.query?.bind(client) || query;
  const s = Number(stake) || 0;
  const srl = isSrl || isSrlContext({ league, sport, matchName, isSrl });
  const betCap = srl ? HOUSE_LIMITS.srlMatchOverBetCap : HOUSE_LIMITS.liveTotalsMatchOverBetCap;
  const stakeCap = srl ? HOUSE_LIMITS.srlMatchOverStakeCap : HOUSE_LIMITS.liveTotalsMatchOverStakeCap;
  const userIds = await getLinkedUserIds(userId, client);

  const res = await run(
    `SELECT
       COUNT(*)::int AS over_bets,
       COALESCE(SUM(stake), 0)::float AS over_stake
     FROM bets
     WHERE user_id = ANY($1::text[])
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
    [userIds, matchId],
  );

  const overBets = Number(res.rows[0]?.over_bets || 0);
  const overStake = Number(res.rows[0]?.over_stake || 0);

  if (overBets >= betCap) {
    reject(
      'TOTALS_LADDER_BET_CAP',
      `Max ${betCap} Over bet${betCap === 1 ? '' : 's'} on totals for this ${srl ? 'SRL ' : ''}match`,
    );
  }
  if (overStake + s > stakeCap) {
    reject(
      'TOTALS_LADDER_STAKE_CAP',
      `Max ₹${stakeCap} combined Over stake on totals for this ${srl ? 'SRL ' : ''}match`,
    );
  }
}

/**
 * Cap combined potential profit on open totals for user (+ linked) on one match.
 */
export async function assertTotalsUserMatchLiability({
  userId,
  matchId,
  marketId,
  stake,
  odds,
  client = null,
  isSrl = false,
}) {
  if (!userId || !matchId || !isTotalsMarket(marketId)) return;

  const run = client?.query?.bind(client) || query;
  const profit = (Number(stake) || 0) * Math.max(0, (Number(odds) || 1) - 1);
  const cap = isSrl
    ? HOUSE_LIMITS.srlMatchUserLiabilityCap
    : HOUSE_LIMITS.liveTotalsMatchUserLiabilityCap;
  const userIds = await getLinkedUserIds(userId, client);

  const res = await run(
    `SELECT COALESCE(SUM(
       COALESCE(potential_profit, stake * GREATEST(COALESCE(accepted_odds, odds, 1) - 1, 0))
     ), 0)::float AS open_liability
     FROM bets
     WHERE user_id = ANY($1::text[])
       AND match_id = $2
       AND created_at > NOW() - INTERVAL '8 hours'
       AND UPPER(status) IN ('ACCEPTED', 'PENDING', 'OPEN')
       AND (
         LOWER(COALESCE(market_id, '')) LIKE '%team_total%'
         OR LOWER(COALESCE(market_id, '')) LIKE '%match_total%'
         OR LOWER(COALESCE(market_id, '')) LIKE '%innings_total%'
         OR LOWER(COALESCE(market_id, '')) = 'total_pts'
       )`,
    [userIds, matchId],
  );

  const openLiability = Number(res.rows[0]?.open_liability || 0);
  if (openLiability + profit > cap) {
    reject(
      'TOTALS_USER_MATCH_LIABILITY',
      `Max ₹${cap} potential win on totals for this match (open ₹${openLiability.toFixed(0)})`,
    );
  }
}

export function liabilityLimitForMarket(marketId, { isSrl = false } = {}) {
  if (isTotalsMarket(marketId)) {
    return isSrl ? HOUSE_LIMITS.srlMatchLiabilityTotals : HOUSE_LIMITS.matchLiabilityTotals;
  }
  return HOUSE_LIMITS.matchLiabilityDefault;
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
  league = null,
  sport = null,
  matchName = null,
  isSrl = false,
}) {
  const srl = isSrl || isSrlContext({ league, sport, matchName, isSrl });
  assertHouseStakeAndOddsLimits({
    stake,
    odds,
    marketId,
    selectionId,
    selectionName,
    fundSource,
    league,
    sport,
    matchName,
    isSrl: srl,
  });
  await assertTotalsLadderLimits({
    userId,
    matchId,
    marketId,
    selectionId,
    selectionName,
    stake,
    client,
    league,
    sport,
    matchName,
    isSrl: srl,
  });
  await assertTotalsUserMatchLiability({
    userId,
    matchId,
    marketId,
    stake,
    odds,
    client,
    isSrl: srl,
  });
}
