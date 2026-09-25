/**
 * OTHER_SPORTS_ENGINE runtime mode: v3 | v4 | shadow.
 * Independent of cricket ODDS_ENGINE / OddsEngineV4 toggle.
 * Temporary overrides (v3/shadow) require reason + expiry (default 24h).
 */

import { upsertFeatureFlag } from '../featureStore.mjs';

export const OTHER_SPORTS_ENGINE_MODES = Object.freeze(['v3', 'v4', 'shadow']);
const FLAG_KEY = 'other_sports_engine_runtime_mode';

/** @type {'v3'|'v4'|'shadow'|null} */
let runtimeMode = null;
let updatedAt = null;
let updatedBy = null;
/** @type {string|null} */
let overrideExpiresAt = null;
let overrideReason = null;
let hydratePromise = null;
let hydrateGeneration = 0;

function normalizeMode(raw) {
  const mode = String(raw || '').toLowerCase().trim();
  return OTHER_SPORTS_ENGINE_MODES.includes(mode) ? mode : null;
}

function encodeOverrideDescription(mode, meta = {}) {
  return JSON.stringify({
    kind: 'other_sports_engine_override',
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
    if (parsed && parsed.kind === 'other_sports_engine_override') {
      expiresAt = parsed.expiresAt || null;
      reason = parsed.reason || null;
      by = parsed.updatedBy || null;
    }
  } catch {
    /* legacy plain-text */
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
  hydratePromise = null;
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
      description: 'Expired override cleared — use OTHER_SPORTS_ENGINE env (default v4)',
      enabled: false,
      updatedBy: updatedByActor,
      reason: 'Automatic expiry of temporary other-sports engine override',
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
      /* ignore */
    }
  })();
  return hydratePromise;
}

export async function waitForOtherSportsEngineModeHydrated() {
  await hydrateFromStore();
  return runtimeMode;
}

export function ensureOtherSportsEngineModeHydrated() {
  void hydrateFromStore();
}

ensureOtherSportsEngineModeHydrated();

export function getRuntimeOtherSportsEngineMode() {
  ensureOtherSportsEngineModeHydrated();
  return runtimeMode;
}

/** Default production: v4 (OtherSportsEngineV4). V3 remains fallback / rollback / shadow publish. */
export function resolveOtherSportsEngineMode(env = process.env, override = null) {
  if (override === 'v3' || override === 'v4' || override === 'shadow') return override;
  ensureOtherSportsEngineModeHydrated();
  if (runtimeMode && isOverrideExpired(overrideExpiresAt)) {
    void clearExpiredOverrideInStore();
    runtimeMode = null;
    overrideExpiresAt = null;
  }
  const runtime = getRuntimeOtherSportsEngineMode();
  if (runtime) return runtime;
  const raw = String(env.OTHER_SPORTS_ENGINE || 'v4').toLowerCase().trim();
  if (raw === 'v4' || raw === 'shadow' || raw === 'v3') return raw;
  return 'v4';
}

export async function resolveOtherSportsEngineModeAsync(env = process.env, override = null) {
  if (override === 'v3' || override === 'v4' || override === 'shadow') return override;
  await waitForOtherSportsEngineModeHydrated();
  return resolveOtherSportsEngineMode(env, null);
}

export function getOtherSportsEngineModeStatus(env = process.env) {
  ensureOtherSportsEngineModeHydrated();
  if (runtimeMode && isOverrideExpired(overrideExpiresAt)) {
    void clearExpiredOverrideInStore();
    runtimeMode = null;
    overrideExpiresAt = null;
  }
  const envMode = normalizeMode(env.OTHER_SPORTS_ENGINE) || 'v4';
  const active = runtimeMode || envMode;
  return {
    active,
    runtimeOverride: runtimeMode,
    envDefault: envMode,
    source: runtimeMode ? 'admin_toggle' : 'env',
    updatedAt,
    updatedBy,
    overrideExpiresAt,
    overrideReason,
    overrideExpired: isOverrideExpired(overrideExpiresAt),
    resolved: resolveOtherSportsEngineMode(env),
    modes: {
      v3: { label: 'V3 fallback (temporary)', publish: 'otherSportsOdds' },
      v4: { label: 'V4 live (default)', publish: 'OtherSportsEngineV4' },
      shadow: { label: 'Shadow', publish: 'otherSportsOdds', note: 'V3 customers; V4 dual-run metrics only' },
    },
  };
}

export async function setRuntimeOtherSportsEngineMode(mode, opts = {}) {
  const next = normalizeMode(mode);
  if (!next) {
    const err = new Error(`Invalid mode "${mode}". Use v3 | v4 | shadow.`);
    err.statusCode = 400;
    throw err;
  }
  let expiresAt = opts.expiresAt || null;
  if ((next === 'v3' || next === 'shadow') && !expiresAt) {
    const hours = Math.max(1, Number(opts.ttlHours) || Number(process.env.OTHER_SPORTS_ENGINE_OVERRIDE_TTL_HOURS) || 24);
    expiresAt = new Date(Date.now() + hours * 3600_000).toISOString();
  }
  if (!opts.reason && (next === 'v3' || next === 'shadow')) {
    const err = new Error('Reason required when overriding away from V4 default');
    err.statusCode = 400;
    throw err;
  }

  const previous = runtimeMode || normalizeMode(process.env.OTHER_SPORTS_ENGINE) || 'v4';
  bumpHydrateGeneration();
  runtimeMode = next;
  updatedAt = new Date().toISOString();
  updatedBy = opts.updatedBy || 'admin';
  overrideExpiresAt = expiresAt;
  overrideReason = opts.reason || null;

  try {
    await upsertFeatureFlag({
      flagKey: FLAG_KEY,
      name: next,
      description: encodeOverrideDescription(next, {
        expiresAt,
        reason: opts.reason,
        updatedBy,
      }),
      enabled: true,
      updatedBy,
      reason: opts.reason || `Other sports engine ${previous} → ${next}`,
    });
  } catch {
    /* in-memory still applied */
  }

  try {
    const { clearAggregatorCache } = await import('../aggregator.mjs');
    clearAggregatorCache();
  } catch { /* ignore */ }
  try {
    const { clearMatchOddsCache } = await import('../liveScoresApiHandlers.mjs');
    clearMatchOddsCache();
  } catch { /* ignore */ }

  return getOtherSportsEngineModeStatus();
}

export async function clearRuntimeOtherSportsEngineMode(opts = {}) {
  bumpHydrateGeneration();
  runtimeMode = null;
  overrideExpiresAt = null;
  overrideReason = null;
  updatedAt = new Date().toISOString();
  updatedBy = opts.updatedBy || 'admin';
  try {
    await upsertFeatureFlag({
      flagKey: FLAG_KEY,
      name: 'env',
      description: 'No runtime override — use OTHER_SPORTS_ENGINE env',
      enabled: false,
      updatedBy,
      reason: opts.reason || 'Cleared other-sports engine override',
    });
  } catch { /* ignore */ }
  try {
    const { clearAggregatorCache } = await import('../aggregator.mjs');
    clearAggregatorCache();
  } catch { /* ignore */ }
  try {
    const { clearMatchOddsCache } = await import('../liveScoresApiHandlers.mjs');
    clearMatchOddsCache();
  } catch { /* ignore */ }
  return getOtherSportsEngineModeStatus();
}

export function _resetOtherSportsEngineModeControlForTests() {
  bumpHydrateGeneration();
  runtimeMode = null;
  updatedAt = null;
  updatedBy = null;
  overrideExpiresAt = null;
  overrideReason = null;
}
