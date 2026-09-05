/**
 * Runtime OddsEngine mode control (admin toggle).
 * Modes are mutually exclusive:
 *   v3     — publish V3 only (V4 off)
 *   v4     — publish V4 only (V3 off for cricket)
 *   shadow — publish V3, dual-run V4 for metrics
 *
 * Runtime override beats ODDS_ENGINE env. Persists via feature_flags when PG is up.
 */

import { upsertFeatureFlag } from '../../featureStore.mjs';

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
      const { query } = await import('../../../db/pg.js');
      const res = await query(
        `SELECT name, enabled, updated_by, updated_at FROM feature_flags WHERE flag_key = $1 LIMIT 1`,
        [FLAG_KEY],
      );
      const row = res.rows?.[0];
      // Never clobber an in-process admin set that happened while hydrate was in flight.
      if (runtimeMode != null) return;
      if (!row || row.enabled === false) return;
      const mode = normalizeMode(row.name);
      if (!mode) return;
      runtimeMode = mode;
      updatedBy = row.updated_by || null;
      updatedAt = row.updated_at ? new Date(row.updated_at).toISOString() : null;
    } catch {
      // PG unavailable — keep env / in-memory only.
    }
  })();
  return hydratePromise;
}

/** Ensure PG value loaded once per process (non-blocking callers still sync-read memory). */
export function ensureEngineModeHydrated() {
  void hydrateFromStore();
}

export function getRuntimeEngineMode() {
  ensureEngineModeHydrated();
  return runtimeMode;
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
    modes: {
      v3: {
        label: 'V3 live',
        publish: 'OddsEngineV3',
        description: 'Customer odds from V3. V4 is off.',
      },
      v4: {
        label: 'V4 live',
        publish: 'OddsEngineV4',
        description: 'Customer odds from V4. V3 publish path is off for cricket.',
      },
      shadow: {
        label: 'Shadow',
        publish: 'OddsEngineV3',
        description: 'Customer odds from V3; V4 dual-runs for compare only.',
      },
    },
  };
}

/**
 * Set exclusive publish mode. Enabling v4 stops v3 for cricket customer odds.
 * @param {'v3'|'v4'|'shadow'} mode
 * @param {{ updatedBy?: string, reason?: string }} [opts]
 */
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
      description: `Active cricket odds engine: ${next}. Mutually exclusive with other modes.`,
      enabled: true,
      updatedBy: updatedBy,
      reason: opts.reason || `Engine mode ${previous} → ${next}`,
    });
  } catch {
    // Still apply in-memory even if PG write fails.
  }

  try {
    const { clearAggregatorCache } = await import('../../aggregator.mjs');
    clearAggregatorCache();
  } catch {
    // ignore
  }
  try {
    const { clearMatchOddsCache } = await import('../../liveScoresApiHandlers.mjs');
    clearMatchOddsCache();
  } catch {
    // ignore
  }

  return getEngineModeStatus();
}

/** Clear admin override (fall back to ODDS_ENGINE env). */
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
      updatedBy: updatedBy,
      reason: opts.reason || 'Cleared runtime engine override',
    });
  } catch {
    // ignore
  }
  try {
    const { clearAggregatorCache } = await import('../../aggregator.mjs');
    clearAggregatorCache();
  } catch {
    // ignore
  }
  try {
    const { clearMatchOddsCache } = await import('../../liveScoresApiHandlers.mjs');
    clearMatchOddsCache();
  } catch {
    // ignore
  }
  return getEngineModeStatus();
}

/** Test helper */
export function _resetEngineModeControlForTests() {
  runtimeMode = null;
  updatedAt = null;
  updatedBy = null;
  hydratePromise = null;
}
