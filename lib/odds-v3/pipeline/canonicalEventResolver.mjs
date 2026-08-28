/**
 * OddsEngineV3 — Canonical Event Identity & Provider Mapping Engine
 * 
 * Maps multi-provider event streams to a single deterministic canonical_event_id.
 * Resolves divergent team naming conventions while rejecting ambiguous or conflicting merges.
 */

import crypto from 'crypto';

export const RESOLUTION_STATUS = Object.freeze({
  MATCHED: 'MATCHED',
  POSSIBLE_MATCH: 'POSSIBLE_MATCH',
  UNMATCHED: 'UNMATCHED',
  CONFLICT: 'CONFLICT',
});

const TEAM_NAME_ALIASES = {
  ind: 'india',
  aus: 'australia',
  eng: 'england',
  pak: 'pakistan',
  sa: 'south africa',
  nz: 'new zealand',
  wi: 'west indies',
  csk: 'chennai super kings',
  mi: 'mumbai indians',
  rcb: 'royal challengers bengaluru',
  kkr: 'kolkata knight riders',
};

/**
 * Normalizes team names by lowercasing, stripping punctuation, and resolving common acronyms.
 */
export function normalizeTeamName(name = '') {
  const cleaned = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
  return TEAM_NAME_ALIASES[cleaned] || cleaned;
}

/**
 * Generates a deterministic canonical event ID from sport, normalized teams, and date.
 */
export function generateCanonicalEventId({ sport = 'cricket', team1, team2, dateStr }) {
  const t1 = normalizeTeamName(team1);
  const t2 = normalizeTeamName(team2);
  const sortedTeams = [t1, t2].sort().join('_vs_');
  const d = dateStr ? new Date(dateStr).toISOString().substring(0, 10) : 'unknown_date';
  const rawKey = `${sport.toLowerCase()}_${sortedTeams}_${d}`;

  const hash = crypto.createHash('sha256').update(rawKey).digest('hex').substring(0, 12);
  return `evt_${sport.toLowerCase()}_${hash}`;
}

/**
 * Resolves an incoming provider event against known canonical matches.
 */
export function resolveCanonicalEvent({
  providerName,
  providerEventId,
  sport = 'cricket',
  team1,
  team2,
  startTime,
  existingCanonicalEvents = [],
} = {}) {
  const norm1 = normalizeTeamName(team1);
  const norm2 = normalizeTeamName(team2);
  const candidateId = generateCanonicalEventId({ sport, team1: norm1, team2: norm2, dateStr: startTime });

  // Direct match by generated canonical ID
  const directMatch = existingCanonicalEvents.find((e) => e.canonicalEventId === candidateId);
  if (directMatch) {
    return {
      status: RESOLUTION_STATUS.MATCHED,
      canonicalEventId: directMatch.canonicalEventId,
      confidence: 1.0,
      providerMapping: { providerName, providerEventId, canonicalEventId: directMatch.canonicalEventId },
    };
  }

  // Fuzzy check for partial team matching
  let bestMatch = null;
  let highestScore = 0;

  for (const existing of existingCanonicalEvents) {
    if (existing.sport !== sport) continue;
    const ex1 = normalizeTeamName(existing.team1);
    const ex2 = normalizeTeamName(existing.team2);

    const matchT1 = ex1 === norm1 || ex1.includes(norm1) || norm1.includes(ex1);
    const matchT2 = ex2 === norm2 || ex2.includes(norm2) || norm2.includes(ex2);

    if (matchT1 && matchT2) {
      highestScore = 0.95;
      bestMatch = existing;
      break;
    } else if (matchT1 || matchT2) {
      highestScore = 0.60;
      bestMatch = existing;
    }
  }

  if (highestScore >= 0.85 && bestMatch) {
    return {
      status: RESOLUTION_STATUS.MATCHED,
      canonicalEventId: bestMatch.canonicalEventId,
      confidence: highestScore,
      providerMapping: { providerName, providerEventId, canonicalEventId: bestMatch.canonicalEventId },
    };
  }

  if (highestScore >= 0.50 && bestMatch) {
    return {
      status: RESOLUTION_STATUS.POSSIBLE_MATCH,
      canonicalEventId: bestMatch.canonicalEventId,
      confidence: highestScore,
      reason: 'Partial team name match below automatic resolution threshold (requires review).',
    };
  }

  return {
    status: RESOLUTION_STATUS.UNMATCHED,
    canonicalEventId: candidateId,
    confidence: 1.0,
    providerMapping: { providerName, providerEventId, canonicalEventId: candidateId },
  };
}
