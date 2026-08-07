/**
 * Enterprise Platform Configuration Engine — BetKing Sportsbook (lib/configEngine.mjs)
 * Centralized master config manager for sports, markets, providers, margins, UI themes,
 * API rate limits, feature flags, cache settings, risk limits, settlement rules, and promotions.
 */

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
