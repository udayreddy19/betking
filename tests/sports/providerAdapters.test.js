import { describe, it, expect } from 'vitest';
import { cricbuzzAdapter } from '../../lib/sports/adapters/cricbuzzAdapter.mjs';
import { espnAdapter } from '../../lib/sports/adapters/espnAdapter.mjs';
import { fancodeAdapter } from '../../lib/sports/adapters/fancodeAdapter.mjs';
import { srlAdapter } from '../../lib/sports/adapters/srlAdapter.mjs';

describe('Phase 3 Provider Adapters & Normalization Tests', () => {
  it('CricbuzzAdapter should normalize raw match object to CanonicalMatch', () => {
    const raw = { id: 'cric_101', homeTeam: { name: 'India' }, awayTeam: { name: 'Australia' }, isLive: true };
    const canonical = cricbuzzAdapter.normalizeMatch(raw);

    expect(canonical.provider).toBe('cricbuzz');
    expect(canonical.matchName).toBe('India vs Australia');
    expect(canonical.status).toBe('LIVE');
    expect(canonical.sport.sportName).toBe('Cricket');
  });

  it('ESPNAdapter should normalize ESPN payload to CanonicalMatch', () => {
    const raw = { id: 'espn_202', homeTeam: { name: 'Arsenal' }, awayTeam: { name: 'Chelsea' }, sport: 'soccer', matchState: 'in' };
    const canonical = espnAdapter.normalizeMatch(raw);

    expect(canonical.provider).toBe('espn');
    expect(canonical.matchName).toBe('Arsenal vs Chelsea');
    expect(canonical.status).toBe('LIVE');
    expect(canonical.sport.sportName).toBe('Soccer');
  });

  it('SRLAdapter should normalize Virtual SRL match to CanonicalMatch', () => {
    const raw = { matchId: 'srl_303', team1: { name: 'Mumbai Indians SRL' }, team2: { name: 'Chennai Super Kings SRL' }, isLive: true };
    const canonical = srlAdapter.normalizeMatch(raw);

    expect(canonical.provider).toBe('srl_engine');
    expect(canonical.matchName).toBe('Mumbai Indians SRL vs Chennai Super Kings SRL');
  });
});
