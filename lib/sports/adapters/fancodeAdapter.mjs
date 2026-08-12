/**
 * FanCode Sports Provider Adapter
 * Wraps FanCode REST/GraphQL feeds into CanonicalMatch entities.
 */

import { BaseSportsAdapter } from './baseSportsAdapter.mjs';

export class FanCodeAdapter extends BaseSportsAdapter {
  constructor() {
    super('fancode', { timeoutMs: 4000 });
  }

  async fetchLiveMatches() {
    try {
      const { fetchFancodeLiveScores } = await import('../../fancodeLiveScores.mjs');
      const rawMatches = await fetchFancodeLiveScores();
      if (!Array.isArray(rawMatches)) return [];
      return rawMatches.map(m => this.normalizeMatch(m));
    } catch (err) {
      console.warn(`[FanCodeAdapter Fetch Warning] ${err.message}`);
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

export const fancodeAdapter = new FanCodeAdapter();
