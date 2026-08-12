/**
 * Virtual IPL SRL Provider Adapter
 * Wraps in-process IPL SRL Simulation Engine events into CanonicalMatch entities.
 */

import { BaseSportsAdapter } from './baseSportsAdapter.mjs';

export class SRLAdapter extends BaseSportsAdapter {
  constructor() {
    super('srl_engine', { timeoutMs: 1000 });
  }

  async fetchLiveMatches() {
    try {
      const { iplSrlEngine } = await import('../../iplSrlEngine.mjs');
      const matches = iplSrlEngine.getLiveMatches();
      if (!Array.isArray(matches)) return [];
      return matches.map(m => this.normalizeMatch(m));
    } catch (err) {
      console.warn(`[SRLAdapter Fetch Warning] ${err.message}`);
      return [];
    }
  }

  async fetchMatchDetail(providerMatchId) {
    try {
      const { iplSrlEngine } = await import('../../iplSrlEngine.mjs');
      const match = iplSrlEngine.getMatchById(providerMatchId);
      if (!match) return null;
      return this.normalizeMatch(match);
    } catch (err) {
      return null;
    }
  }
}

export const srlAdapter = new SRLAdapter();
