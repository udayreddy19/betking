/**
 * Growth dashboard KPIs — aggregates existing engines/tables only.
 * Does not invent financial values; uses N/A where attribution is unavailable.
 */

import { query } from '../db/pg.js';

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export async function getGrowthDashboard() {
  const [
    campaigns,
    segments,
    referrals,
    vip,
    freebet,
    abuse,
    emails,
  ] = await Promise.all([
    query(
      `SELECT
         COUNT(*) FILTER (WHERE UPPER(COALESCE(status,'')) = 'ACTIVE')::int AS active_campaigns,
         COUNT(*) FILTER (WHERE COALESCE(is_targeted,false) = true)::int AS targeted_campaigns,
         COUNT(*)::int AS total_promotions
       FROM promotions`,
    ).catch(() => ({ rows: [{}] })),
    query(
      `SELECT COUNT(*)::int AS segments,
              COALESCE(SUM(member_count),0)::int AS memberships
       FROM customer_segments`,
    ).catch(() => ({ rows: [{}] })),
    query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE UPPER(COALESCE(status,'')) IN ('QUALIFIED','REWARDED','COMPLETED'))::int AS successful,
         COUNT(*) FILTER (WHERE UPPER(COALESCE(status,'')) IN ('REGISTERED','PENDING','FRAUD_REVIEW'))::int AS pending,
         COUNT(*) FILTER (WHERE UPPER(COALESCE(status,'')) IN ('REJECTED','BLOCKED'))::int AS rejected
       FROM referrals`,
    ).catch(() => ({ rows: [{}] })),
    query(
      `SELECT UPPER(COALESCE(tier,'BRONZE')) AS tier, COUNT(*)::int AS cnt
       FROM user_loyalty
       GROUP BY 1
       ORDER BY 1`,
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT
         COUNT(*)::int AS grants,
         COUNT(DISTINCT user_id)::int AS users,
         COALESCE(SUM(freebet_amount),0)::float AS issued,
         COALESCE(SUM(freebet_amount) FILTER (WHERE UPPER(status)='USED'),0)::float AS consumed,
         COALESCE(SUM(freebet_amount) FILTER (WHERE UPPER(status)='EXPIRED'),0)::float AS expired,
         COALESCE(SUM(deposit_amount),0)::float AS deposits_linked
       FROM deposit_freebet_grants`,
    ).catch(() => ({ rows: [{}] })),
    query(
      `SELECT COUNT(*)::int AS open_blocks
       FROM promo_abuse_alerts
       WHERE UPPER(COALESCE(status,'')) = 'OPEN'`,
    ).catch(() => ({ rows: [{}] })),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE UPPER(offer_email_status)='SENT')::int AS emails_sent,
         COUNT(*) FILTER (WHERE UPPER(offer_email_status)='FAILED')::int AS emails_failed,
         COUNT(DISTINCT user_id)::int AS users_targeted
       FROM deposit_freebet_campaign_users`,
    ).catch(() => ({ rows: [{}] })),
  ]);

  const c = campaigns.rows[0] || {};
  const s = segments.rows[0] || {};
  const r = referrals.rows[0] || {};
  const f = freebet.rows[0] || {};
  const a = abuse.rows[0] || {};
  const e = emails.rows[0] || {};
  const totalRef = n(r.total);
  const successful = n(r.successful);

  return {
    success: true,
    source: 'database',
    kpis: {
      activeCampaigns: n(c.active_campaigns),
      targetedCampaigns: n(c.targeted_campaigns),
      totalPromotions: n(c.total_promotions),
      segments: n(s.segments),
      segmentMemberships: n(s.memberships),
      usersTargeted: n(e.users_targeted),
      emailsSent: n(e.emails_sent),
      emailsFailed: n(e.emails_failed),
      freebetGrants: n(f.grants),
      freebetUsers: n(f.users),
      freebetIssued: n(f.issued),
      freebetConsumed: n(f.consumed),
      freebetExpired: n(f.expired),
      depositsLinkedToFreebet: n(f.deposits_linked),
      claimConversion: n(e.users_targeted) > 0
        ? Number((n(f.users) / n(e.users_targeted)).toFixed(3))
        : null,
      referralTotal: totalRef,
      referralSuccessful: successful,
      referralPending: n(r.pending),
      referralRejected: n(r.rejected),
      referralConversion: totalRef > 0 ? Number((successful / totalRef).toFixed(3)) : null,
      promoAbuseOpen: n(a.open_blocks),
      vipDistribution: (vip.rows || []).map((row) => ({
        tier: row.tier,
        count: n(row.cnt),
      })),
      vipUsers: (vip.rows || []).reduce((sum, row) => sum + n(row.cnt), 0),
    },
    notes: [
      'claimConversion = freebet grant users / targeted assignment users (where assignments exist)',
      'Gross gaming revenue / NGR for campaigns: N/A in this dashboard — see promo-roi attribution',
      'All figures from live tables; no fabricated ROI',
    ],
  };
}
