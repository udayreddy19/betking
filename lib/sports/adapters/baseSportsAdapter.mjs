/**
 * Base Sports Provider Adapter — Abstract Boundary Contract
 * All sports data provider adapters (Cricbuzz, ESPN, FanCode, SRL) must implement this interface.
 * Standardizes normalized canonical responses and prevents provider leaks.
 */

import { toCanonicalMatch, toCanonicalTeam, toCanonicalPlayer } from '../../normalizers/canonicalModel.mjs';

export class BaseSportsAdapter {
  constructor(providerName = 'generic', options = {}) {
    this.providerName = providerName;
    this.timeoutMs = options.timeoutMs || 5000;
    this.maxRetries = options.maxRetries || 3;
  }

  /** Fetch active live scoreboards / matches from provider */
  async fetchLiveMatches() {
    throw new Error(`fetchLiveMatches not implemented for ${this.providerName}`);
  }

  /** Fetch details for a specific match by provider match ID */
  async fetchMatchDetail(providerMatchId) {
    throw new Error(`fetchMatchDetail not implemented for ${this.providerName}`);
  }

  /** Normalize raw provider match structure into CanonicalMatch */
  normalizeMatch(rawMatch) {
    return toCanonicalMatch(rawMatch, this.providerName);
  }

  /** Normalize raw provider team structure into CanonicalTeam */
  normalizeTeam(rawTeam) {
    return toCanonicalTeam(rawTeam);
  }

  /** Normalize raw provider player structure into CanonicalPlayer */
  normalizePlayer(rawPlayer) {
    return toCanonicalPlayer(rawPlayer);
  }
}
