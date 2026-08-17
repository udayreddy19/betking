/**
 * Enterprise Central Feature Flag Store — OddsYra Sportsbook (lib/featureStore.mjs)
 * 
 * PG-backed feature flags with tenant scoping, user segment targeting,
 * percentage rollout, environment awareness, and audit trail.
 * 
 * Also retains in-memory match feature cache for sports engine compatibility.
 */

import { query } from '../db/pg.js';

// ============================================================
// MATCH FEATURE CACHE (Retained for sports engine compatibility)
// ============================================================
const FEATURE_CACHE = new Map();

export function upsertMatchFeatures(matchId, features = {}) {
  if (!matchId) throw new Error('upsertMatchFeatures requires matchId');

  const existing = FEATURE_CACHE.get(matchId) || {
    matchId,
    homeElo: 1500,
    awayElo: 1500,
    expectedGoalsHome: 1.45,
    expectedGoalsAway: 1.15,
    expectedRunsHome: 165.0,
    expectedRunsAway: 155.0,
    homeLineupRating: 80.0,
    awayLineupRating: 80.0,
    homeRecentForm: [0.8, 0.6, 1.0, 0.4, 0.8],
    awayRecentForm: [1.0, 0.8, 0.8, 1.0, 0.6],
    weatherImpactFactor: 0.0,
    venuePitchRating: 0.5,
    homeInjuriesCount: 0,
    awayInjuriesCount: 0,
    refereeRating: 0.5,
    inPlayMomentumIndex: 0.0,
    homeTravelKm: 0,
    awayTravelKm: 0,
    homeFatigueIndex: 0.0,
    awayFatigueIndex: 0.0,
    updatedAt: new Date().toISOString(),
  };

  const updated = { ...existing, ...features, updatedAt: new Date().toISOString() };
  FEATURE_CACHE.set(matchId, updated);
  return updated;
}

export function getMatchFeatures(matchId) {
  return FEATURE_CACHE.get(matchId) || upsertMatchFeatures(matchId);
}

export function clearMatchFeatures(matchId) {
  return FEATURE_CACHE.delete(matchId);
}

// ============================================================
// FEATURE FLAGS SYSTEM (PG-backed)
// ============================================================

/**
 * Create or update a feature flag.
 */
export async function upsertFeatureFlag({
  flagKey,
  name,
  description = null,
  enabled = false,
  rolloutPercentage = 100,
  tenantScope = [],
  userSegmentScope = [],
  environment = 'all',
  updatedBy = 'admin',
  reason = null,
}) {
  const id = `ff_${flagKey.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

  const existing = await query(`SELECT id, enabled FROM feature_flags WHERE flag_key = $1;`, [flagKey]);

  if (existing.rows.length > 0) {
    const previousEnabled = existing.rows[0].enabled;

    await query(`
      UPDATE feature_flags
      SET name = $2, description = $3, enabled = $4, rollout_percentage = $5,
          tenant_scope = $6, user_segment_scope = $7, environment = $8,
          updated_by = $9, updated_at = CURRENT_TIMESTAMP
      WHERE flag_key = $1;
    `, [flagKey, name, description, enabled, rolloutPercentage,
        JSON.stringify(tenantScope), JSON.stringify(userSegmentScope), environment, updatedBy]);

    // Audit trail
    await query(`
      INSERT INTO feature_flag_audit (flag_id, flag_key, previous_enabled, new_enabled, changed_by, reason)
      VALUES ($1, $2, $3, $4, $5, $6);
    `, [existing.rows[0].id, flagKey, previousEnabled, enabled, updatedBy, reason]);
  } else {
    await query(`
      INSERT INTO feature_flags (id, flag_key, name, description, enabled, rollout_percentage, tenant_scope, user_segment_scope, environment, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);
    `, [id, flagKey, name, description, enabled, rolloutPercentage,
        JSON.stringify(tenantScope), JSON.stringify(userSegmentScope), environment, updatedBy]);

    // Initial audit
    await query(`
      INSERT INTO feature_flag_audit (flag_id, flag_key, previous_enabled, new_enabled, changed_by, reason)
      VALUES ($1, $2, NULL, $3, $4, $5);
    `, [id, flagKey, enabled, updatedBy, reason || 'Initial creation']);
  }

  return { success: true, flagKey, enabled, rolloutPercentage, environment };
}

/**
 * Check if a feature flag is enabled for a given context.
 */
export async function isFeatureEnabled(flagKey, { tenantId = 'tenant_default', userId = null, segment = null } = {}) {
  const res = await query(`SELECT enabled, rollout_percentage, tenant_scope, user_segment_scope, environment FROM feature_flags WHERE flag_key = $1;`, [flagKey]);

  if (res.rows.length === 0) return false;

  const flag = res.rows[0];
  if (!flag.enabled) return false;

  // Tenant scope check
  const tenantScope = flag.tenant_scope || [];
  if (Array.isArray(tenantScope) && tenantScope.length > 0 && !tenantScope.includes(tenantId)) {
    return false;
  }

  // User segment scope check
  const segmentScope = flag.user_segment_scope || [];
  if (Array.isArray(segmentScope) && segmentScope.length > 0 && segment && !segmentScope.includes(segment)) {
    return false;
  }

  // Rollout percentage check (deterministic hash based on userId)
  if (flag.rollout_percentage < 100 && userId) {
    const hash = Array.from(userId).reduce((acc, c) => acc + c.charCodeAt(0), 0) % 100;
    if (hash >= flag.rollout_percentage) return false;
  }

  return true;
}

/**
 * Get all feature flags.
 */
export async function getAllFeatureFlags() {
  const res = await query(`
    SELECT id, flag_key, name, description, enabled, rollout_percentage, tenant_scope, user_segment_scope, environment, updated_by, updated_at
    FROM feature_flags
    ORDER BY flag_key;
  `);
  return { success: true, count: res.rows.length, flags: res.rows };
}

/**
 * Get feature flag audit history.
 */
export async function getFeatureFlagAudit(flagKey, limit = 50) {
  const res = await query(`
    SELECT flag_key, previous_enabled, new_enabled, changed_by, reason, created_at
    FROM feature_flag_audit
    WHERE flag_key = $1
    ORDER BY created_at DESC
    LIMIT $2;
  `, [flagKey, limit]);
  return { success: true, flagKey, count: res.rows.length, history: res.rows };
}
