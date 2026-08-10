/**
 * Enterprise Platform Configuration Engine — BetKing Sportsbook (lib/configEngine.mjs)
 * 
 * PG-backed centralized configuration with RBAC, audit trail, versioning, and validation.
 * Categories: GENERAL, BETTING, RISK, PAYMENT, SUPPORT, PROMOTIONS, RESPONSIBLE_GAMING, NOTIFICATION
 */

import { query } from '../db/pg.js';

// In-memory cache for fast reads
const CONFIG_CACHE = new Map();

const MASTER_PLATFORM_CONFIG = {
  platformName: 'BetKing Sportsbook',
  version: '2.0.0-ENTERPRISE',
  defaultTheme: 'dark',
  defaultLanguage: 'en',
  defaultCurrency: 'INR',
  apiRateLimitPerMin: 120,
  globalMarginPct: 5.0,
  cacheTTL: {
    liveScoresSeconds: 3,
    oddsSeconds: 5,
    userProfilesSeconds: 60,
  },
  featureFlags: {
    enableBetBuilder: true,
    enableLiveCashout: true,
    enablePartialCashout: true,
    enableAutoCashout: true,
    enableResponsibleGaming: true,
    enableAABTesting: true,
  },
  updatedAt: new Date().toISOString(),
};

export function getMasterPlatformConfig() {
  return MASTER_PLATFORM_CONFIG;
}

export function updateFeatureFlag(flagKey, enabled) {
  if (flagKey in MASTER_PLATFORM_CONFIG.featureFlags) {
    MASTER_PLATFORM_CONFIG.featureFlags[flagKey] = !!enabled;
    MASTER_PLATFORM_CONFIG.updatedAt = new Date().toISOString();
    return MASTER_PLATFORM_CONFIG.featureFlags;
  }
  return null;
}

/**
 * Set a configuration value in PostgreSQL with audit trail.
 */
export async function setConfig({
  configKey,
  configValue,
  category = 'GENERAL',
  description = null,
  isSensitive = false,
  requiresMakerChecker = false,
  tenantId = 'tenant_default',
  changedBy = 'admin',
  reason = null,
}) {
  const id = `cfg_${configKey.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

  // Check existing for versioning
  const existing = await query(`SELECT id, version, config_value FROM platform_config WHERE config_key = $1;`, [configKey]);

  let version = 1;
  let previousValue = null;

  if (existing.rows.length > 0) {
    version = existing.rows[0].version + 1;
    previousValue = existing.rows[0].config_value;

    await query(`
      UPDATE platform_config
      SET config_value = $2, category = $3, description = $4, is_sensitive = $5,
          requires_maker_checker = $6, version = $7, tenant_id = $8, updated_by = $9, updated_at = CURRENT_TIMESTAMP
      WHERE config_key = $1;
    `, [configKey, JSON.stringify(configValue), category, description, isSensitive, requiresMakerChecker, version, tenantId, changedBy]);
  } else {
    await query(`
      INSERT INTO platform_config (id, config_key, config_value, category, description, is_sensitive, requires_maker_checker, version, tenant_id, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);
    `, [id, configKey, JSON.stringify(configValue), category, description, isSensitive, requiresMakerChecker, version, tenantId, changedBy]);
  }

  // Audit trail
  await query(`
    INSERT INTO platform_config_audit (config_id, config_key, previous_value, new_value, changed_by, reason, version)
    VALUES ($1, $2, $3, $4, $5, $6, $7);
  `, [existing.rows[0]?.id || id, configKey, previousValue ? JSON.stringify(previousValue) : null, JSON.stringify(configValue), changedBy, reason, version]);

  // Update cache
  CONFIG_CACHE.set(configKey, configValue);

  return { success: true, configKey, version, category };
}

/**
 * Get a configuration value (cache-first, PG fallback).
 */
export async function getConfig(configKey) {
  if (CONFIG_CACHE.has(configKey)) {
    return { success: true, configKey, value: CONFIG_CACHE.get(configKey), source: 'CACHE' };
  }

  const res = await query(`SELECT config_value, version, category FROM platform_config WHERE config_key = $1;`, [configKey]);
  if (res.rows.length === 0) return { success: false, configKey, value: null };

  const value = res.rows[0].config_value;
  CONFIG_CACHE.set(configKey, value);

  return { success: true, configKey, value, version: res.rows[0].version, category: res.rows[0].category, source: 'DATABASE' };
}

/**
 * Get all configuration by category.
 */
export async function getConfigByCategory(category) {
  const res = await query(`
    SELECT id, config_key, config_value, category, description, is_sensitive, requires_maker_checker, version, tenant_id, updated_by, updated_at
    FROM platform_config
    WHERE category = $1
    ORDER BY config_key;
  `, [category]);

  // Mask sensitive values
  const configs = res.rows.map(row => ({
    ...row,
    config_value: row.is_sensitive ? '[SENSITIVE]' : row.config_value,
  }));

  return { success: true, category, count: configs.length, configs };
}

/**
 * Get configuration audit history.
 */
export async function getConfigAuditHistory(configKey, limit = 50) {
  const res = await query(`
    SELECT config_key, previous_value, new_value, changed_by, reason, version, created_at
    FROM platform_config_audit
    WHERE config_key = $1
    ORDER BY created_at DESC
    LIMIT $2;
  `, [configKey, limit]);
  return { success: true, configKey, count: res.rows.length, history: res.rows };
}

/**
 * Get all configuration keys (summary view).
 */
export async function getAllConfigSummary() {
  const res = await query(`
    SELECT config_key, category, is_sensitive, requires_maker_checker, version, updated_by, updated_at
    FROM platform_config
    ORDER BY category, config_key;
  `);
  return { success: true, count: res.rows.length, configs: res.rows };
}
