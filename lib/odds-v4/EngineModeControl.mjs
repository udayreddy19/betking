/**
 * Runtime exclusive OddsEngine mode: v3 | v4 | shadow.
 * Admin toggle beats ODDS_ENGINE env. Persists via feature_flags when PG is up.
 */

import { upsertFeatureFlag } from '../featureStore.mjs';

export const ENGINE_MODES = Object.freeze(['v3', 'v4', 'shadow']);
const FLAG_KEY = 'odds_engine_runtime_mode';

/** @type {'v3'|'v4'|'shadow'|null} */
let runtimeMode = null;
let updatedAt = null;
let updatedBy = null;
let hydratePromise = null;

function normalizeMode(raw) {
  const mode = String(raw || '').toLowerCase().trim();
  return ENGINE_MODES.includes(mode) ? mode : null;
}

async function hydrateFromStore() {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const { query } = await import('../../db/pg.js');
      const res = await query(
        `SELECT name, enabled, updated_by, updated_at FROM feature_flags WHERE flag_key = $1 LIMIT 1`,
        [FLAG_KEY],
      );
      const row = res.rows?.[0];
      if (runtimeMode != null) return;
      if (!row || row.enabled === false) return;
      const mode = normalizeMode(row.name);
      if (!mode) return;
      runtimeMode = mode;
      updatedBy = row.updated_by || null;
      updatedAt = row.updated_at ? new Date(row.updated_at).toISOString() : null;
    } catch {
      // ignore
    }
  })();
  return hydratePromise;
}

export function ensureEngineModeHydrated() {
  void hydrateFromStore();
}

export function getRuntimeEngineMode() {
  ensureEngineModeHydrated();
  return runtimeMode;
}

export function resolveOddsEngineMode(env = process.env, override = null) {
  if (override === 'v3' || override === 'v4' || override === 'shadow') return override;
  ensureEngineModeHydrated();
  const runtime = getRuntimeEngineMode();
  if (runtime) return runtime;
  const raw = String(env.ODDS_ENGINE || 'v3').toLowerCase().trim();
  if (raw === 'v4' || raw === 'shadow' || raw === 'v3') return raw;
  return 'v3';
}

export function getEngineModeStatus(env = process.env) {
  ensureEngineModeHydrated();
  const envMode = normalizeMode(env.ODDS_ENGINE) || 'v3';
  const active = runtimeMode || envMode;
  return {
    active,
    runtimeOverride: runtimeMode,
    envDefault: envMode,
    source: runtimeMode ? 'admin_toggle' : 'env',
    updatedAt,
    updatedBy,
    resolved: resolveOddsEngineMode(env),
    modes: {
      v3: { label: 'V3 live', publish: 'OddsEngineV3' },
      v4: { label: 'V4 live', publish: 'OddsEngineV4' },
      shadow: { label: 'Shadow', publish: 'OddsEngineV3', note: 'V3 customers; V4 dual-run metrics only' },
    },
  };
}

export async function setRuntimeEngineMode(mode, opts = {}) {
  const next = normalizeMode(mode);
  if (!next) {
    const err = new Error(`Invalid mode "${mode}". Use v3 | v4 | shadow.`);
    err.statusCode = 400;
    throw err;
  }
  const previous = runtimeMode || normalizeMode(process.env.ODDS_ENGINE) || 'v3';
  runtimeMode = next;
  updatedAt = new Date().toISOString();
  updatedBy = opts.updatedBy || 'admin';

  try {
    await upsertFeatureFlag({
      flagKey: FLAG_KEY,
      name: next,
      description: `Active cricket odds engine: ${next}`,
      enabled: true,
      updatedBy,
      reason: opts.reason || `Engine mode ${previous} → ${next}`,
    });
  } catch {
    // in-memory still applied
  }

  try {
    const { clearAggregatorCache } = await import('../aggregator.mjs');
    clearAggregatorCache();
  } catch { /* ignore */ }
  try {
    const { clearMatchOddsCache } = await import('../liveScoresApiHandlers.mjs');
    clearMatchOddsCache();
  } catch { /* ignore */ }

  return getEngineModeStatus();
}

export async function clearRuntimeEngineMode(opts = {}) {
  runtimeMode = null;
  updatedAt = new Date().toISOString();
  updatedBy = opts.updatedBy || 'admin';
  try {
    await upsertFeatureFlag({
      flagKey: FLAG_KEY,
      name: 'env',
      description: 'No runtime override — use ODDS_ENGINE env',
      enabled: false,
      updatedBy,
      reason: opts.reason || 'Cleared runtime engine override',
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
  return getEngineModeStatus();
}

export function _resetEngineModeControlForTests() {
  runtimeMode = null;
  updatedAt = null;
  updatedBy = null;
  hydratePromise = null;
}
