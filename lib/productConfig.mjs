/**
 * ProductConfigService — Admin-controlled Wallet / Betting / PG review toggles.
 * PostgreSQL is authoritative. In-process cache with short TTL + invalidation.
 * Disabling a product blocks new user access; it does not delete data or
 * cancel in-flight financial/settlement processing.
 *
 * pgReviewMode (PG compliance): when ON, effective betting is OFF.
 * Wallet stays available so deposits / money pill still work during gateway review.
 */

import { query } from '../db/pg.js';

const CACHE_MS = 3000;
const DEFAULTS = {
  walletEnabled: true,
  bettingEnabled: true,
  pgReviewMode: false,
  softwarePlatformEnabled: false,
  softwarePlatformName: '',
};

const SOFTWARE_NAME_MAX = 120;

export function normalizeSoftwarePlatformName(raw) {
  if (raw == null) return '';
  const s = String(raw).trim().replace(/\s+/g, ' ');
  return s.slice(0, SOFTWARE_NAME_MAX);
}

let softwareColumnEnsured = false;
let walletRestoreEnsured = false;

/**
 * Idempotent schema upgrade for the Software Platform public-site toggle.
 * Runs once per process on the load path so no separate migration step is required.
 */
async function ensureSoftwarePlatformColumn() {
  if (softwareColumnEnsured) return;
  try {
    await query(
      `ALTER TABLE product_configuration
         ADD COLUMN IF NOT EXISTS software_platform_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
    );
    await query(
      `ALTER TABLE product_configuration
         ADD COLUMN IF NOT EXISTS pre_software_betting_enabled BOOLEAN,
         ADD COLUMN IF NOT EXISTS pre_software_pg_review_mode BOOLEAN`,
    );
    await query(
      `ALTER TABLE product_configuration
         ADD COLUMN IF NOT EXISTS software_platform_name VARCHAR(120)`,
    );
    softwareColumnEnsured = true;
  } catch {
    // Table may not exist yet pre-migration; retry on next load.
  }
}

/**
 * One-shot restore of the header money pill / Add Money UI.
 * Earlier builds hard-forced wallet_enabled=FALSE; flip it back once, then leave
 * subsequent admin toggles alone.
 */
async function ensureWalletProductRestored() {
  if (walletRestoreEnsured) return;
  try {
    await query(
      `ALTER TABLE product_configuration
         ADD COLUMN IF NOT EXISTS wallet_ui_restored BOOLEAN NOT NULL DEFAULT FALSE`,
    );
    await query(
      `UPDATE product_configuration
       SET wallet_enabled = TRUE,
           wallet_ui_restored = TRUE,
           updated_at = NOW(),
           updated_by = COALESCE(NULLIF(updated_by, ''), 'wallet_ui_restore')
       WHERE id = 1
         AND wallet_ui_restored IS DISTINCT FROM TRUE`,
    );
    walletRestoreEnsured = true;
  } catch {
    // Table may not exist yet pre-migration; retry on next load.
  }
}

/** True only when admin turned Betting off while PG mode was off (not PG suppression). */
function explicitBettingOff(config) {
  return config.pgReviewMode !== true && config.bettingStored === false;
}

/** Value restored when Software Platform is turned off (default sportsbook ON). */
function snapshotBettingForSoftwareRestore(config) {
  return explicitBettingOff(config) ? false : true;
}

let cache = { at: 0, config: null };
let testOverride = null;

export function invalidateProductConfigCache() {
  cache = { at: 0, config: null };
}

/** Test-only: override product state without touching PG. */
export function setProductConfigForTests({
  walletEnabled,
  bettingEnabled,
  pgReviewMode,
  softwarePlatformEnabled,
  softwarePlatformName,
} = {}) {
  if (
    walletEnabled === undefined
    && bettingEnabled === undefined
    && pgReviewMode === undefined
    && softwarePlatformEnabled === undefined
    && softwarePlatformName === undefined
  ) {
    testOverride = null;
  } else {
    testOverride = applyEffective({
      walletEnabled: walletEnabled !== false,
      bettingEnabled: bettingEnabled !== false,
      pgReviewMode: pgReviewMode === true,
      softwarePlatformEnabled: softwarePlatformEnabled === true,
      softwarePlatformName: normalizeSoftwarePlatformName(softwarePlatformName),
      updatedAt: new Date().toISOString(),
      updatedBy: 'test',
    });
  }
  invalidateProductConfigCache();
}

export function clearProductConfigForTests() {
  testOverride = null;
  invalidateProductConfigCache();
}

function normalizeRow(row) {
  if (!row) return applyEffective({ ...DEFAULTS, updatedAt: null, updatedBy: null });
  return applyEffective({
    walletEnabled: row.wallet_enabled !== false && row.walletEnabled !== false,
    bettingEnabled: row.betting_enabled !== false && row.bettingEnabled !== false,
    pgReviewMode: row.pg_review_mode === true || row.pgReviewMode === true,
    softwarePlatformEnabled:
      row.software_platform_enabled === true || row.softwarePlatformEnabled === true,
    softwarePlatformName: normalizeSoftwarePlatformName(
      row.software_platform_name ?? row.softwarePlatformName,
    ),
    updatedAt: row.updated_at || row.updatedAt || null,
    updatedBy: row.updated_by || row.updatedBy || null,
  });
}

/** Effective access used by APIs + public config (PG review / software overrides). */
export function applyEffective(config) {
  const pgReviewMode = config.pgReviewMode === true;
  const softwarePlatformEnabled = config.softwarePlatformEnabled === true;
  const bettingStored = config.bettingEnabled !== false;
  const walletStored = config.walletEnabled !== false;
  return {
    walletEnabled: walletStored,
    // Software Platform and Betting are mutually exclusive on the public site.
    bettingEnabled: (pgReviewMode || softwarePlatformEnabled) ? false : bettingStored,
    pgReviewMode,
    // Public site shows the standalone Software Platform SPA (independent of betting flags).
    softwarePlatformEnabled,
    softwarePlatformName: normalizeSoftwarePlatformName(config.softwarePlatformName),
    walletStored,
    bettingStored,
    updatedAt: config.updatedAt ?? null,
    updatedBy: config.updatedBy ?? null,
  };
}

async function loadFromDb() {
  await ensureSoftwarePlatformColumn();
  await ensureWalletProductRestored();
  try {
    const res = await query(
      `SELECT wallet_enabled, betting_enabled, pg_review_mode, software_platform_enabled,
              software_platform_name, updated_by, updated_at
       FROM product_configuration
       WHERE id = 1
       LIMIT 1`,
    );
    if (!res.rows?.length) {
      await query(
        `INSERT INTO product_configuration (id, wallet_enabled, betting_enabled, pg_review_mode)
         VALUES (1, TRUE, TRUE, FALSE)
         ON CONFLICT (id) DO NOTHING`,
      );
      return applyEffective({ ...DEFAULTS, updatedAt: null, updatedBy: null });
    }
    return normalizeRow(res.rows[0]);
  } catch (err) {
    // Table / column may not exist yet during early boot / pre-migration.
    const msg = String(err?.message || '');
    if (
      msg.includes('product_configuration')
      || msg.includes('pg_review_mode')
      || msg.includes('software_platform_enabled')
      || err?.code === '42P01'
    ) {
      try {
        const fallback = await query(
          `SELECT wallet_enabled, betting_enabled, updated_by, updated_at
           FROM product_configuration WHERE id = 1 LIMIT 1`,
        );
        if (fallback.rows?.length) {
          return normalizeRow({
            ...fallback.rows[0],
            pg_review_mode: false,
            software_platform_enabled: false,
          });
        }
      } catch {
        /* use defaults */
      }
      return applyEffective({ ...DEFAULTS, updatedAt: null, updatedBy: null });
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

export async function isPgReviewMode() {
  const cfg = await getProductConfiguration();
  return cfg.pgReviewMode === true;
}

/**
 * Throws PRODUCT_DISABLED when the product is off (respects PG review effective flags).
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
  const err = new Error(
    key === 'betting' && (await isPgReviewMode())
      ? 'Betting is unavailable while PG compliance mode is on.'
      : 'This product is currently unavailable.',
  );
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
  pgReviewMode,
  softwarePlatformEnabled,
  softwarePlatformName,
  updatedBy,
  reason = null,
  correlationId = null,
  ipAddress = null,
} = {}) {
  if (walletEnabled !== undefined && typeof walletEnabled !== 'boolean') {
    const err = new Error('walletEnabled must be a boolean');
    err.code = 'INVALID_PRODUCT_CONFIG';
    err.status = 400;
    throw err;
  }
  if (typeof bettingEnabled !== 'boolean') {
    const err = new Error('bettingEnabled must be a boolean');
    err.code = 'INVALID_PRODUCT_CONFIG';
    err.status = 400;
    throw err;
  }
  if (pgReviewMode !== undefined && typeof pgReviewMode !== 'boolean') {
    const err = new Error('pgReviewMode must be a boolean');
    err.code = 'INVALID_PRODUCT_CONFIG';
    err.status = 400;
    throw err;
  }

  if (softwarePlatformEnabled !== undefined && typeof softwarePlatformEnabled !== 'boolean') {
    const err = new Error('softwarePlatformEnabled must be a boolean');
    err.code = 'INVALID_PRODUCT_CONFIG';
    err.status = 400;
    throw err;
  }
  if (softwarePlatformName !== undefined && typeof softwarePlatformName !== 'string') {
    const err = new Error('softwarePlatformName must be a string');
    err.code = 'INVALID_PRODUCT_CONFIG';
    err.status = 400;
    throw err;
  }

  await ensureSoftwarePlatformColumn();
  await ensureWalletProductRestored();
  const previous = await getProductConfiguration();
  const nextSoftware = typeof softwarePlatformEnabled === 'boolean'
    ? softwarePlatformEnabled
    : previous.softwarePlatformEnabled === true;
  const nextSoftwareName = softwarePlatformName !== undefined
    ? normalizeSoftwarePlatformName(softwarePlatformName)
    : normalizeSoftwarePlatformName(previous.softwarePlatformName);
  let nextPg = typeof pgReviewMode === 'boolean' ? pgReviewMode : previous.pgReviewMode === true;

  const enablingSoftware = previous.softwarePlatformEnabled !== true && nextSoftware === true;
  const disablingSoftware = previous.softwarePlatformEnabled === true && nextSoftware === false;

  let preSoftwareBetting = null;
  let preSoftwarePg = null;

  if (enablingSoftware) {
    preSoftwareBetting = snapshotBettingForSoftwareRestore(previous);
    preSoftwarePg = previous.pgReviewMode === true;
  } else if (!disablingSoftware) {
    try {
      const snapRes = await query(
        `SELECT pre_software_betting_enabled, pre_software_pg_review_mode
         FROM product_configuration WHERE id = 1 LIMIT 1`,
      );
      const snapRow = snapRes.rows?.[0];
      preSoftwareBetting = snapRow?.pre_software_betting_enabled ?? null;
      preSoftwarePg = snapRow?.pre_software_pg_review_mode ?? null;
    } catch {
      /* column may not exist yet */
    }
  }

  let nextWallet = typeof walletEnabled === 'boolean'
    ? walletEnabled
    : previous.walletStored !== false;
  let nextBetting = bettingEnabled;

  if (disablingSoftware) {
    // Ignore client PG/betting flags — restore native sportsbook (see history: SOFTWARE_PLATFORM_DISABLED
    // used to persist pg_review_mode=true + betting_enabled=false from the admin UI).
    let snapRow = null;
    try {
      const snapRes = await query(
        `SELECT pre_software_betting_enabled, pre_software_pg_review_mode
         FROM product_configuration WHERE id = 1 LIMIT 1`,
      );
      snapRow = snapRes.rows?.[0] || null;
    } catch {
      snapRow = null;
    }
    const snapBetting = snapRow?.pre_software_betting_enabled;
    nextBetting = snapBetting === false ? false : true;
    nextPg = false;
    preSoftwareBetting = null;
    preSoftwarePg = null;
  } else if (nextPg) {
    nextBetting = false;
  }

  const res = await query(
    `INSERT INTO product_configuration (
       id, wallet_enabled, betting_enabled, pg_review_mode, software_platform_enabled,
       software_platform_name,
       pre_software_betting_enabled, pre_software_pg_review_mode,
       updated_by, updated_at, created_at
     )
     VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET
       wallet_enabled = EXCLUDED.wallet_enabled,
       betting_enabled = EXCLUDED.betting_enabled,
       pg_review_mode = EXCLUDED.pg_review_mode,
       software_platform_enabled = EXCLUDED.software_platform_enabled,
       software_platform_name = EXCLUDED.software_platform_name,
       pre_software_betting_enabled = EXCLUDED.pre_software_betting_enabled,
       pre_software_pg_review_mode = EXCLUDED.pre_software_pg_review_mode,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING wallet_enabled, betting_enabled, pg_review_mode, software_platform_enabled,
               software_platform_name, updated_by, updated_at`,
    [
      nextWallet,
      nextBetting,
      nextPg,
      nextSoftware,
      nextSoftwareName || null,
      preSoftwareBetting,
      preSoftwarePg,
      updatedBy || null,
    ],
  );

  const current = normalizeRow(res.rows[0]);

  let action = 'PRODUCT_CONFIGURATION_CHANGED';
  if (previous.softwarePlatformEnabled !== current.softwarePlatformEnabled) {
    action = current.softwarePlatformEnabled
      ? 'SOFTWARE_PLATFORM_ENABLED'
      : 'SOFTWARE_PLATFORM_DISABLED';
  } else if (previous.pgReviewMode !== current.pgReviewMode) {
    action = current.pgReviewMode ? 'PG_REVIEW_ENABLED' : 'PG_REVIEW_DISABLED';
  } else if (previous.walletStored !== current.walletStored) {
    action = current.walletStored ? 'WALLET_ENABLED' : 'WALLET_DISABLED';
  } else if (previous.bettingStored !== current.bettingStored) {
    action = current.bettingStored ? 'BETTING_ENABLED' : 'BETTING_DISABLED';
  }

  let historyId = null;
  try {
    const hist = await query(
      `INSERT INTO product_configuration_history (
         wallet_enabled, betting_enabled, pg_review_mode,
         previous_wallet_enabled, previous_betting_enabled, previous_pg_review_mode,
         action, reason, changed_by, correlation_id, ip_address
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        current.walletStored,
        current.bettingStored,
        current.pgReviewMode,
        previous.walletStored,
        previous.bettingStored,
        previous.pgReviewMode,
        action,
        reason,
        updatedBy || null,
        correlationId || null,
        ipAddress || null,
      ],
    );
    historyId = hist.rows?.[0]?.id || null;
  } catch {
    // History table optional during rollout / pre-migration
  }

  invalidateProductConfigCache();

  return { previous, current, action, historyId };
}

export async function getProductConfigurationHistory({ limit = 50 } = {}) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  try {
    const res = await query(
      `SELECT id, wallet_enabled, betting_enabled, pg_review_mode,
              previous_wallet_enabled, previous_betting_enabled, previous_pg_review_mode,
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
      pgReviewMode: r.pg_review_mode === true,
      previousWalletEnabled: r.previous_wallet_enabled,
      previousBettingEnabled: r.previous_betting_enabled,
      previousPgReviewMode: r.previous_pg_review_mode === true,
      action: r.action,
      reason: r.reason,
      changedBy: r.changed_by,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Best-effort sync to the standalone software-platform integration API
 * (POST /integration/software/enable). Only enable is ever sent: disable is global and would
 * break the other domain sharing the service. Never throws — the public-site
 * toggle (cookie + nginx) works even when the service is unreachable.
 */
export async function syncSoftwarePlatformService(enabled, options = {}) {
  if (enabled !== true) return false; // never disable the shared service
  const base = String(process.env.SOFTWARE_PLATFORM_URL || '').replace(/\/$/, '');
  const key = String(
    process.env.SOFTWARE_PLATFORM_SERVICE_KEY || process.env.SERVICE_API_KEY || '',
  ).trim();
  if (!base || !key || key.includes('CONFIGURE_ME')) return false;
  const brandName = normalizeSoftwarePlatformName(options.softwarePlatformName);
  const websiteUrl = String(options.websiteUrl || process.env.APP_URL || 'https://oddsyra.com').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/integration/software/enable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': key },
      body: JSON.stringify({
        reason: `oddsyra admin toggle (on)`,
        ...(brandName ? { brandName, softwarePlatformName: brandName } : {}),
        websiteUrl: `${websiteUrl}/`,
      }),
      signal: AbortSignal.timeout(3000),
    });
    // Name-only updates (software already on) — hit dedicated brand endpoint too.
    if (brandName) {
      await fetch(`${base}/integration/software/brand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Service-Key': key },
        body: JSON.stringify({ brandName, softwarePlatformName: brandName, websiteUrl: `${websiteUrl}/` }),
        signal: AbortSignal.timeout(3000),
      }).catch(() => null);
    }
    return res.ok;
  } catch {
    return false;
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
