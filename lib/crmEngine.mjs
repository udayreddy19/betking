/**
 * CRM & Customer Segmentation Engine — BetKing Enterprise Platform
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

// ============================================================
// PG-BACKED CUSTOMER SEGMENTATION
// ============================================================

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

  const res = await query(`
    INSERT INTO customer_segments (id, name, description, rules, auto_evaluate, created_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (name) DO UPDATE SET
      description = EXCLUDED.description,
      rules = EXCLUDED.rules,
      auto_evaluate = EXCLUDED.auto_evaluate,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id;
  `, [id, name, description, JSON.stringify(rules), autoEvaluate, createdBy]);

  const actualId = res.rows.length > 0 ? res.rows[0].id : id;
  return { success: true, segmentId: actualId, name };
}

/**
 * Add a user to a customer segment.
 */
export async function addUserToSegment(userId, segmentId) {
  await query(`
    INSERT INTO user_segment_memberships (user_id, segment_id)
    VALUES ($1, $2)
    ON CONFLICT (user_id, segment_id) DO NOTHING;
  `, [userId, segmentId]);

  // Update member count
  await query(`
    UPDATE customer_segments
    SET member_count = (SELECT COUNT(*) FROM user_segment_memberships WHERE segment_id = $1)
    WHERE id = $1;
  `, [segmentId]);

  return { success: true, userId, segmentId };
}

/**
 * Get all segments for a user.
 */
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

/**
 * Get all customer segments with member counts.
 */
export async function getAllCustomerSegments() {
  const res = await query(`
    SELECT id, name, description, rules, auto_evaluate, member_count, created_by, created_at, updated_at
    FROM customer_segments
    ORDER BY name;
  `);
  return { success: true, count: res.rows.length, segments: res.rows };
}

/**
 * Evaluate a user against segment rules and auto-assign.
 * Returns list of segments the user qualifies for.
 */
export async function evaluateUserSegments(userId, { totalBets = 0, totalDeposits = 0, totalStake = 0, kycStatus = 'NOT_STARTED', favoriteSport = null } = {}) {
  const qualifiedSegments = [];

  // Built-in segment rules
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
    if (rule.check()) {
      qualifiedSegments.push(rule.name);
    }
  }

  return { success: true, userId, qualifiedSegments };
}
