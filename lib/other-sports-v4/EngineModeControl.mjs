/**
 * OTHER_SPORTS_ENGINE runtime mode: v3 | v4 | shadow.
 * Independent of cricket ODDS_ENGINE / OddsEngineV4 toggle.
 */

import { upsertFeatureFlag } from '../featureStore.mjs';

export const OTHER_SPORTS_ENGINE_MODES = Object.freeze(['v3', 'v4', 'shadow']);
const FLAG_KEY = 'other_sports_engine_runtime_mode';

/** @type {'v3'|'v4'|'shadow'|null} */
let runtimeMode = null;
let updatedAt = null;
let updatedBy = null;
let hydratePromise = null;
let hydrateGeneration = 0;

function normalizeMode(raw) {
  const mode = String(raw || '').toLowerCase().trim();
  return OTHER_SPORTS_ENGINE_MODES.includes(mode) ? mode : null;
}

async function hydrateFromStore() {
  if (hydratePromise) return hydratePromise;
  const gen = hydrateGeneration;
  hydratePromise = (async () => {
    try {
      const { query } = await import('../../db/pg.js');
      const res = await query(
        `SELECT name, enabled, updated_by, updated_at FROM feature_flags WHERE flag_key = $1 LIMIT 1`,
        [FLAG_KEY],
      );
      if (gen !== hydrateGeneration) return;
      const row = res.rows?.[0];
      if (runtimeMode != null) return;
      if (!row || row.enabled === false) return;
      const mode = normalizeMode(row.name);
      if (!mode) return;
      if (gen !== hydrateGeneration) return;
      runtimeMode = mode;
      updatedBy = row.updated_by || null;
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

/** Default production: v3 (current other-sports book). */
export function resolveOtherSportsEngineMode(env = process.env, override = null) {
  if (override === 'v3' || override === 'v4' || override === 'shadow') return override;
  ensureOtherSportsEngineModeHydrated();
  const runtime = getRuntimeOtherSportsEngineMode();
  if (runtime) return runtime;
  const raw = String(env.OTHER_SPORTS_ENGINE || 'v3').toLowerCase().trim();
  if (raw === 'v4' || raw === 'shadow' || raw === 'v3') return raw;
  return 'v3';
}

export async function resolveOtherSportsEngineModeAsync(env = process.env, override = null) {
  if (override === 'v3' || override === 'v4' || override === 'shadow') return override;
  await waitForOtherSportsEngineModeHydrated();
  return resolveOtherSportsEngineMode(env, null);
}

export function getOtherSportsEngineModeStatus(env = process.env) {
  ensureOtherSportsEngineModeHydrated();
  const envMode = normalizeMode(env.OTHER_SPORTS_ENGINE) || 'v3';
  const active = runtimeMode || envMode;
  return {
    active,
    runtimeOverride: runtimeMode,
    envDefault: envMode,
    source: runtimeMode ? 'admin_toggle' : 'env',
    updatedAt,
    updatedBy,
    resolved: resolveOtherSportsEngineMode(env),
    modes: {
      v3: { label: 'V3 live', publish: 'otherSportsOdds' },
      v4: { label: 'V4 live', publish: 'OtherSportsEngineV4' },
      shadow: { label: 'Shadow', publish: 'otherSportsOdds', note: 'V3 customers; V4 dual-run metrics only' },
    },
  };
}

function bumpHydrateGeneration() {
  hydrateGeneration += 1;
  hydratePromise = null;
}

export async function setRuntimeOtherSportsEngineMode(mode, opts = {}) {
  const next = normalizeMode(mode);
  if (!next) {
    const err = new Error(`Invalid mode "${mode}". Use v3 | v4 | shadow.`);
    err.statusCode = 400;
    throw err;
  }
  const previous = runtimeMode || normalizeMode(process.env.OTHER_SPORTS_ENGINE) || 'v3';
  bumpHydrateGeneration();
  runtimeMode = next;
  updatedAt = new Date().toISOString();
  updatedBy = opts.updatedBy || 'admin';

  try {
    await upsertFeatureFlag({
      flagKey: FLAG_KEY,
      name: next,
      description: `Active other-sports odds engine: ${next}`,
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
}
