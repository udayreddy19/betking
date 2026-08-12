import { describe, it, expect } from 'vitest';
import { canonicalSportsMapper, normalizeTeamName, calculateTeamSimilarity } from '../../lib/canonicalSportsMapper.mjs';
import { sportsDataRegistry } from '../../lib/sportsDataRegistry.mjs';

describe('Phase 3 Canonical Mapper & Match Deduplication Tests', () => {
  it('should normalize team names correctly ignoring variations', () => {
    expect(normalizeTeamName('India Men')).toBe('india');
    expect(normalizeTeamName('India U19')).toBe('india');
    expect(normalizeTeamName('SIECHEM Madurai Panthers')).toBe('siechem madurai panthers');
  });

  it('should calculate high team similarity for team name variations', () => {
    const sim = calculateTeamSimilarity('India', 'India Men');
    expect(sim).toBeGreaterThanOrEqual(0.80);
  });

  it('CRITICAL: same match from two providers within start time window maps to ONE canonical ID', async () => {
    sportsDataRegistry.clear();

    const providerAMatch = {
      matchId: 'cb_555',
      homeTeam: { name: 'India' },
      awayTeam: { name: 'Australia' },
      scheduledTime: '2026-08-20T14:00:00Z',
    };

    const providerBMatch = {
      matchId: 'espn_999',
      homeTeam: { name: 'India Men' },
      awayTeam: { name: 'Australia' },
      scheduledTime: '2026-08-20T14:05:00Z', // 5 minutes difference
    };

    // Register first match from Cricbuzz
    sportsDataRegistry.registerMatch(providerAMatch, 'cricbuzz');

    // Resolve second match from ESPN
    const canonicalId1 = await canonicalSportsMapper.resolveOrCreateCanonicalMatch(providerAMatch, 'cricbuzz');
    const canonicalId2 = await canonicalSportsMapper.resolveOrCreateCanonicalMatch(providerBMatch, 'espn');

    expect(canonicalId1).toBe(canonicalId2);
  });
});
