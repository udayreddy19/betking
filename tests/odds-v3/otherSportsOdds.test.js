import { describe, it, expect } from 'vitest';
import { generate } from '../../lib/odds-v3/OddsEngineV3.mjs';
import { generateOtherSportsSnapshot } from '../../lib/odds-v3/otherSportsOdds.mjs';
import { extractMatchWinnerOdds } from '../../lib/odds-v3/extractMatchWinnerOdds.mjs';
import { adaptV3SnapshotToPublicContract } from '../../lib/odds-v3/adapters/V3ApiAdapter.mjs';

function soccerMatch(overrides = {}) {
  return {
    id: 'api_soc_1',
    sport: 'soccer',
    isLive: true,
    matchState: 'in',
    team1: { name: 'Arsenal' },
    team2: { name: 'Chelsea' },
    liveDetails: { score1: 1, score2: 0, minute: "62' 2nd Half" },
    ...overrides,
  };
}

describe('Other sports odds', () => {
  it('prices soccer using Dixon-Coles model when provider odds are missing', () => {
    const snap = generateOtherSportsSnapshot(soccerMatch(), { winnerOnly: true });
    expect(snap.status).toBe('OK');
    expect(snap.markets.length).toBeGreaterThan(0);
    const winner = extractMatchWinnerOdds(snap, soccerMatch());
    expect(winner.team1).toBeGreaterThan(1);
    expect(winner.team2).toBeGreaterThan(1);
  });

  it('prices soccer 1X2 including draw for list cards when provider odds exist', () => {
    const match = soccerMatch({
      odds: { home: 2.1, away: 3.4, draw: 3.2, team1: 2.1, team2: 3.4 },
    });
    const snap = generateOtherSportsSnapshot(match, { winnerOnly: true });
    expect(snap.status).toBe('OK');
    const winner = extractMatchWinnerOdds(snap, match);
    expect(winner.team1).toBeGreaterThan(1);
    expect(winner.team2).toBeGreaterThan(1);
    expect(winner.draw).toBeGreaterThan(1);
  });

  it('prefers 10cric provider winner odds when present', () => {
    const match = soccerMatch({
      odds: { home: 1.55, away: 6.2, team1: 1.55, team2: 6.2, draw: 4.1 },
    });
    const snap = generateOtherSportsSnapshot(match, { winnerOnly: true });
    const winner = extractMatchWinnerOdds(snap, match);
    expect(winner.team1).toBeLessThan(winner.team2);
    expect(winner.draw).toBeGreaterThan(1);
  });

  it('builds soccer extra markets for match detail', () => {
    const match = soccerMatch({
      odds: { home: 2.1, away: 3.4, draw: 3.2, team1: 2.1, team2: 3.4 },
    });
    const snap = generate(match);
    const publicSnap = adaptV3SnapshotToPublicContract(snap, match);
    const ids = publicSnap.markets.map((m) => m.marketId);
    expect(ids).toContain('match_winner');
    expect(ids).toContain('btts');
    expect(ids).toContain('goals_line');
    expect(ids).toContain('double_chance');
    expect(publicSnap.markets.some((m) => m.marketType === 'NEXT_DELIVERY_RUNS')).toBe(false);
    const winner = publicSnap.markets.find((m) => m.marketId === 'match_winner');
    expect(winner.options).toHaveLength(3);
    expect(winner.options.every((o) => o.bettable && o.odds >= 1.01)).toBe(true);
  });

  it('prices basketball moneyline without a draw', () => {
    const match = {
      id: 'api_bball_1',
      sport: 'basketball',
      isLive: true,
      matchState: 'in',
      team1: { name: 'Lakers' },
      team2: { name: 'Celtics' },
      liveDetails: { score1: 88, score2: 81 },
      odds: { home: 1.72, away: 2.15, team1: 1.72, team2: 2.15 },
    };
    const winner = extractMatchWinnerOdds(generate(match, { winnerOnly: true }), match);
    expect(winner.team1).toBeGreaterThan(1);
    expect(winner.team2).toBeGreaterThan(1);
    expect(winner.draw).toBeNull();
    const full = generate(match);
    expect(full.markets.some((m) => m.marketId === 'spread')).toBe(true);
    expect(full.markets.some((m) => m.marketId === 'total_pts')).toBe(true);
  });

  it('prices tennis match winner', () => {
    const match = {
      id: 'api_ten_1',
      sport: 'tennis',
      isLive: false,
      matchState: 'pre',
      team1: { name: 'Alcaraz' },
      team2: { name: 'Sinner' },
      liveDetails: { score1: 0, score2: 0 },
      odds: { home: 1.65, away: 2.25, team1: 1.65, team2: 2.25 },
    };
    const winner = extractMatchWinnerOdds(generate(match, { winnerOnly: true }), match);
    expect(winner.team1).toBeGreaterThan(1);
    expect(winner.team2).toBeGreaterThan(1);
  });

  it('closes markets on finished matches', () => {
    const snap = generate(soccerMatch({ isLive: false, matchState: 'post', time: 'FT' }));
    expect(snap.status).toBe('DETERMINED');
    expect(snap.markets).toEqual([]);
  });
});
