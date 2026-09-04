/**
 * CRM & Customer Segmentation Engine — OddsYra Enterprise Platform
 *
 * PG-backed configurable customer segments with rule evaluation.
 * Drives CRM, notifications, promotions, personalization, and analytics.
 */

import { query } from '../db/pg.js';

class CrmEngine {
  constructor() {
    this.userPreferences = new Map();
  }

  setCommunicationPreferences(userId, { allowMarketing = false, allowTransactional = true, channel = 'IN_APP' } = {}) {
    const prefs = {
      userId,
      allowMarketing,
      allowTransactional,
      preferredChannel: channel,
      updatedAt: new Date().toISOString(),
    };
    this.userPreferences.set(userId, prefs);
    return prefs;
  }

  getCommunicationPreferences(userId) {
    return this.userPreferences.get(userId) || { allowMarketing: false, allowTransactional: true, preferredChannel: 'IN_APP' };
  }

  segmentUser({ totalBetsCount = 0, totalDepositAmount = 0, kycStatus = 'NOT_STARTED' }) {
    if (totalDepositAmount > 100000) return 'HIGH_VALUE_BETTOR';
    if (totalBetsCount > 20) return 'ACTIVE_BETTOR';
    if (kycStatus === 'VERIFIED') return 'VERIFIED_USER';
    return 'NEW_USER';
  }
}

export const crmEngine = new CrmEngine();

const BUILTIN_RULE_PRESETS = {
  NEW: { conditions: [{ field: 'total_deposits', operator: '=', value: 0 }, { field: 'total_bets', operator: '=', value: 0 }], match: 'all' },
  ACTIVE: { conditions: [{ field: 'total_bets', operator: '>=', value: 5 }, { field: 'days_since_login', operator: '<=', value: 14 }], match: 'all' },
  INACTIVE: { conditions: [{ field: 'days_since_login', operator: '>=', value: 30 }], match: 'all' },
  HIGH_VALUE: { conditions: [{ field: 'total_deposits', operator: '>=', value: 100000 }], match: 'all' },
  VIP: { conditions: [{ field: 'vip_tier', operator: 'in', value: ['GOLD', 'PLATINUM', 'DIAMOND'] }], match: 'all' },
  VIP_USERS: { conditions: [{ field: 'vip_tier', operator: 'in', value: ['GOLD', 'PLATINUM', 'DIAMOND'] }], match: 'all' },
  HIGH_DEPOSIT_USERS: { conditions: [{ field: 'total_deposits', operator: '>=', value: 50000 }], match: 'all' },
  HIGH_TURNOVER_USERS: { conditions: [{ field: 'total_stake', operator: '>=', value: 100000 }], match: 'all' },
  KYC_PENDING: { conditions: [{ field: 'kyc_status', operator: 'not_in', value: ['VERIFIED', 'APPROVED'] }], match: 'all' },
  KYC_VERIFIED: { conditions: [{ field: 'kyc_status', operator: 'in', value: ['VERIFIED', 'APPROVED'] }], match: 'all' },
  REFERRAL: { conditions: [{ field: 'is_referral', operator: '=', value: true }], match: 'all' },
  REFERRAL_USERS: { conditions: [{ field: 'is_referral', operator: '=', value: true }], match: 'all' },
  PROMO_USERS: { conditions: [{ field: 'promo_claims', operator: '>=', value: 1 }], match: 'all' },
  HIGH_RISK: { conditions: [{ field: 'risk_tier', operator: 'in', value: ['HIGH', 'HIGH_RISK', 'CRITICAL'] }], match: 'all' },
  AT_RISK_USERS: { conditions: [{ field: 'risk_tier', operator: 'in', value: ['HIGH', 'HIGH_RISK', 'CRITICAL'] }], match: 'all' },
  RECENT_DEPOSIT: { conditions: [{ field: 'days_since_deposit', operator: '<=', value: 7 }], match: 'all' },
  RECENT_WITHDRAWAL: { conditions: [{ field: 'days_since_withdrawal', operator: '<=', value: 7 }], match: 'all' },
  NEVER_DEPOSITED: { conditions: [{ field: 'total_deposits', operator: '=', value: 0 }], match: 'all' },
  DEPOSITED_NEVER_BET: { conditions: [{ field: 'total_deposits', operator: '>', value: 0 }, { field: 'total_bets', operator: '=', value: 0 }], match: 'all' },
  STOPPED_BETTING: { conditions: [{ field: 'total_bets', operator: '>=', value: 1 }, { field: 'days_since_login', operator: '>=', value: 14 }], match: 'all' },
  HIGH_DEPOSIT_INACTIVE: {
    conditions: [
      { field: 'total_deposits', operator: '>=', value: 10000 },
      { field: 'days_since_login', operator: '>=', value: 7 },
      { field: 'kyc_status', operator: 'in', value: ['VERIFIED', 'APPROVED'] },
    ],
    match: 'all',
  },
};

function normalizeRules(raw, segmentName = null) {
  if (raw && typeof raw === 'object' && Array.isArray(raw.conditions) && raw.conditions.length) {
    const first = raw.conditions[0];
    if (first?.type === 'BUILTIN' && first.key && BUILTIN_RULE_PRESETS[String(first.key).toUpperCase()]) {
      return BUILTIN_RULE_PRESETS[String(first.key).toUpperCase()];
    }
    if (first?.type === 'MANUAL' && segmentName && BUILTIN_RULE_PRESETS[String(segmentName).toUpperCase()]) {
      return BUILTIN_RULE_PRESETS[String(segmentName).toUpperCase()];
    }
    if (first?.type === 'MANUAL' || first?.type === 'BUILTIN') {
      return { conditions: [], match: 'all' };
    }
    return {
      conditions: raw.conditions,
      match: String(raw.match || 'all').toLowerCase() === 'any' ? 'any' : 'all',
    };
  }
  const key = String(segmentName || '').toUpperCase();
  if (BUILTIN_RULE_PRESETS[key]) return BUILTIN_RULE_PRESETS[key];
  return { conditions: [], match: 'all' };
}

function compareValue(actual, operator, expected) {
  const op = String(operator || '=').toLowerCase();
  if (op === 'in') {
    const list = Array.isArray(expected) ? expected : String(expected).split(',').map((s) => s.trim());
    return list.map((v) => String(v).toUpperCase()).includes(String(actual ?? '').toUpperCase());
  }
  if (op === 'not_in') {
    const list = Array.isArray(expected) ? expected : String(expected).split(',').map((s) => s.trim());
    return !list.map((v) => String(v).toUpperCase()).includes(String(actual ?? '').toUpperCase());
  }
  if (typeof expected === 'boolean' || expected === true || expected === false || expected === 'true' || expected === 'false') {
    const expBool = expected === true || expected === 'true';
    const actBool = actual === true || actual === 'true' || actual === 1 || actual === '1';
    if (op === '!=' || op === '<>') return actBool !== expBool;
    return actBool === expBool;
  }
  const aNum = Number(actual);
  const eNum = Number(expected);
  const bothNumeric = Number.isFinite(aNum) && Number.isFinite(eNum)
    && String(expected).trim() !== ''
    && !Number.isNaN(aNum);
  if (bothNumeric && ['>=', '<=', '>', '<', '=', '==', '!=', '<>'].includes(op)) {
    if (op === '>=') return aNum >= eNum;
    if (op === '<=') return aNum <= eNum;
    if (op === '>') return aNum > eNum;
    if (op === '<') return aNum < eNum;
    if (op === '!=' || op === '<>') return aNum !== eNum;
    return aNum === eNum;
  }
  const aStr = String(actual ?? '').toUpperCase();
  const eStr = String(expected ?? '').toUpperCase();
  if (op === '!=' || op === '<>') return aStr !== eStr;
  return aStr === eStr;
}

async function loadUserSegmentStats(userIds = null) {
  const params = [];
  let where = '';
  if (Array.isArray(userIds) && userIds.length) {
    params.push(userIds);
    where = 'WHERE u.user_id = ANY($1)';
  }
  const res = await query(
    `SELECT
       u.user_id,
       u.email,
       COALESCE(u.first_name, '') AS first_name,
       UPPER(COALESCE(p.kyc_status, 'NOT_STARTED')) AS kyc_status,
       UPPER(COALESCE(p.account_status, 'ACTIVE')) AS account_status,
       UPPER(COALESCE(p.risk_tier, 'LOW_RISK')) AS risk_tier,
       UPPER(COALESCE(ul.tier, 'BRONZE')) AS vip_tier,
       COALESCE(dep.total_deposits, 0)::float AS total_deposits,
       COALESCE(bet.total_bets, 0)::int AS total_bets,
       COALESCE(bet.total_stake, 0)::float AS total_stake,
       COALESCE(promo.promo_claims, 0)::int AS promo_claims,
       CASE WHEN ref.referred_user_id IS NOT NULL THEN true ELSE false END AS is_referral,
       CASE
         WHEN u.last_login_at IS NULL THEN 9999
         ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - u.last_login_at)) / 86400))::int
       END AS days_since_login,
       CASE
         WHEN dep.last_deposit_at IS NULL THEN 9999
         ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - dep.last_deposit_at)) / 86400))::int
       END AS days_since_deposit,
       CASE
         WHEN wd.last_withdrawal_at IS NULL THEN 9999
         ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - wd.last_withdrawal_at)) / 86400))::int
       END AS days_since_withdrawal
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.user_id
     LEFT JOIN user_loyalty ul ON ul.user_id = u.user_id
     LEFT JOIN (
       SELECT user_id,
              COALESCE(SUM(amount),0) AS total_deposits,
              MAX(created_at) AS last_deposit_at
       FROM deposits
       WHERE UPPER(COALESCE(status,'')) IN ('PAID','CAPTURED','COMPLETED','SUCCESS')
       GROUP BY user_id
     ) dep ON dep.user_id = u.user_id
     LEFT JOIN (
       SELECT user_id,
              COUNT(*)::int AS total_bets,
              COALESCE(SUM(stake),0) AS total_stake
       FROM bets
       GROUP BY user_id
     ) bet ON bet.user_id = u.user_id
     LEFT JOIN (
       SELECT user_id, COUNT(*)::int AS promo_claims
       FROM user_bonuses
       GROUP BY user_id
     ) promo ON promo.user_id = u.user_id
     LEFT JOIN (
       SELECT user_id, MAX(created_at) AS last_withdrawal_at
       FROM withdrawals
       GROUP BY user_id
     ) wd ON wd.user_id = u.user_id
     LEFT JOIN (
       SELECT DISTINCT referred_user_id FROM referrals
     ) ref ON ref.referred_user_id = u.user_id
     ${where}
     ORDER BY u.created_at DESC
     LIMIT 5000`,
    params,
  );
  return res.rows;
}

function userMatchesRules(stats, rules) {
  const normalized = normalizeRules(rules);
  const conditions = normalized.conditions || [];
  if (!conditions.length) return false;
  const results = conditions.map((c) => {
    const field = String(c.field || c.key || '').toLowerCase();
    const actual = stats[field];
    return compareValue(actual, c.operator || c.op || '=', c.value);
  });
  return normalized.match === 'any' ? results.some(Boolean) : results.every(Boolean);
}

/**
 * Create a configurable customer segment with rule conditions.
 */
export async function createCustomerSegment({
  name,
  description = null,
  rules = { conditions: [] },
  autoEvaluate = true,
  createdBy = 'admin',
}) {
  const id = `seg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const segName = String(name || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (!segName) {
    throw Object.assign(new Error('Segment name required'), { status: 400, code: 'INVALID_NAME' });
  }
  const normalized = normalizeRules(rules, segName);

  const res = await query(`
    INSERT INTO customer_segments (id, name, description, rules, auto_evaluate, created_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (name) DO UPDATE SET
      description = EXCLUDED.description,
      rules = EXCLUDED.rules,
      auto_evaluate = EXCLUDED.auto_evaluate,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id;
  `, [id, segName, description, JSON.stringify(normalized), autoEvaluate, createdBy]);

  const actualId = res.rows.length > 0 ? res.rows[0].id : id;
  return { success: true, segmentId: actualId, name: segName };
}

export async function addUserToSegment(userId, segmentId) {
  await query(`
    INSERT INTO user_segment_memberships (user_id, segment_id)
    VALUES ($1, $2)
    ON CONFLICT (user_id, segment_id) DO NOTHING;
  `, [userId, segmentId]);

  await query(`
    UPDATE customer_segments
    SET member_count = (SELECT COUNT(*) FROM user_segment_memberships WHERE segment_id = $1),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1;
  `, [segmentId]);

  return { success: true, userId, segmentId };
}

export async function getUserSegments(userId) {
  const res = await query(`
    SELECT cs.id, cs.name, cs.description, usm.joined_at
    FROM user_segment_memberships usm
    JOIN customer_segments cs ON cs.id = usm.segment_id
    WHERE usm.user_id = $1
    ORDER BY usm.joined_at DESC;
  `, [userId]);
  return { success: true, userId, count: res.rows.length, segments: res.rows };
}

export async function getAllCustomerSegments() {
  const res = await query(`
    SELECT id, name, description, rules, auto_evaluate, member_count, created_by, created_at, updated_at
    FROM customer_segments
    ORDER BY name;
  `);
  return { success: true, count: res.rows.length, segments: res.rows };
}

export async function getCustomerSegment(segmentId) {
  const res = await query(
    `SELECT id, name, description, rules, auto_evaluate, member_count, created_by, created_at, updated_at
     FROM customer_segments WHERE id = $1 OR name = $1 LIMIT 1`,
    [segmentId],
  );
  return res.rows[0] || null;
}

/**
 * Preview users matching a segment (or ad-hoc rules). Does not write memberships.
 */
export async function previewCustomerSegment({ segmentId = null, rules = null, limit = 50 } = {}) {
  let segment = null;
  let evalRules = rules;
  if (segmentId) {
    segment = await getCustomerSegment(segmentId);
    if (!segment) {
      throw Object.assign(new Error('Segment not found'), { status: 404, code: 'NOT_FOUND' });
    }
    evalRules = segment.rules;
  }
  const normalized = normalizeRules(evalRules, segment?.name);
  if (!normalized.conditions.length) {
    return {
      success: true,
      segmentId: segment?.id || null,
      matched: 0,
      sample: [],
      rules: normalized,
      note: 'No evaluable conditions — add rule fields or use a builtin preset',
    };
  }

  const statsRows = await loadUserSegmentStats();
  const matched = statsRows.filter((row) => userMatchesRules(row, normalized));
  const sample = matched.slice(0, Math.min(100, Math.max(1, Number(limit) || 50))).map((r) => ({
    id: r.user_id,
    email: r.email,
    name: r.first_name || r.email || r.user_id,
    kyc: r.kyc_status,
    vipTier: r.vip_tier,
    totalDeposits: r.total_deposits,
  }));
  return {
    success: true,
    segmentId: segment?.id || null,
    matched: matched.length,
    sample,
    rules: normalized,
  };
}

/**
 * Recompute memberships for one segment from live user stats.
 */
export async function refreshCustomerSegmentMemberships(segmentId) {
  const segment = await getCustomerSegment(segmentId);
  if (!segment) {
    throw Object.assign(new Error('Segment not found'), { status: 404, code: 'NOT_FOUND' });
  }
  const normalized = normalizeRules(segment.rules, segment.name);
  if (!normalized.conditions.length) {
    await query(`DELETE FROM user_segment_memberships WHERE segment_id = $1`, [segment.id]);
    await query(
      `UPDATE customer_segments SET member_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [segment.id],
    );
    return { success: true, segmentId: segment.id, matched: 0, assigned: 0 };
  }

  const statsRows = await loadUserSegmentStats();
  const matchedIds = statsRows.filter((row) => userMatchesRules(row, normalized)).map((r) => r.user_id);

  await query(`DELETE FROM user_segment_memberships WHERE segment_id = $1`, [segment.id]);
  let assigned = 0;
  for (const userId of matchedIds.slice(0, 20000)) {
    await query(
      `INSERT INTO user_segment_memberships (user_id, segment_id) VALUES ($1, $2)
       ON CONFLICT (user_id, segment_id) DO NOTHING`,
      [userId, segment.id],
    );
    assigned += 1;
  }
  await query(
    `UPDATE customer_segments
     SET member_count = (SELECT COUNT(*) FROM user_segment_memberships WHERE segment_id = $1),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [segment.id],
  );
  return { success: true, segmentId: segment.id, matched: matchedIds.length, assigned };
}

export async function listSegmentMemberIds(segmentId, { limit = 5000 } = {}) {
  const segment = await getCustomerSegment(segmentId);
  if (!segment) {
    throw Object.assign(new Error('Segment not found'), { status: 404, code: 'NOT_FOUND' });
  }
  const res = await query(
    `SELECT user_id FROM user_segment_memberships
     WHERE segment_id = $1
     ORDER BY joined_at DESC
     LIMIT $2`,
    [segment.id, Math.min(5000, Math.max(1, Number(limit) || 5000))],
  );
  return {
    success: true,
    segmentId: segment.id,
    name: segment.name,
    userIds: res.rows.map((r) => r.user_id),
  };
}

/**
 * Paginated member browser with masked email for admin UI.
 */
export async function listSegmentMembers(segmentId, { limit = 50, offset = 0 } = {}) {
  const segment = await getCustomerSegment(segmentId);
  if (!segment) {
    throw Object.assign(new Error('Segment not found'), { status: 404, code: 'NOT_FOUND' });
  }
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const res = await query(
    `SELECT usm.user_id, usm.joined_at,
            LEFT(SPLIT_PART(COALESCE(u.email,''), '@', 1), 3) || '***' AS email_mask,
            UPPER(COALESCE(p.kyc_status, 'NOT_STARTED')) AS kyc_status,
            UPPER(COALESCE(ul.tier, 'BRONZE')) AS vip_tier
     FROM user_segment_memberships usm
     LEFT JOIN users u ON u.user_id = usm.user_id
     LEFT JOIN user_profiles p ON p.user_id = usm.user_id
     LEFT JOIN user_loyalty ul ON ul.user_id = usm.user_id
     WHERE usm.segment_id = $1
     ORDER BY usm.joined_at DESC
     LIMIT $2 OFFSET $3`,
    [segment.id, safeLimit, safeOffset],
  );
  const countRes = await query(
    `SELECT COUNT(*)::int AS c FROM user_segment_memberships WHERE segment_id = $1`,
    [segment.id],
  );
  return {
    success: true,
    segmentId: segment.id,
    name: segment.name,
    total: Number(countRes.rows[0]?.c || 0),
    members: (res.rows || []).map((r) => ({
      userId: r.user_id,
      emailMask: r.email_mask,
      kycStatus: r.kyc_status,
      vipTier: r.vip_tier,
      joinedAt: r.joined_at,
    })),
  };
}

export async function updateCustomerSegment(segmentId, {
  name = null,
  description = undefined,
  rules = null,
  autoEvaluate = undefined,
} = {}) {
  const segment = await getCustomerSegment(segmentId);
  if (!segment) {
    throw Object.assign(new Error('Segment not found'), { status: 404, code: 'NOT_FOUND' });
  }
  const nextName = name != null
    ? String(name).trim().toUpperCase().replace(/\s+/g, '_')
    : segment.name;
  if (!nextName) {
    throw Object.assign(new Error('Segment name required'), { status: 400, code: 'INVALID_NAME' });
  }
  const nextRules = rules != null ? normalizeRules(rules, nextName) : segment.rules;
  const nextDesc = description === undefined ? segment.description : description;
  const nextAuto = autoEvaluate === undefined ? segment.auto_evaluate : Boolean(autoEvaluate);
  const res = await query(
    `UPDATE customer_segments SET
       name = $1,
       description = $2,
       rules = $3::jsonb,
       auto_evaluate = $4,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING id, name, description, rules, auto_evaluate, member_count, created_by, created_at, updated_at`,
    [nextName, nextDesc, JSON.stringify(nextRules), nextAuto, segment.id],
  );
  return { success: true, segment: res.rows[0] };
}

export async function deleteCustomerSegment(segmentId) {
  const segment = await getCustomerSegment(segmentId);
  if (!segment) {
    throw Object.assign(new Error('Segment not found'), { status: 404, code: 'NOT_FOUND' });
  }
  await query(`DELETE FROM customer_segments WHERE id = $1`, [segment.id]);
  return { success: true, segmentId: segment.id };
}

/**
 * Evaluate a user against built-in + optional provided stats (legacy API).
 * Also syncs matching DB segments that auto_evaluate.
 */
export async function evaluateUserSegments(userId, {
  totalBets = 0,
  totalDeposits = 0,
  totalStake = 0,
  kycStatus = 'NOT_STARTED',
  favoriteSport = null,
} = {}) {
  const qualifiedSegments = [];
  const builtInRules = [
    { name: 'NEW_USER', check: () => totalBets === 0 && totalDeposits === 0 },
    { name: 'ACTIVE_BETTOR', check: () => totalBets > 20 },
    { name: 'HIGH_VALUE', check: () => totalDeposits > 100000 },
    { name: 'VIP', check: () => totalDeposits > 500000 },
    { name: 'CRICKET_USER', check: () => favoriteSport === 'CRICKET' },
    { name: 'FOOTBALL_USER', check: () => favoriteSport === 'FOOTBALL' },
    { name: 'INACTIVE', check: () => totalBets === 0 && totalDeposits > 0 },
    { name: 'HIGH_RISK', check: () => totalStake > 250000 },
  ];
  for (const rule of builtInRules) {
    if (rule.check()) qualifiedSegments.push(rule.name);
  }

  // Also evaluate stored auto segments for this user when possible
  try {
    const statsRows = await loadUserSegmentStats([userId]);
    const stats = statsRows[0];
    if (stats) {
      const segs = await getAllCustomerSegments();
      for (const seg of segs.segments || []) {
        if (!seg.auto_evaluate) continue;
        if (userMatchesRules(stats, seg.rules)) {
          if (!qualifiedSegments.includes(seg.name)) qualifiedSegments.push(seg.name);
          await addUserToSegment(userId, seg.id);
        }
      }
    }
  } catch {
    // keep legacy built-in result if PG path fails
  }

  return { success: true, userId, qualifiedSegments };
}

export { BUILTIN_RULE_PRESETS, normalizeRules, userMatchesRules };
