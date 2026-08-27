/**
 * Promotion Abuse Protection — PG-backed signals + alerts.
 * Preserves referral/signup exclusivity in referralLoyaltyEngine / signupPromoCodes.
 * Does not invent liability numbers; liability summary is real aggregates or N/A.
 */

import { query } from '../db/pg.js';
import crypto from 'crypto';

function alertId() {
  return `paa_${crypto.randomBytes(8).toString('hex')}`;
}

function levelFromScore(score) {
  if (score >= 80) return 'CRITICAL';
  if (score >= 55) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

/**
 * Evaluate promotion claim risk from existing tables only.
 * @param {object} [opts.exec] - optional query fn / client.query for in-transaction use
 */
export async function evaluatePromotionEligibility(userId, {
  promoCode = null,
  promotionId = null,
  deviceHash = null,
  ipAddress = null,
  exec = null,
} = {}) {
  const run = typeof exec === 'function' ? exec : (exec?.query ? exec.query.bind(exec) : query);
  const signals = [];
  let score = 0;

  // Existing exclusivity: referral vs signup promo
  try {
    const { userHasReferralAttribution, userHasActiveSignupPromo } = await import('./referralLoyaltyEngine.mjs');
    if (await userHasReferralAttribution(userId, run)) {
      score += 15;
      signals.push({ rule: 'HAS_REFERRAL_ATTRIBUTION', weight: 15 });
    }
    if (await userHasActiveSignupPromo(userId, run)) {
      score += 20;
      signals.push({ rule: 'HAS_ACTIVE_SIGNUP_PROMO', weight: 20 });
    }
  } catch {
    /* engines optional in some test contexts */
  }

  // Multi-claim same promo
  if (promoCode || promotionId) {
    const claims = await run(
      `SELECT COUNT(*)::int AS cnt
       FROM user_bonuses ub
       LEFT JOIN promotions p ON p.id = ub.promotion_id
       WHERE ub.user_id = $1
         AND (
           ($2::text IS NOT NULL AND UPPER(COALESCE(p.code,'')) = UPPER($2))
           OR ($3::text IS NOT NULL AND ub.promotion_id = $3)
         )`,
      [userId, promoCode || null, promotionId || null],
    ).catch(() => ({ rows: [{ cnt: 0 }] }));
    if (Number(claims.rows[0]?.cnt || 0) > 0) {
      score += 50;
      signals.push({ rule: 'DUPLICATE_PROMO_CLAIM', weight: 50 });
    }
  }

  // Device cluster (existing fingerprints)
  if (deviceHash) {
    const others = await run(
      `SELECT COUNT(DISTINCT user_id)::int AS cnt
       FROM device_fingerprints
       WHERE device_hash = $1 AND user_id <> $2`,
      [deviceHash, userId],
    ).catch(() => ({ rows: [{ cnt: 0 }] }));
    const n = Number(others.rows[0]?.cnt || 0);
    if (n >= 2) {
      score += 35;
      signals.push({ rule: 'DEVICE_MULTI_ACCOUNT', weight: 35, detail: n });
    } else if (n === 1) {
      score += 20;
      signals.push({ rule: 'DEVICE_SHARED', weight: 20, detail: n });
    }
  }

  // IP reuse velocity (login/audit if available)
  if (ipAddress) {
    const ipUsers = await run(
      `SELECT COUNT(DISTINCT actor_id)::int AS cnt
       FROM audit_events
       WHERE details->>'ip' = $1
         AND created_at > NOW() - INTERVAL '24 hours'`,
      [String(ipAddress)],
    ).catch(() => ({ rows: [{ cnt: 0 }] }));
    if (Number(ipUsers.rows[0]?.cnt || 0) >= 5) {
      score += 25;
      signals.push({ rule: 'IP_VELOCITY', weight: 25, detail: ipUsers.rows[0].cnt });
    }
  }

  // Rapid deposit → freebet grant pattern
  const rapid = await run(
    `SELECT COUNT(*)::int AS cnt
     FROM deposit_freebet_grants g
     JOIN deposits d ON d.deposit_id = g.deposit_id
     WHERE g.user_id = $1
       AND g.created_at > NOW() - INTERVAL '24 hours'
       AND d.created_at > NOW() - INTERVAL '24 hours'`,
    [userId],
  ).catch(() => ({ rows: [{ cnt: 0 }] }));
  if (Number(rapid.rows[0]?.cnt || 0) >= 3) {
    score += 30;
    signals.push({ rule: 'RAPID_FREEBET_GRANTS', weight: 30 });
  }

  score = Math.min(100, score);
  const level = levelFromScore(score);
  const isEligible = score < 75 && !signals.some((s) => s.rule === 'DUPLICATE_PROMO_CLAIM');

  return {
    userId,
    promoCode,
    promotionId,
    isEligible,
    abuseRiskScore: score,
    riskLevel: level,
    signals,
    action: score >= 75 ? 'BLOCK_PROMOTION' : (score >= 55 ? 'FLAG_REVIEW' : 'ALLOW_PROMOTION'),
    evaluatedAt: new Date().toISOString(),
  };
}

function buildEventKey({ userId, promoCode, promotionId, depositId = null, context = 'claim' }) {
  const parts = [
    context,
    userId || 'u',
    String(promoCode || promotionId || 'promo').toUpperCase(),
    depositId || 'nodep',
  ];
  return parts.join(':').slice(0, 160);
}

export async function recordPromoAbuseAlert({
  userId,
  promoCode = null,
  promotionId = null,
  evaluation,
  notes = null,
  depositId = null,
  context = 'claim',
  exec = null,
} = {}) {
  if (!evaluation || Number(evaluation.abuseRiskScore || 0) < 30) {
    return { recorded: false };
  }
  const run = typeof exec === 'function' ? exec : (exec?.query ? exec.query.bind(exec) : query);
  const id = alertId();
  const eventKey = buildEventKey({ userId, promoCode, promotionId, depositId, context });
  const ruleKey = evaluation.signals?.[0]?.rule || 'PROMO_ABUSE';
  try {
    await run(
      `INSERT INTO promo_abuse_alerts (
         alert_id, user_id, promotion_code, promotion_id, rule_key,
         risk_score, risk_level, signals, status, notes, event_key
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'OPEN',$9,$10)
       ON CONFLICT (event_key) WHERE event_key IS NOT NULL AND status = 'OPEN' DO NOTHING`,
      [
        id,
        userId,
        promoCode,
        promotionId,
        ruleKey,
        evaluation.abuseRiskScore,
        evaluation.riskLevel,
        JSON.stringify(evaluation.signals || []),
        notes,
        eventKey,
      ],
    );
  } catch {
    // Fallback without event_key / unique index
    await run(
      `INSERT INTO promo_abuse_alerts (
         alert_id, user_id, promotion_code, promotion_id, rule_key,
         risk_score, risk_level, signals, status, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'OPEN',$9)`,
      [
        id,
        userId,
        promoCode,
        promotionId,
        ruleKey,
        evaluation.abuseRiskScore,
        evaluation.riskLevel,
        JSON.stringify(evaluation.signals || []),
        notes,
      ],
    ).catch(() => null);
  }

  // Fail-safe ops notification — never blocks promo claim path
  import('./opsAlertEngine.mjs')
    .then(({ raiseOpsAlert }) => raiseOpsAlert({
      title: 'Promotion abuse detected',
      message: `User ${userId} · ${ruleKey} · score ${evaluation.abuseRiskScore}`,
      severity: Number(evaluation.abuseRiskScore) >= 70 ? 'HIGH' : 'WARNING',
      category: 'PROMOTION',
      source: 'promotionAbuseEngine',
      entityType: 'promo_abuse_alert',
      entityId: id,
      dedupeKey: `promo_abuse:${eventKey || id}`,
      actionType: 'REVIEW_PROMO_ABUSE',
      actionTargetType: 'promo_abuse_alert',
      actionTargetId: id,
      actionLabel: 'Review',
      metadata: { userId, promoCode, promotionId, riskLevel: evaluation.riskLevel },
      soft: true,
    }))
    .catch(() => null);

  return { recorded: true, alertId: id, eventKey };
}

/**
 * Hot-path guard: evaluate + alert; throw on BLOCK without granting value.
 * Does not create wallet/ledger entries.
 */
export async function assertPromoAbuseAllowsClaim(userId, opts = {}) {
  const evaluation = await evaluatePromotionEligibility(userId, opts);
  if (evaluation.action === 'FLAG_REVIEW' || evaluation.action === 'BLOCK_PROMOTION') {
    await recordPromoAbuseAlert({
      userId,
      promoCode: opts.promoCode || null,
      promotionId: opts.promotionId || null,
      depositId: opts.depositId || null,
      context: opts.context || 'claim',
      evaluation,
      notes: opts.notes || `action=${evaluation.action}`,
      exec: opts.exec || null,
    });
  }
  if (evaluation.action === 'BLOCK_PROMOTION' || !evaluation.isEligible) {
    const top = evaluation.signals?.[0]?.rule || 'PROMO_ABUSE';
    throw Object.assign(
      new Error(`Promotion claim blocked by abuse protection (${top}).`),
      {
        code: 'PROMO_ABUSE_BLOCKED',
        status: 403,
        evaluation,
      },
    );
  }
  return evaluation;
}

export async function listPromoAbuseAlerts({ limit = 100, status = null } = {}) {
  const params = [];
  let where = '';
  if (status) {
    params.push(String(status).toUpperCase());
    where = `WHERE status = $${params.length}`;
  }
  params.push(Math.min(200, Math.max(1, Number(limit) || 100)));
  const res = await query(
    `SELECT a.*, LEFT(SPLIT_PART(COALESCE(u.email,''), '@', 1), 3) || '***' AS user_mask
     FROM promo_abuse_alerts a
     LEFT JOIN users u ON u.user_id = a.user_id
     ${where}
     ORDER BY a.created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return { success: true, alerts: res.rows };
}

export async function resolvePromoAbuseAlert(alertId, {
  status = 'RESOLVED',
  adminId = null,
  notes = null,
} = {}) {
  const next = String(status || 'RESOLVED').toUpperCase();
  if (!['ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'].includes(next)) {
    throw Object.assign(new Error('Invalid status'), { status: 400 });
  }
  const res = await query(
    `UPDATE promo_abuse_alerts SET
       status = $1,
       notes = COALESCE($2, notes),
       resolved_by = $3,
       resolved_at = NOW(),
       updated_at = NOW()
     WHERE alert_id = $4
     RETURNING *`,
    [next, notes, adminId, alertId],
  );
  if (!res.rows[0]) throw Object.assign(new Error('Alert not found'), { status: 404 });
  return { success: true, alert: res.rows[0] };
}

export async function getPromotionLiabilitySummary() {
  try {
    const bonus = await query(
      `SELECT
         COALESCE(SUM(bonus_amount),0)::float AS total_issued,
         COALESCE(SUM(bonus_amount) FILTER (WHERE UPPER(status) IN ('ACTIVE','COMPLETED','RELEASED')),0)::float AS total_claimed,
         COALESCE(SUM(bonus_amount) FILTER (WHERE UPPER(status) IN ('ACTIVE','PENDING')),0)::float AS total_pending
       FROM user_bonuses`,
    );
    const freebet = await query(
      `SELECT COALESCE(SUM(freebet_amount),0)::float AS freebet_issued
       FROM deposit_freebet_grants`,
    ).catch(() => ({ rows: [{ freebet_issued: 0 }] }));
    const b = bonus.rows[0] || {};
    return {
      totalIssued: Number(b.total_issued || 0),
      totalClaimed: Number(b.total_claimed || 0),
      totalPending: Number(b.total_pending || 0),
      freebetIssued: Number(freebet.rows[0]?.freebet_issued || 0),
      actualCost: Number(b.total_claimed || 0) + Number(freebet.rows[0]?.freebet_issued || 0),
      projectedMaxLiability: null,
      note: 'projectedMaxLiability N/A — not fabricated',
      source: 'user_bonuses + deposit_freebet_grants',
    };
  } catch (err) {
    return {
      totalIssued: null,
      totalClaimed: null,
      totalPending: null,
      actualCost: null,
      projectedMaxLiability: null,
      error: err.message,
      note: 'N/A',
    };
  }
}

class PromotionAbuseEngine {
  evaluatePromotionEligibility(userId, promoCode = 'WELCOME100') {
    return evaluatePromotionEligibility(userId, { promoCode });
  }

  getPromotionLiabilitySummary() {
    return getPromotionLiabilitySummary();
  }
}

export const promotionAbuseEngine = new PromotionAbuseEngine();
