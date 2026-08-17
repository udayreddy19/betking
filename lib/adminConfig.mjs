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

export function updateAdminConfig(key, value) {
  if (key in ADMIN_CONFIG_STORE) {
    ADMIN_CONFIG_STORE[key] = value;
    ADMIN_CONFIG_STORE.updatedAt = new Date().toISOString();
    return true;
  }
  return false;
}

export function setSportEnabledStatus(sport, enabled) {
  ADMIN_CONFIG_STORE.enabledSports[sport] = !!enabled;
  ADMIN_CONFIG_STORE.updatedAt = new Date().toISOString();
  return ADMIN_CONFIG_STORE.enabledSports;
}

export function addManualOddsOverride(matchId, selectionId, manualDecimalOdds, reason = 'Trader Override') {
  let matchOverrides = ADMIN_CONFIG_STORE.manualOddsOverrides.get(matchId) || {};
  matchOverrides[selectionId] = {
    manualOdds: Number(manualDecimalOdds),
    reason,
    timestamp: Date.now(),
  };
  ADMIN_CONFIG_STORE.manualOddsOverrides.set(matchId, matchOverrides);
  return matchOverrides;
}

export function getAdminConfigSummary() {
  return {
    ...ADMIN_CONFIG_STORE,
    manualOddsOverridesCount: ADMIN_CONFIG_STORE.manualOddsOverrides.size,
  };
}
