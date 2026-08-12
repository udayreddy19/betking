/**
 * ESPN Sports Provider Adapter
 * Wraps ESPN Scoreboard REST APIs (Cricket, Soccer, Basketball, Tennis, NFL) into CanonicalMatch entities.
 */

import { BaseSportsAdapter } from './baseSportsAdapter.mjs';

export class ESPNAdapter extends BaseSportsAdapter {
  constructor() {
    super('espn', { timeoutMs: 3000 });
  }

  async fetchLiveMatches() {
    try {
      const { fetchEspnLiveScores } = await import('../../espnLiveScores.mjs');
      const rawMatches = await fetchEspnLiveScores();
      if (!Array.isArray(rawMatches)) return [];
      return rawMatches.map(m => this.normalizeMatch(m));
    } catch (err) {
      console.warn(`[ESPNAdapter Fetch Warning] ${err.message}`);
      return [];
    }
  }

  async fetchMatchDetail(providerMatchId) {
    try {
      const live = await this.fetchLiveMatches();
      return live.find(m => String(m.providerMatchId) === String(providerMatchId)) || null;
    } catch (err) {
      return null;
    }
  }
}

export const espnAdapter = new ESPNAdapter();
