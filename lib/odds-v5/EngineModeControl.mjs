/**
 * Runtime OddsEngine mode: v5 (live) | v4 (fallback) | shadow (V5 publish + V4 compare).
 * Admin toggle beats ODDS_ENGINE env. Persists via feature_flags when PG is up.
 */

import { upsertFeatureFlag } from '../featureStore.mjs';

export const ENGINE_MODES = Object.freeze(['v4', 'v5', 'shadow']);
const FLAG_KEY = 'odds_engine_runtime_mode';

/** @type {'v4'|'v5'|'shadow'|null} */
let runtimeMode = null;
let updatedAt = null;
let updatedBy = null;
/** @type {string|null} */
let overrideExpiresAt = null;
let overrideReason = null;
let hydratePromise = null;
let hydrateGeneration = 0;

function normalizeMode(raw) {
  let mode = String(raw || '').toLowerCase().trim();
  // Legacy V3 flags migrate to V5 (live).
  if (mode === 'v3') mode = 'v5';
  return ENGINE_MODES.includes(mode) ? mode : null;
}

function encodeOverrideDescription(mode, meta = {}) {
  return JSON.stringify({
    kind: 'odds_engine_override',
    mode,
    expiresAt: meta.expiresAt || null,
    reason: meta.reason || null,
    updatedBy: meta.updatedBy || null,
  });
}

function parseOverrideDescription(description, name) {
  const mode = normalizeMode(name);
  let expiresAt = null;
  let reason = null;
  let by = null;
  try {
    const parsed = JSON.parse(String(description || ''));
    if (parsed && parsed.kind === 'odds_engine_override') {
      expiresAt = parsed.expiresAt || null;
      reason = parsed.reason || null;
      by = parsed.updatedBy || null;
    }
  } catch {
    /* legacy */
  }
  return { mode, expiresAt, reason, by };
}

function isOverrideExpired(expiresAt, now = Date.now()) {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  return Number.isFinite(t) && t <= now;
}

function bumpHydrateGeneration() {
  hydrateGeneration += 1;
}

async function clearExpiredOverrideInStore(updatedByActor = 'system_expiry') {
  bumpHydrateGeneration();
  runtimeMode = null;
  overrideExpiresAt = null;
  overrideReason = null;
  updatedAt = new Date().toISOString();
  updatedBy = updatedByActor;
  try {
    await upsertFeatureFlag({
      flagKey: FLAG_KEY,
      name: 'env',
      description: 'Expired override cleared — use ODDS_ENGINE env (default v5)',
      enabled: false,
      updatedBy: updatedByActor,
      reason: 'Automatic expiry of temporary engine override',
    });
  } catch { /* ignore */ }
}

async function hydrateFromStore() {
  if (hydratePromise) return hydratePromise;
  const gen = hydrateGeneration;
  hydratePromise = (async () => {
    try {
      const { query } = await import('../../db/pg.js');
      const res = await query(
        `SELECT name, description, enabled, updated_by, updated_at FROM feature_flags WHERE flag_key = $1 LIMIT 1`,
        [FLAG_KEY],
      );
      if (gen !== hydrateGeneration) return;
      const row = res.rows?.[0];
      if (runtimeMode != null) return;
      if (!row || row.enabled === false) return;
      const parsed = parseOverrideDescription(row.description, row.name);
      if (!parsed.mode) return;
      if (isOverrideExpired(parsed.expiresAt)) {
        await clearExpiredOverrideInStore();
        return;
      }
      if (gen !== hydrateGeneration) return;
      runtimeMode = parsed.mode;
      overrideExpiresAt = parsed.expiresAt;
      overrideReason = parsed.reason;
      updatedBy = parsed.by || row.updated_by || null;
      updatedAt = row.updated_at ? new Date(row.updated_at).toISOString() : null;
    } catch {
      /* ignore — clear promise so a later call can retry */
      hydratePromise = null;
    }
  })();
  try {
    return await hydratePromise;
  } finally {
    // Keep successful promise cached; failed paths null it above for retry.
  }
}

/** @internal test helper */
export function _resetEngineModeControlForTests() {
  runtimeMode = null;
  updatedAt = null;
  updatedBy = null;
  overrideExpiresAt = null;
  overrideReason = null;
  hydratePromise = null;
  hydrateGeneration += 1;
}

export async function waitForEngineModeHydrated() {
  await hydrateFromStore();
  return runtimeMode;
}

export function ensureEngineModeHydrated() {
  void hydrateFromStore();
}

export function resolveOddsEngineMode(env = process.env) {
  const override = runtimeMode;
  if (override === 'v4' || override === 'v5' || override === 'shadow') {
    if (isOverrideExpired(overrideExpiresAt)) {
      void clearExpiredOverrideInStore();
      return normalizeMode(env.ODDS_ENGINE) || 'v5';
    }
    return override;
  }
  return normalizeMode(env.ODDS_ENGINE) || 'v5';
}

export async function resolveOddsEngineModeAsync(env = process.env) {
  await waitForEngineModeHydrated();
  return resolveOddsEngineMode(env);
}

export function getEngineModeStatus(env = process.env) {
  const envMode = normalizeMode(env.ODDS_ENGINE) || 'v5';
  const resolved = resolveOddsEngineMode(env);
  return {
    active: resolved,
    runtimeOverride: runtimeMode,
    envDefault: envMode,
    source: runtimeMode ? 'admin_toggle' : 'env',
    updatedAt,
    updatedBy,
    overrideExpiresAt,
    overrideReason,
    overrideExpired: isOverrideExpired(overrideExpiresAt),
    resolved,
    modes: {
      v5: { label: 'V5 live (default)', publish: 'OddsEngineV5' },
      v4: { label: 'V4 fallback', publish: 'OddsEngineV4' },
      shadow: {
        label: 'Shadow',
        publish: 'OddsEngineV5',
        note: 'V5 customers; V4 dual-run metrics only',
      },
    },
  };
}

export async function setRuntimeEngineMode(mode, opts = {}) {
  const next = normalizeMode(mode);
  if (!next) {
    const err = new Error(`Invalid mode "${mode}". Use v4 | v5 | shadow.`);
    err.code = 'INVALID_ENGINE_MODE';
    throw err;
  }
  let expiresAt = opts.expiresAt || null;
  if ((next === 'v4' || next === 'shadow') && !expiresAt) {
    const hours = Math.max(1, Number(opts.ttlHours) || Number(process.env.ODDS_ENGINE_OVERRIDE_TTL_HOURS) || 24);
    expiresAt = new Date(Date.now() + hours * 3600_000).toISOString();
  }
  if (!opts.reason && (next === 'v4' || next === 'shadow')) {
    const err = new Error('Reason required for temporary V4/shadow override');
    err.code = 'ENGINE_OVERRIDE_REASON_REQUIRED';
    throw err;
  }
  bumpHydrateGeneration();
  const previous = runtimeMode || normalizeMode(process.env.ODDS_ENGINE) || 'v5';
  runtimeMode = next;
  overrideExpiresAt = expiresAt;
  overrideReason = opts.reason || null;
  updatedAt = new Date().toISOString();
  updatedBy = opts.updatedBy || null;
  try {
    await upsertFeatureFlag({
      flagKey: FLAG_KEY,
      name: next,
      description: encodeOverrideDescription(next, {
        expiresAt,
        reason: opts.reason,
        updatedBy: opts.updatedBy,
      }),
      enabled: true,
      updatedBy: opts.updatedBy || 'admin',
      reason: opts.reason || `Set odds engine mode to ${next}`,
    });
  } catch { /* ignore */ }
  return { previous, ...getEngineModeStatus() };
}

export async function clearRuntimeEngineMode(opts = {}) {
  bumpHydrateGeneration();
  runtimeMode = null;
  overrideExpiresAt = null;
  overrideReason = null;
  updatedAt = new Date().toISOString();
  updatedBy = opts.updatedBy || null;
  try {
    await upsertFeatureFlag({
      flagKey: FLAG_KEY,
      name: 'env',
      description: 'No runtime override — use ODDS_ENGINE env',
      enabled: false,
      updatedBy: opts.updatedBy || 'admin',
      reason: opts.reason || 'Cleared odds engine runtime override',
    });
  } catch { /* ignore */ }
  return getEngineModeStatus();
}
