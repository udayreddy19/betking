/**
 * Canonical Sports Mapper & Match Deduplication Engine
 * Deduplicates real-world matches across multiple providers (Cricbuzz, ESPN, FanCode, SRL),
 * handles team name variations, and manages conflict resolution in PostgreSQL.
 */

import { query } from '../db/pg.js';
import { sportsDataRegistry } from './sportsDataRegistry.mjs';

/** Normalize team name string for matching */
export function normalizeTeamName(name = '') {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/\b(men|women|u19|u21|cc|xi|sr|jr)\b/gi, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compute string similarity (0.0 to 1.0) */
export function calculateTeamSimilarity(nameA = '', nameB = '') {
  const normA = normalizeTeamName(nameA);
  const normB = normalizeTeamName(nameB);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;
  if (normA.includes(normB) || normB.includes(normA)) return 0.85;

  const wordsA = new Set(normA.split(' '));
  const wordsB = new Set(normB.split(' '));
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

class CanonicalSportsMapper {
  /**
   * Map provider match to a canonical match ID
   * Performs deduplication based on team similarity & scheduled start time window
   */
  async resolveOrCreateCanonicalMatch(providerMatch, providerName = 'generic') {
    if (!providerMatch) return null;
    const providerMatchId = String(providerMatch.matchId || providerMatch.id || providerMatch.providerMatchId);
    if (!providerMatchId) return null;

    // 1. Check existing mapping in PostgreSQL provider_entity_mappings
    try {
      const dbMapping = await query(`
        SELECT canonical_entity_id, confidence_score, mapping_status
        FROM provider_entity_mappings
        WHERE provider_id = $1 AND entity_type = 'MATCH' AND provider_entity_id = $2;
      `, [providerName, providerMatchId]);

      if (dbMapping.rows.length > 0) {
        const canonicalId = dbMapping.rows[0].canonical_entity_id;
        sportsDataRegistry.providerMatchMap.set(`${providerName}:${providerMatchId}`, canonicalId);
        sportsDataRegistry.providerMatchMap.set(providerMatchId, canonicalId);
        return canonicalId;
      }
    } catch (err) {
      console.warn('[CanonicalMapper DB Warning]', err.message);
    }

    // 2. Perform Match Deduplication check against active registered matches
    const homeName = providerMatch.homeTeam?.teamName || providerMatch.homeTeam?.name || '';
    const awayName = providerMatch.awayTeam?.teamName || providerMatch.awayTeam?.name || '';
    const startTimeMs = new Date(providerMatch.scheduledTime || Date.now()).getTime();

    const registeredMatches = sportsDataRegistry.getAllMatches();
    let bestMatch = null;
    let highestConfidence = 0;

    for (const match of registeredMatches) {
      const existingHome = match.homeTeam?.teamName || match.homeTeam?.name || '';
      const existingAway = match.awayTeam?.teamName || match.awayTeam?.name || '';
      const existingTimeMs = new Date(match.scheduledTime || Date.now()).getTime();

      // Check start time window tolerance (±45 minutes)
      const timeDiffMins = Math.abs(startTimeMs - existingTimeMs) / (1000 * 60);
      if (timeDiffMins <= 45) {
        const simDirect = (calculateTeamSimilarity(homeName, existingHome) + calculateTeamSimilarity(awayName, existingAway)) / 2;
        const simSwap = (calculateTeamSimilarity(homeName, existingAway) + calculateTeamSimilarity(awayName, existingHome)) / 2;
        const bestSim = Math.max(simDirect, simSwap);

        if (bestSim > highestConfidence && bestSim >= 0.70) {
          highestConfidence = bestSim;
          bestMatch = match;
        }
      }
    }

    let canonicalMatchId;
    let mappingStatus = 'MATCHED';
    let confidenceScore = 100.0;

    if (bestMatch && highestConfidence >= 0.70) {
      canonicalMatchId = bestMatch.canonicalMatchId || bestMatch.id;
      confidenceScore = parseFloat((highestConfidence * 100).toFixed(2));
      if (highestConfidence < 0.85) {
        mappingStatus = 'MANUAL_REVIEW';
      }
    } else {
      canonicalMatchId = `match_${providerName}_${providerMatchId}`;
    }

    // 3. Persist mapping into PostgreSQL provider_entity_mappings
    try {
      await query(`
        INSERT INTO provider_entity_mappings (id, entity_type, provider_id, provider_entity_id, canonical_entity_id, confidence_score, mapping_status)
        VALUES ($1, 'MATCH', $2, $3, $4, $5, $6)
        ON CONFLICT (provider_id, entity_type, provider_entity_id)
        DO UPDATE SET canonical_entity_id = EXCLUDED.canonical_entity_id, confidence_score = EXCLUDED.confidence_score;
      `, [`map_m_${providerName}_${providerMatchId}`, providerName, providerMatchId, canonicalMatchId, confidenceScore, mappingStatus]);
    } catch (err) {
      console.warn('[CanonicalMapper Insert Warning]', err.message);
    }

    sportsDataRegistry.providerMatchMap.set(`${providerName}:${providerMatchId}`, canonicalMatchId);
    sportsDataRegistry.providerMatchMap.set(providerMatchId, canonicalMatchId);
    return canonicalMatchId;
  }

  /** Record provider score or status conflict in PostgreSQL data_conflicts */
  async recordConflict(canonicalMatchId, fieldName, providerA, valA, providerB, valB) {
    try {
      const conflictId = `cnfl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await query(`
        INSERT INTO data_conflicts (id, entity_type, canonical_entity_id, field_name, provider_a_name, provider_a_value, provider_b_name, provider_b_value, status, severity)
        VALUES ($1, 'MATCH', $2, $3, $4, $5, $6, $7, 'OPEN', 'MEDIUM');
      `, [conflictId, canonicalMatchId, fieldName, providerA, String(valA), providerB, String(valB)]);
    } catch (err) {
      console.warn('[Conflict Recording Error]', err.message);
    }
  }
}

export const canonicalSportsMapper = new CanonicalSportsMapper();
