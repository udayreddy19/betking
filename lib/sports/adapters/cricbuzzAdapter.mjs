/**
 * Cricbuzz Sports Provider Adapter
 * Wraps Cricbuzz scoreboards and match details into normalized CanonicalMatch entities.
 */

import { BaseSportsAdapter } from './baseSportsAdapter.mjs';

export class CricbuzzAdapter extends BaseSportsAdapter {
  constructor() {
    super('cricbuzz', { timeoutMs: 5000 });
  }

  async fetchLiveMatches() {
    try {
      const { fetchCricbuzzLiveScores } = await import('../../cricbuzzLiveScores.mjs');
      const rawMatches = await fetchCricbuzzLiveScores();
      if (!Array.isArray(rawMatches)) return [];
      return rawMatches.map(m => this.normalizeMatch(m));
    } catch (err) {
      console.warn(`[CricbuzzAdapter Fetch Warning] ${err.message}`);
      return [];
    }
  }

  async fetchMatchDetail(providerMatchId) {
    try {
      const { fetchCricbuzzMatchDetail } = await import('../../cricbuzzMatchDetail.mjs');
      const raw = await fetchCricbuzzMatchDetail(providerMatchId);
      if (!raw) return null;
      return this.normalizeMatch(raw);
    } catch (err) {
      console.warn(`[CricbuzzAdapter Detail Error] ${err.message}`);
      return null;
    }
  }
}

export const cricbuzzAdapter = new CricbuzzAdapter();
