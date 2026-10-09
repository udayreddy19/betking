/**
 * ProductConfigService — Admin-controlled Wallet / Betting product toggles.
 * PostgreSQL is authoritative. In-process cache with short TTL + invalidation.
 * Disabling a product blocks new user access; it does not delete data or
 * cancel in-flight financial/settlement processing.
 */

import { query } from '../db/pg.js';

const CACHE_MS = 3000;
const DEFAULTS = { walletEnabled: true, bettingEnabled: true };

let cache = { at: 0, config: null };
let testOverride = null;

export function invalidateProductConfigCache() {
  cache = { at: 0, config: null };
}

/** Test-only: override product state without touching PG. */
export function setProductConfigForTests({ walletEnabled, bettingEnabled } = {}) {
  if (walletEnabled === undefined && bettingEnabled === undefined) {
    testOverride = null;
  } else {
    testOverride = {
      walletEnabled: walletEnabled !== false,
      bettingEnabled: bettingEnabled !== false,
      updatedAt: new Date().toISOString(),
      updatedBy: 'test',
    };
  }
  invalidateProductConfigCache();
}

export function clearProductConfigForTests() {
  testOverride = null;
  invalidateProductConfigCache();
}

function normalizeRow(row) {
  if (!row) return { ...DEFAULTS, updatedAt: null, updatedBy: null };
  return {
    walletEnabled: row.wallet_enabled !== false && row.walletEnabled !== false,
    bettingEnabled: row.betting_enabled !== false && row.bettingEnabled !== false,
    updatedAt: row.updated_at || row.updatedAt || null,
    updatedBy: row.updated_by || row.updatedBy || null,
  };
}

async function loadFromDb() {
  try {
    const res = await query(
      `SELECT wallet_enabled, betting_enabled, updated_by, updated_at
       FROM product_configuration
       WHERE id = 1
       LIMIT 1`,
    );
    if (!res.rows?.length) {
      await query(
        `INSERT INTO product_configuration (id, wallet_enabled, betting_enabled)
         VALUES (1, TRUE, TRUE)
         ON CONFLICT (id) DO NOTHING`,
      );
      return { ...DEFAULTS, updatedAt: null, updatedBy: null };
    }
    return normalizeRow(res.rows[0]);
  } catch (err) {
    // Table may not exist yet during early boot / pre-migration.
    if (String(err?.message || '').includes('product_configuration')
      || err?.code === '42P01') {
      return { ...DEFAULTS, updatedAt: null, updatedBy: null };
    }
    throw err;
  }
}

export async function getProductConfiguration() {
  if (testOverride) return { ...testOverride };
  const now = Date.now();
  if (cache.config && now - cache.at < CACHE_MS) {
    return { ...cache.config };
  }
  const config = await loadFromDb();
  cache = { at: now, config };
  return { ...config };
}

export async function isWalletEnabled() {
  const cfg = await getProductConfiguration();
  return cfg.walletEnabled !== false;
}

export async function isBettingEnabled() {
  const cfg = await getProductConfiguration();
  return cfg.bettingEnabled !== false;
}

/**
 * Throws PRODUCT_DISABLED when the product is off.
 * @param {'wallet'|'betting'} product
 */
export async function assertProductEnabled(product) {
  const key = String(product || '').toLowerCase();
  const enabled = key === 'wallet'
    ? await isWalletEnabled()
    : key === 'betting'
      ? await isBettingEnabled()
      : true;
  if (enabled) return;
  const err = new Error('This product is currently unavailable.');
  err.code = 'PRODUCT_DISABLED';
  err.product = key;
  err.status = 403;
  throw err;
}

/**
 * Update product toggles. Never deletes product data.
 * Returns { previous, current, historyId }.
 */
export async function updateProductConfiguration({
  walletEnabled,
  bettingEnabled,
  updatedBy,
  reason = null,
  correlationId = null,
  ipAddress = null,
} = {}) {
  if (typeof walletEnabled !== 'boolean' || typeof bettingEnabled !== 'boolean') {
    const err = new Error('walletEnabled and bettingEnabled must be booleans');
    err.code = 'INVALID_PRODUCT_CONFIG';
    err.status = 400;
    throw err;
  }

  const previous = await getProductConfiguration();

  const res = await query(
    `INSERT INTO product_configuration (id, wallet_enabled, betting_enabled, updated_by, updated_at, created_at)
     VALUES (1, $1, $2, $3, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET
       wallet_enabled = EXCLUDED.wallet_enabled,
       betting_enabled = EXCLUDED.betting_enabled,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING wallet_enabled, betting_enabled, updated_by, updated_at`,
    [walletEnabled, bettingEnabled, updatedBy || null],
  );

  const current = normalizeRow(res.rows[0]);

  let action = 'PRODUCT_CONFIGURATION_CHANGED';
  if (previous.walletEnabled !== current.walletEnabled) {
    action = current.walletEnabled ? 'WALLET_ENABLED' : 'WALLET_DISABLED';
  }
  if (previous.bettingEnabled !== current.bettingEnabled) {
    const bettingAction = current.bettingEnabled ? 'BETTING_ENABLED' : 'BETTING_DISABLED';
    action = previous.walletEnabled !== current.walletEnabled
      ? 'PRODUCT_CONFIGURATION_CHANGED'
      : bettingAction;
  }

  let historyId = null;
  try {
    const hist = await query(
      `INSERT INTO product_configuration_history (
         wallet_enabled, betting_enabled,
         previous_wallet_enabled, previous_betting_enabled,
         action, reason, changed_by, correlation_id, ip_address
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        current.walletEnabled,
        current.bettingEnabled,
        previous.walletEnabled,
        previous.bettingEnabled,
        action,
        reason,
        updatedBy || null,
        correlationId || null,
        ipAddress || null,
      ],
    );
    historyId = hist.rows?.[0]?.id || null;
  } catch {
    // History table optional during rollout
  }

  invalidateProductConfigCache();

  return { previous, current, action, historyId };
}

export async function getProductConfigurationHistory({ limit = 50 } = {}) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  try {
    const res = await query(
      `SELECT id, wallet_enabled, betting_enabled,
              previous_wallet_enabled, previous_betting_enabled,
              action, reason, changed_by, created_at
       FROM product_configuration_history
       ORDER BY created_at DESC
       LIMIT $1`,
      [safeLimit],
    );
    return (res.rows || []).map((r) => ({
      id: r.id,
      walletEnabled: r.wallet_enabled,
      bettingEnabled: r.betting_enabled,
      previousWalletEnabled: r.previous_wallet_enabled,
      previousBettingEnabled: r.previous_betting_enabled,
      action: r.action,
      reason: r.reason,
      changedBy: r.changed_by,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export async function broadcastProductConfigChanged(config) {
  try {
    const { broadcastProductConfig } = await import('./websocketEngine.mjs');
    broadcastProductConfig(config);
  } catch {
    // WS optional
  }
}
