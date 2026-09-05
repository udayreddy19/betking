/**
 * Provider Registry & Priority Failover Manager
 * Centralizes sports provider configuration, priority ordering, health status, and failover policy.
 */

export const PROVIDER_PRIORITY = {
  PRIMARY: 'cricbuzz',
  SECONDARY: 'crex',
  TERTIARY: 'fancode',
  QUATERNARY: '10cric2026',
  FALLBACK: 'espn',
};

const PROVIDER_STORE = new Map([
  [
    'cricbuzz',
    {
      id: 'cricbuzz',
      name: 'Cricbuzz Live Score Provider',
      enabled: true,
      baseUrl: process.env.CRICBUZZ_API_URL || 'https://cricbuzz-cricket-v1.p.rapidapi.com',
      pollIntervalMs: 2000,
      priority: 1,
      healthStatus: 'HEALTHY',
      consecutiveErrors: 0,
    },
  ],
  [
    'crex',
    {
      id: 'crex',
      name: 'CREX Cricket Provider',
      enabled: true,
      baseUrl: process.env.CREX_API_URL || 'https://crex.com',
      pollIntervalMs: 2500,
      priority: 2,
      healthStatus: 'HEALTHY',
      consecutiveErrors: 0,
    },
  ],
  [
    'fancode',
    {
      id: 'fancode',
      name: 'FanCode Sports Provider',
      enabled: true,
      baseUrl: process.env.FANCODE_API_URL || 'https://api.fancode.com',
      pollIntervalMs: 3000,
      priority: 3,
      healthStatus: 'HEALTHY',
      consecutiveErrors: 0,
    },
  ],
  [
    '10cric2026',
    {
      id: '10cric2026',
      name: '10Cric Gateway',
      enabled: true,
      baseUrl: process.env.TENCRIC_API_URL || 'https://www.10cric2026.com',
      pollIntervalMs: 3000,
      priority: 4,
      healthStatus: 'HEALTHY',
      consecutiveErrors: 0,
    },
  ],
  [
    'espn',
    {
      id: 'espn',
      name: 'ESPN Cricinfo Live API',
      enabled: true,
      baseUrl: process.env.ESPN_API_URL || 'https://site.api.espn.com',
      pollIntervalMs: 5000,
      priority: 5,
      healthStatus: 'HEALTHY',
      consecutiveErrors: 0,
    },
  ],
  [
    'flashscore',
    {
      id: 'flashscore',
      name: 'Flashscore Live Feed',
      enabled: true,
      baseUrl: process.env.FLASHSCORE_API_URL || 'https://www.flashscore.com',
      pollIntervalMs: 12000,
      priority: 6,
      healthStatus: 'HEALTHY',
      consecutiveErrors: 0,
    },
  ],
  [
    'cricketguru',
    {
      id: 'cricketguru',
      name: 'Cricket Guru Live Scores',
      enabled: true,
      baseUrl: process.env.CRICKETGURU_API_URL || 'https://www.cricketguru.com',
      pollIntervalMs: 10000,
      priority: 7,
      healthStatus: 'HEALTHY',
      consecutiveErrors: 0,
    },
  ],
  [
    'cricketliveline',
    {
      id: 'cricketliveline',
      name: 'Cricket Liveline / CRIX',
      enabled: true,
      baseUrl: process.env.CRICKETLIVELINE_API_URL || 'https://cricketliveline.app',
      pollIntervalMs: 10000,
      priority: 8,
      healthStatus: 'HEALTHY',
      consecutiveErrors: 0,
    },
  ],
]);

export class ProviderRegistry {
  /**
   * Get list of all registered provider configurations
   */
  static getAllProviders() {
    return Array.from(PROVIDER_STORE.values());
  }

  /**
   * Get active primary provider or fail over to next healthy priority provider
   */
  static getActiveProvider() {
    const providers = ProviderRegistry.getAllProviders()
      .filter((p) => p.enabled && p.healthStatus !== 'UNHEALTHY')
      .sort((a, b) => a.priority - b.priority);

    if (providers.length === 0) {
      // Fallback to primary if all report unhealthy
      return PROVIDER_STORE.get('cricbuzz');
    }

    return providers[0];
  }

  /**
   * Record provider API error and manage failover health status
   */
  static recordError(providerId, error) {
    const provider = PROVIDER_STORE.get(providerId);
    if (!provider) return;

    provider.consecutiveErrors = (provider.consecutiveErrors || 0) + 1;
    if (provider.consecutiveErrors >= 3) {
      provider.healthStatus = 'UNHEALTHY';
      console.warn(`[ProviderRegistry] Provider '${providerId}' marked UNHEALTHY after ${provider.consecutiveErrors} consecutive errors: ${error?.message}`);
    }
  }

  /**
   * Record successful provider fetch and reset error counters
   */
  static recordSuccess(providerId) {
    const provider = PROVIDER_STORE.get(providerId);
    if (!provider) return;

    provider.consecutiveErrors = 0;
    provider.healthStatus = 'HEALTHY';
    provider.lastSuccessTimestamp = Date.now();
  }
}
