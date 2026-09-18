/**
 * Referral growth extras: clicks, milestones, share links, leaderboard, notifications.
 */

import crypto from 'crypto';
import { query, withTransaction } from '../db/pg.js';
import {
  getReferralProgramConfig,
  refreshReferralProgramConfig,
  rewardKindLabel,
  normalizeReferralCode,
  referralLinkFromCode,
} from './referralLoyaltyEngine.mjs';
import { logger } from './logger.mjs';

function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 32);
}

export async function recordReferralClick({
  referralCode,
  ipAddress = null,
  userAgent = null,
  landingPath = '/register',
} = {}) {
  const code = normalizeReferralCode(referralCode);
  if (!code) return { recorded: false, reason: 'empty' };

  let referrerUserId = null;
  try {
    const row = await query(
      `SELECT user_id FROM referral_codes WHERE code = $1 AND status = 'ACTIVE' LIMIT 1`,
      [code],
    );
    referrerUserId = row.rows[0]?.user_id || null;
  } catch { /* ignore */ }

  try {
    await query(
      `INSERT INTO referral_clicks (referral_code, referrer_user_id, ip_hash, user_agent, landing_path)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        code,
        referrerUserId,
        hashIp(ipAddress),
        String(userAgent || '').slice(0, 512) || null,
        String(landingPath || '/register').slice(0, 256),
      ],
    );
  } catch (err) {
    // Table may not exist until migration — soft-fail
    logger.warn('referral_click_record_failed', { error: err.message });
    return { recorded: false, reason: err.message };
  }
  return { recorded: true, code, referrerUserId };
}

export function buildReferralShareAssets(code, {
  referredReward = 500,
  rewardLabel = 'Free Bet',
  playCommissionRatePct = 5,
} = {}) {
  const link = referralLinkFromCode(code);
  if (!link) return null;
  const text = `🏏 Join me on OddsYra — claim ₹${referredReward} ${rewardLabel} with my invite (live cricket + UPI). I also earn ${playCommissionRatePct}% when you play. Tap: ${link}`;
  const encoded = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(link);
  const short = `₹${referredReward} ${rewardLabel} on OddsYra — live cricket betting. Claim here:`;
  return {
    link,
    code,
    message: text,
    whatsapp: `https://api.whatsapp.com/send?text=${encoded}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(short)}`,
    qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodedUrl}`,
    ogTitle: `You're invited — ₹${referredReward} ${rewardLabel} on OddsYra`,
    ogDescription: `Claim ₹${referredReward} ${rewardLabel}. Live cricket, UPI deposits. 18+ only.`,
  };
}

export async function maybeGrantReferralMilestones(referrerUserId) {
  if (!referrerUserId) return { granted: [] };
  await refreshReferralProgramConfig();
  const conf = getReferralProgramConfig();
  const milestones = conf.milestones || [];
  if (!milestones.length) return { granted: [] };

  const countRes = await query(
    `SELECT COUNT(*)::int AS c FROM referrals
     WHERE referrer_user_id = $1 AND status = 'REWARDED'`,
    [referrerUserId],
  );
  const successful = Number(countRes.rows[0]?.c || 0);
  const granted = [];

  for (const m of milestones) {
    if (successful < m.count) continue;
    const mid = `rm_${referrerUserId}_${m.count}`;
    try {
      const result = await withTransaction(async (client) => {
        const exists = await client.query(
          `SELECT id FROM referral_milestone_grants WHERE referrer_user_id = $1 AND milestone = $2`,
          [referrerUserId, m.count],
        );
        if (exists.rows[0]) return null;

        // Credit via a synthetic referral event row if possible — direct wallet credit
        let walletRes = await client.query(
          `SELECT wallet_id, COALESCE(freebet_balance,0) AS freebet_balance,
                  COALESCE(bonus_balance,0) AS bonus_balance
           FROM wallets WHERE user_id = $1 FOR UPDATE`,
          [referrerUserId],
        );
        if (!walletRes.rows[0]) {
          await client.query(
            `INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, freebet_balance, currency)
             VALUES ($1, $2, 0, 0, 0, 'INR') ON CONFLICT (user_id) DO NOTHING`,
            [`wal_${referrerUserId}`, referrerUserId],
          );
          walletRes = await client.query(
            `SELECT wallet_id, COALESCE(freebet_balance,0) AS freebet_balance,
                    COALESCE(bonus_balance,0) AS bonus_balance
             FROM wallets WHERE user_id = $1 FOR UPDATE`,
            [referrerUserId],
          );
        }
        if (!walletRes.rows[0]) return null;

        const kind = conf.rewardKind === 'bonus' ? 'bonus' : 'freebet';
        const amt = Number(m.amount) || 0;
        if (amt <= 0) return null;
        const txId = `tx_ref_ms_${crypto.randomBytes(10).toString('hex')}`;
        const field = kind === 'bonus' ? 'bonus_balance' : 'freebet_balance';
        const next = Number(walletRes.rows[0][field] || 0) + amt;
        await client.query(
          `UPDATE wallets SET ${field} = $1, updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2`,
          [next, walletRes.rows[0].wallet_id],
        );
        await client.query(
          `INSERT INTO transactions (transaction_id, user_id, type, method, amount, status)
           VALUES ($1, $2, 'BONUS_CLAIM', 'REFERRAL_MILESTONE', $3, 'COMPLETED')`,
          [txId, referrerUserId, amt],
        );
        await client.query(
          `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
           VALUES ($1, $2, 'CREDIT', $3, $4, $5)`,
          [walletRes.rows[0].wallet_id, txId, amt, next, `Referral milestone ${m.count} invites`],
        );
        await client.query(
          `INSERT INTO referral_milestone_grants (id, referrer_user_id, milestone, amount, reward_kind, transaction_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [mid, referrerUserId, m.count, amt, kind, txId],
        );
        return { milestone: m.count, amount: amt, kind };
      });
      if (result) granted.push(result);
    } catch (err) {
      logger.warn('referral_milestone_grant_failed', { referrerUserId, milestone: m.count, error: err.message });
    }
  }
  return { granted, successful };
}

export async function getReferralLeaderboard({ limit = 20 } = {}) {
  const res = await query(
    `SELECT
       r.referrer_user_id,
       MAX(COALESCE(u.first_name, SPLIT_PART(COALESCE(u.email,''), '@', 1), r.referrer_user_id)) AS name,
       MAX(rc.code) AS code,
       COUNT(*) FILTER (WHERE r.status = 'REWARDED')::int AS rewarded,
       COUNT(*)::int AS invited,
       COALESCE(SUM(r.referrer_reward_amount) FILTER (WHERE r.status = 'REWARDED'), 0)::float AS signup_earned
     FROM referrals r
     LEFT JOIN users u ON u.user_id = r.referrer_user_id
     LEFT JOIN referral_codes rc ON rc.user_id = r.referrer_user_id
     GROUP BY r.referrer_user_id
     ORDER BY rewarded DESC, invited DESC
     LIMIT $1`,
    [Math.min(100, Math.max(1, Number(limit) || 20))],
  );
  return { leaders: res.rows || [] };
}

export async function getReferralFunnelAnalytics({ from = null, to = null } = {}) {
  const params = [];
  const clauses = [];
  let idx = 1;
  if (from) {
    clauses.push(`created_at >= $${idx}::timestamptz`);
    params.push(new Date(from).toISOString());
    idx += 1;
  }
  if (to) {
    clauses.push(`created_at <= $${idx}::timestamptz`);
    params.push(new Date(to).toISOString());
    idx += 1;
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  let clicks = { rows: [{ c: 0 }] };
  try {
    clicks = await query(
      `SELECT COUNT(*)::int AS c FROM referral_clicks ${where}`,
      params,
    );
  } catch { /* migration pending */ }

  const signups = await query(
    `SELECT COUNT(*)::int AS c FROM referrals ${where.replace(/created_at/g, 'created_at')}`,
    params,
  );
  const deposits = await query(
    `SELECT COUNT(DISTINCT r.referred_user_id)::int AS c
     FROM referrals r
     JOIN deposits d ON d.user_id = r.referred_user_id
       AND UPPER(COALESCE(d.status,'')) IN ('PAID','CAPTURED','COMPLETED','SUCCESS')
     ${from || to ? `WHERE r.created_at >= COALESCE($1::timestamptz, '-infinity'::timestamptz)
       AND r.created_at <= COALESCE($2::timestamptz, 'infinity'::timestamptz)` : ''}`,
    from || to ? [from ? new Date(from).toISOString() : null, to ? new Date(to).toISOString() : null] : [],
  ).catch(() => ({ rows: [{ c: 0 }] }));

  const bets = await query(
    `SELECT COUNT(DISTINCT r.referred_user_id)::int AS c
     FROM referrals r
     JOIN bets b ON b.user_id = r.referred_user_id
       AND LOWER(COALESCE(b.fund_source,'cash')) = 'cash'
     ${from || to ? `WHERE r.created_at >= COALESCE($1::timestamptz, '-infinity'::timestamptz)
       AND r.created_at <= COALESCE($2::timestamptz, 'infinity'::timestamptz)` : ''}`,
    from || to ? [from ? new Date(from).toISOString() : null, to ? new Date(to).toISOString() : null] : [],
  ).catch(() => ({ rows: [{ c: 0 }] }));

  const rewarded = await query(
    `SELECT COUNT(*)::int AS c FROM referrals
     WHERE status = 'REWARDED' ${from ? 'AND created_at >= $1::timestamptz' : ''}
       ${to ? `AND created_at <= $${from ? 2 : 1}::timestamptz` : ''}`,
    [from && new Date(from).toISOString(), to && new Date(to).toISOString()].filter(Boolean),
  );

  // Cohort LTV: referred vs organic (avg net stakes approx)
  const cohort = await query(
    `WITH referred AS (
       SELECT DISTINCT referred_user_id AS user_id FROM referrals
     ),
     user_ggr AS (
       SELECT b.user_id,
              COALESCE(SUM(b.stake) FILTER (WHERE UPPER(b.status) IN ('LOST','WON','SETTLED')), 0)
              - COALESCE(SUM(b.actual_payout) FILTER (WHERE UPPER(b.status) IN ('WON','SETTLED')), 0) AS ggr
       FROM bets b
       WHERE LOWER(COALESCE(b.fund_source,'cash')) = 'cash'
       GROUP BY b.user_id
     )
     SELECT
       'referred'::text AS cohort,
       COUNT(*)::int AS users,
       COALESCE(AVG(g.ggr), 0)::float AS avg_ggr
     FROM referred r
     LEFT JOIN user_ggr g ON g.user_id = r.user_id
     UNION ALL
     SELECT
       'organic'::text,
       COUNT(*)::int,
       COALESCE(AVG(g.ggr), 0)::float
     FROM users u
     LEFT JOIN referred r ON r.user_id = u.user_id
     LEFT JOIN user_ggr g ON g.user_id = u.user_id
     WHERE r.user_id IS NULL`,
  ).catch(() => ({ rows: [] }));

  return {
    funnel: {
      clicks: Number(clicks.rows[0]?.c || 0),
      signups: Number(signups.rows[0]?.c || 0),
      deposited: Number(deposits.rows[0]?.c || 0),
      bettors: Number(bets.rows[0]?.c || 0),
      rewarded: Number(rewarded.rows[0]?.c || 0),
    },
    cohorts: cohort.rows || [],
  };
}

export async function expireStaleReferralAttributions({ batchSize = 100 } = {}) {
  const res = await query(
    `UPDATE referrals
     SET status = 'REJECTED', qualification_status = 'FAILED', reward_status = 'FAILED',
         metadata = COALESCE(metadata, '{}'::jsonb) || '{"reason":"attribution_expired"}'::jsonb,
         updated_at = NOW()
     WHERE id IN (
       SELECT id FROM referrals
       WHERE expires_at IS NOT NULL
         AND expires_at < NOW()
         AND status IN ('REGISTERED', 'FRAUD_REVIEW')
         AND COALESCE(reward_status, '') <> 'GRANTED'
       ORDER BY expires_at ASC
       LIMIT $1
     )
     RETURNING id`,
    [Math.min(500, Math.max(1, Number(batchSize) || 100))],
  ).catch(() => ({ rows: [] }));
  return { expired: res.rows?.length || 0, ids: (res.rows || []).map((r) => r.id) };
}

/** Best-effort push / in-app style notify (email if available). */
export async function notifyReferralProgress({ referrerUserId, referredUserId, kind = 'signup' } = {}) {
  try {
    const { sendReferralRewardEmail } = await import('../server/auth/emailService.js');
    const conf = getReferralProgramConfig();
    const u = await query(
      `SELECT user_id, email, first_name FROM users WHERE user_id = $1`,
      [referrerUserId],
    );
    const referrer = u.rows[0];
    if (!referrer?.email) return { sent: false };
    if (kind === 'signup') {
      await sendReferralRewardEmail({
        email: referrer.email,
        name: referrer.first_name,
        amount: 0,
        role: 'referrer_progress',
        note: `Your invite ${referredUserId || 'friend'} just signed up. Rewards unlock after deposit${conf.requireKyc ? ' + KYC' : ''}.`,
      }).catch(() => null);
    }
    return { sent: true };
  } catch {
    return { sent: false };
  }
}

export { rewardKindLabel };
