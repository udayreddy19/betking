/**
 * Enterprise Admin Configuration Control Engine — OddsYra Sportsbook (lib/adminConfig.mjs)
 * Manages odds overrides, margin %, risk %, max bet/win limits, market visibility,
 * sport enable/disable status, and provider priority.
 */

const ADMIN_CONFIG_STORE = {
  oddsFormatDefault: 'decimal',
  globalMarginPct: 5.0,
  globalMaxStake: 50000.0,
  globalMaxWin: 200000.0,
  enabledSports: {
    cricket: true,
    soccer: true,
    basketball: true,
    tennis: true,
    formula1: true,
    hockey: true,
    'american-football': true,
  },
  providerPriority: ['cricbuzz', 'crex', 'fancode', '10cric2026', 'espn'],
  manualOddsOverrides: new Map(),
  updatedAt: new Date().toISOString(),
};

let hydratePromise = null;

export function updateAdminConfig(key, value) {
  if (key in ADMIN_CONFIG_STORE) {
    ADMIN_CONFIG_STORE[key] = value;
    ADMIN_CONFIG_STORE.updatedAt = new Date().toISOString();
    return true;
  }
  return false;
}

export function sportKeyFromFlagKey(flagKey) {
  const m = String(flagKey || '').match(/^SPORT_ENABLED_(.+)$/i);
  if (!m) return null;
  return m[1].toLowerCase().replace(/_/g, '-');
}

export function flagKeyFromSport(sport) {
  return `SPORT_ENABLED_${String(sport || '').toUpperCase().replace(/-/g, '_')}`;
}

export function setSportEnabledStatus(sport, enabled) {
  const key = String(sport || '').toLowerCase().replace(/_/g, '-');
  if (!key) return ADMIN_CONFIG_STORE.enabledSports;
  ADMIN_CONFIG_STORE.enabledSports[key] = !!enabled;
  ADMIN_CONFIG_STORE.updatedAt = new Date().toISOString();
  return ADMIN_CONFIG_STORE.enabledSports;
}

export function isSportEnabled(sport) {
  const raw = String(sport || '').toLowerCase().replace(/_/g, '-');
  const key = raw === 'football' ? 'soccer'
    : raw === 'nfl' ? 'american-football'
    : raw;
  if (!key) return true;
  if (!(key in ADMIN_CONFIG_STORE.enabledSports)) return true;
  return !!ADMIN_CONFIG_STORE.enabledSports[key];
}

/** Load SPORT_ENABLED_* rows from PG feature_flags into in-memory config. */
export async function hydrateSportFlagsFromStore() {
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const { getAllFeatureFlags } = await import('./featureStore.mjs');
        const { flags } = await getAllFeatureFlags();
        for (const f of flags || []) {
          const sport = sportKeyFromFlagKey(f.flag_key);
          if (!sport) continue;
          ADMIN_CONFIG_STORE.enabledSports[sport] = !!f.enabled;
        }
        ADMIN_CONFIG_STORE.updatedAt = new Date().toISOString();
      } catch {
        // Feature store may be unavailable during boot; keep defaults.
      } finally {
        hydratePromise = null;
      }
    })();
  }
  return hydratePromise;
}

export function getAdminConfigSummary() {
  return {
    ...ADMIN_CONFIG_STORE,
    manualOddsOverridesCount: ADMIN_CONFIG_STORE.manualOddsOverrides.size,
  };
}
