/**
 * Promo ROI analytics — attributable deposits/bets where grant linkage exists.
 * Shows N/A when attribution cannot be established.
 */

import { query } from '../db/pg.js';

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function moneyOrNa(v, attributable) {
  if (!attributable) return null;
  return n(v);
}

/**
 * Per-promotion ROI snapshot.
 * Attribution sources:
 *  - deposit_freebet_grants.deposit_id → deposits → subsequent bets by same user
 *  - user_bonuses → first captured deposit after grant (soft window 30d) → subsequent bets
 */
export async function getPromoRoiAnalytics({ limit = 50, from = null, to = null } = {}) {
  const params = [];
  let dateFilterGrants = '';
  let dateFilterBonus = '';
  if (from) {
    params.push(new Date(from).toISOString());
    dateFilterGrants += ` AND g.created_at >= $${params.length}`;
    dateFilterBonus += ` AND ub.created_at >= $${params.length}`;
  }
  if (to) {
    params.push(new Date(to).toISOString());
    dateFilterGrants += ` AND g.created_at <= $${params.length}`;
    dateFilterBonus += ` AND ub.created_at <= $${params.length}`;
  }
  params.push(Math.min(Math.max(Number(limit) || 50, 1), 200));
  const limitIdx = params.length;

  const promos = await query(
    `SELECT id, name, code, type, status,
            COALESCE(used_budget, 0) AS used_budget,
            COALESCE(budget, 0) AS budget,
            COALESCE(max_reward, 0) AS max_reward,
            COALESCE(is_targeted, false) AS is_targeted
     FROM promotions
     ORDER BY created_at DESC
     LIMIT $${limitIdx}`,
    params.slice(-1),
  ).catch(() => ({ rows: [] }));

  const freebetAgg = await query(
    `SELECT
       g.promotion_id,
       COUNT(*)::int AS grants,
       COUNT(DISTINCT g.user_id)::int AS users,
       COALESCE(SUM(g.freebet_amount), 0)::float AS cost,
       COALESCE(SUM(g.freebet_amount) FILTER (WHERE UPPER(g.status)='USED'), 0)::float AS used_cost,
       COALESCE(SUM(g.freebet_amount) FILTER (WHERE UPPER(g.status)='EXPIRED'), 0)::float AS expired_cost,
       COALESCE(SUM(g.deposit_amount), 0)::float AS attributed_deposits,
       COALESCE(SUM(b.stake), 0)::float AS attributed_stake,
       COUNT(b.bet_id)::int AS attributed_bets
     FROM deposit_freebet_grants g
     LEFT JOIN bets b
       ON b.user_id = g.user_id
      AND b.created_at >= g.created_at
      AND b.created_at < g.created_at + INTERVAL '30 days'
     WHERE 1=1 ${dateFilterGrants}
     GROUP BY g.promotion_id`,
    from || to ? params.slice(0, -1) : [],
  ).catch(() => ({ rows: [] }));

  const emailAgg = await query(
    `SELECT promotion_id,
            COUNT(*)::int AS targeted,
            COUNT(*) FILTER (WHERE UPPER(offer_email_status)='SENT')::int AS emails_sent
     FROM deposit_freebet_campaign_users
     GROUP BY promotion_id`,
  ).catch(() => ({ rows: [] }));

  const abuseAgg = await query(
    `SELECT promotion_id,
            COUNT(*)::int AS abuse_blocks
     FROM promo_abuse_alerts
     WHERE promotion_id IS NOT NULL
     GROUP BY promotion_id`,
  ).catch(() => ({ rows: [] }));

  const bonusAgg = await query(
    `WITH grants AS (
       SELECT ub.id, ub.user_id, ub.promotion_id, ub.bonus_amount, ub.created_at
       FROM user_bonuses ub
       WHERE 1=1 ${dateFilterBonus}
     ),
     first_dep AS (
       SELECT DISTINCT ON (g.id)
         g.id AS grant_id,
         g.promotion_id,
         g.user_id,
         g.bonus_amount,
         g.created_at AS grant_at,
         d.deposit_id,
         d.amount AS deposit_amount,
         d.created_at AS deposit_at
       FROM grants g
       LEFT JOIN deposits d
         ON d.user_id = g.user_id
        AND UPPER(COALESCE(d.status, '')) IN ('CAPTURED', 'SUCCESS', 'COMPLETED')
        AND d.created_at >= g.created_at
        AND d.created_at < g.created_at + INTERVAL '30 days'
       ORDER BY g.id, d.created_at ASC NULLS LAST
     )
     SELECT
       fd.promotion_id,
       COUNT(*)::int AS grants,
       COUNT(DISTINCT fd.user_id)::int AS users,
       COALESCE(SUM(fd.bonus_amount), 0)::float AS cost,
       COUNT(fd.deposit_id)::int AS attributed_deposit_count,
       COALESCE(SUM(fd.deposit_amount), 0)::float AS attributed_deposits,
       COALESCE(SUM(b.stake), 0)::float AS attributed_stake,
       COUNT(b.bet_id)::int AS attributed_bets
     FROM first_dep fd
     LEFT JOIN bets b
       ON b.user_id = fd.user_id
      AND fd.deposit_at IS NOT NULL
      AND b.created_at >= fd.deposit_at
      AND b.created_at < fd.deposit_at + INTERVAL '30 days'
     GROUP BY fd.promotion_id`,
    from || to ? params.slice(0, -1) : [],
  ).catch(() => ({ rows: [] }));

  const freebetMap = new Map((freebetAgg.rows || []).map((r) => [r.promotion_id, r]));
  const bonusMap = new Map((bonusAgg.rows || []).map((r) => [r.promotion_id, r]));
  const emailMap = new Map((emailAgg.rows || []).map((r) => [r.promotion_id, r]));
  const abuseMap = new Map((abuseAgg.rows || []).map((r) => [r.promotion_id, r]));

  const rows = (promos.rows || []).map((p) => {
    const fb = freebetMap.get(p.id);
    const bn = bonusMap.get(p.id);
    const em = emailMap.get(p.id);
    const ab = abuseMap.get(p.id);
    const hasFreebet = Boolean(fb && Number(fb.grants) > 0);
    const hasBonus = Boolean(bn && Number(bn.grants) > 0);
    const attributable = hasFreebet || (hasBonus && Number(bn.attributed_deposit_count) > 0);

    const grants = n(fb?.grants) + n(bn?.grants);
    const users = Math.max(n(fb?.users), n(bn?.users));
    const cost = hasFreebet ? n(fb.cost) : (hasBonus ? n(bn.cost) : n(p.used_budget));
    const deposits = hasFreebet
      ? n(fb.attributed_deposits)
      : (hasBonus ? n(bn.attributed_deposits) : null);
    const stake = hasFreebet
      ? n(fb.attributed_stake)
      : (hasBonus && Number(bn.attributed_deposit_count) > 0 ? n(bn.attributed_stake) : null);
    const bets = hasFreebet
      ? n(fb.attributed_bets)
      : (hasBonus && Number(bn.attributed_deposit_count) > 0 ? n(bn.attributed_bets) : null);

    let roi = null;
    if (attributable && cost > 0 && deposits != null) {
      roi = Number(((deposits - cost) / cost).toFixed(3));
    } else if (attributable && cost === 0 && deposits != null) {
      roi = 0;
    }

    const targeted = em ? n(em.targeted) : null;
    const emailsSent = em ? n(em.emails_sent) : null;
    const claimConversion = targeted > 0 && users
      ? Number((users / targeted).toFixed(3))
      : null;
    const depositConversion = targeted > 0 && hasFreebet
      ? Number((n(fb.users) / targeted).toFixed(3))
      : null;

    return {
      id: p.id,
      name: p.name,
      code: p.code,
      type: p.type,
      status: p.status,
      targeted: targeted,
      emailsSent,
      grants: grants || null,
      users: users || null,
      cost: grants ? cost : (n(p.used_budget) || null),
      freebetUsed: hasFreebet ? n(fb.used_cost) : null,
      freebetExpired: hasFreebet ? n(fb.expired_cost) : null,
      attributedDeposits: moneyOrNa(deposits, attributable),
      attributedStake: moneyOrNa(stake, attributable && stake != null),
      attributedBets: attributable && bets != null ? bets : null,
      avgDeposit: attributable && users > 0 && deposits != null
        ? Number((deposits / users).toFixed(2))
        : null,
      avgBettingVolume: attributable && users > 0 && stake != null
        ? Number((stake / users).toFixed(2))
        : null,
      claimConversion,
      depositConversion,
      abuseBlocks: ab ? n(ab.abuse_blocks) : 0,
      grossGamingRevenue: null,
      netRevenue: null,
      roi: attributable ? roi : null,
      attribution: attributable
        ? (hasFreebet ? 'deposit_freebet_grants' : 'user_bonuses+deposit_window')
        : 'N/A',
      note: attributable
        ? 'GGR/NGR = N/A (not derived without hold model)'
        : 'Attribution missing — no linked grants/deposits',
    };
  });

  return {
    success: true,
    rows,
    source: 'database',
    filters: { from: from || null, to: to || null },
    note: rows.some((r) => r.attribution === 'N/A')
      ? 'Some promotions lack attributable deposit/bet linkage; those show N/A. GGR/NGR always N/A.'
      : 'GGR/NGR = N/A (not fabricated). ROI uses attributable deposits vs promo cost where available.',
  };
}
