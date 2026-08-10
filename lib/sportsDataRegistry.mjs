/**
 * Canonical Sports Data Registry — Single Source of Truth for Sports Entities
 * Maps provider IDs to stable canonical IDs for Matches, Teams, Players, Competitions & Venues.
 * ZERO HARDCODED SPORTS DATA.
 */

import { toCanonicalMatch, toCanonicalTeam, toCanonicalPlayer } from './normalizers/canonicalModel.mjs';

class SportsDataRegistry {
  constructor() {
    this.matches = new Map(); // canonicalMatchId -> Canonical Match
    this.teams = new Map(); // canonicalTeamId -> Canonical Team
    this.players = new Map(); // canonicalPlayerId -> Canonical Player
    this.competitions = new Map(); // canonicalCompId -> Canonical Competition
    this.venues = new Map(); // canonicalVenueId -> Canonical Venue

    this.providerMatchMap = new Map(); // providerMatchId -> canonicalMatchId
    this.providerTeamMap = new Map(); // providerTeamId -> canonicalTeamId
    this.providerPlayerMap = new Map(); // providerPlayerId -> canonicalPlayerId
  }

  /** Normalize & resolve canonical Match ID */
  resolveMatchId(providerMatchId, providerName = 'generic') {
    if (!providerMatchId) return null;
    const cleanId = String(providerMatchId).trim();
    const mapped = this.providerMatchMap.get(`${providerName}:${cleanId}`) || this.providerMatchMap.get(cleanId);
    if (mapped) return mapped;
    const canonicalId = `match_${cleanId}`;
    this.providerMatchMap.set(`${providerName}:${cleanId}`, canonicalId);
    this.providerMatchMap.set(cleanId, canonicalId);
    return canonicalId;
  }

  /** Normalize & resolve canonical Team ID */
  resolveTeamId(providerTeamId, teamName = '', providerName = 'generic') {
    const rawId = providerTeamId ? String(providerTeamId).trim() : (teamName ? teamName.toLowerCase().replace(/[^a-z0-9]/g, '_') : null);
    if (!rawId) return null;
    const mapped = this.providerTeamMap.get(`${providerName}:${rawId}`) || this.providerTeamMap.get(rawId);
    if (mapped) return mapped;

    const canonicalId = `team_${rawId}`;
    this.providerTeamMap.set(`${providerName}:${rawId}`, canonicalId);
    this.providerTeamMap.set(rawId, canonicalId);
    return canonicalId;
  }

  /** Normalize & resolve canonical Player ID */
  resolvePlayerId(providerPlayerId, playerName = '', providerName = 'generic') {
    const rawId = providerPlayerId ? String(providerPlayerId).trim() : (playerName ? playerName.toLowerCase().replace(/[^a-z0-9]/g, '_') : null);
    if (!rawId) return null;
    const mapped = this.providerPlayerMap.get(`${providerName}:${rawId}`) || this.providerPlayerMap.get(rawId);
    if (mapped) return mapped;

    const canonicalId = `player_${rawId}`;
    this.providerPlayerMap.set(`${providerName}:${rawId}`, canonicalId);
    this.providerPlayerMap.set(rawId, canonicalId);
    return canonicalId;
  }

  /** Register or update a canonical match entity */
  registerMatch(rawMatch, providerName = 'generic') {
    if (!rawMatch) return null;
    const rawId = rawMatch.id || rawMatch.matchId;
    if (!rawId) return null;

    const canonicalId = this.resolveMatchId(rawId, providerName);
    const existing = this.matches.get(canonicalId) || {};

    const updated = {
      ...existing,
      ...rawMatch,
      id: canonicalId,
      canonicalMatchId: canonicalId,
      providerMatchId: rawId,
      providerName,
      lastUpdatedAt: new Date().toISOString(),
      matchVersion: (existing.matchVersion || 0) + 1,
    };

    this.matches.set(canonicalId, updated);
    return updated;
  }

  /** Get registered canonical match by ID */
  getMatch(matchId) {
    if (!matchId) return null;
    const canonicalId = this.resolveMatchId(matchId);
    return this.matches.get(canonicalId) || this.matches.get(matchId) || null;
  }

  /** List all active canonical matches */
  getAllMatches() {
    return Array.from(this.matches.values());
  }

  /** Clear registry cache for testing */
  clear() {
    this.matches.clear();
    this.teams.clear();
    this.players.clear();
    this.competitions.clear();
    this.venues.clear();
    this.providerMatchMap.clear();
    this.providerTeamMap.clear();
    this.providerPlayerMap.clear();
  }
}

export const sportsDataRegistry = new SportsDataRegistry();
