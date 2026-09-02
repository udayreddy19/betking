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
    const snap = generateOtherSportsSnapshot(soccerMatch(), { winnerOnly: true, allowModelOnly: true });
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
    expect(ids).toContain('dnb');
    expect(publicSnap.markets.some((m) => m.marketType === 'NEXT_DELIVERY_RUNS')).toBe(false);
    const winner = publicSnap.markets.find((m) => m.marketId === 'match_winner');
    expect(winner.options).toHaveLength(3);
    expect(winner.options.every((o) => o.bettable && o.odds >= 1.01)).toBe(true);
  });

  it('still prices match-detail extras after aggregator stamps OddsEngineV3 odds', () => {
    const match = soccerMatch({
      oddsSource: 'OddsEngineV3',
      odds: { home: 2.05, away: 3.5, draw: 3.3, team1: 2.05, team2: 3.5 },
      marketReferenceData: {
        providerOdds: { home: 2.1, away: 3.4, draw: 3.2, team1: 2.1, team2: 3.4 },
      },
    });
    const ids = generate(match).markets.map((m) => m.marketId);
    expect(ids).toContain('match_winner');
    expect(ids).toContain('double_chance');
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

  it('maps football sport key onto the soccer book', () => {
    const match = soccerMatch({
      sport: 'football',
      odds: { home: 2.1, away: 3.4, draw: 3.2, team1: 2.1, team2: 3.4 },
    });
    const ids = generate(match).markets.map((m) => m.marketId);
    expect(ids).toContain('btts');
    expect(ids).toContain('dnb');
  });

  it('suspends tennis set markets when the feed has no set scores', () => {
    const match = {
      id: 'api_ten_1',
      sport: 'tennis',
      isLive: true,
      matchState: 'in',
      team1: { name: 'Alcaraz' },
      team2: { name: 'Sinner' },
      liveDetails: { score1: 1, score2: 0 },
      odds: { home: 1.65, away: 2.25, team1: 1.65, team2: 2.25 },
    };
    const full = generate(match);
    const set1 = full.markets.find((m) => m.marketId === 'set1_winner');
    const games = full.markets.find((m) => m.marketId === 'total_games');
    expect(set1?.status === 'OPEN').toBe(false);
    expect(games?.status === 'OPEN').toBe(false);
  });

  it('opens tennis set markets when ESPN-style set scores exist', () => {
    const match = {
      id: 'api_ten_2',
      sport: 'tennis',
      isLive: true,
      matchState: 'in',
      team1: { name: 'Alcaraz' },
      team2: { name: 'Sinner' },
      liveDetails: { score1: 1, score2: 0, sets1: [6, 2], sets2: [4, 1] },
      odds: { home: 1.65, away: 2.25, team1: 1.65, team2: 2.25 },
    };
    const full = generate(match);
    expect(full.markets.find((m) => m.marketId === 'set1_winner')?.status).toBe('OPEN');
    expect(full.markets.find((m) => m.marketId === 'total_games')?.status).toBe('OPEN');
  });

  it('prices NFL spread and total like basketball with a football line', () => {
    const match = {
      id: 'api_nfl_1',
      sport: 'american-football',
      isLive: false,
      matchState: 'pre',
      team1: { name: 'Chiefs' },
      team2: { name: 'Bills' },
      liveDetails: { score1: 0, score2: 0 },
      odds: { home: 1.90, away: 1.90, team1: 1.90, team2: 1.90 },
    };
    const full = generate(match);
    expect(full.markets.some((m) => m.marketId === 'spread')).toBe(true);
    const total = full.markets.find((m) => m.marketId === 'total_pts');
    expect(total?.line).toBe(44.5);
  });

  it('prices kabaddi match total and volleyball set markets', () => {
    const kabaddi = generate({
      id: 'api_kab_1',
      sport: 'kabaddi',
      isLive: true,
      matchState: 'in',
      team1: { name: 'Patna' },
      team2: { name: 'Bengal' },
      liveDetails: { score1: 18, score2: 16 },
      odds: { home: 1.80, away: 2.00, team1: 1.80, team2: 2.00 },
    });
    expect(kabaddi.markets.some((m) => m.marketId === 'match_total')).toBe(true);

    const vb = generate({
      id: 'api_vb_1',
      sport: 'volleyball',
      isLive: true,
      matchState: 'in',
      team1: { name: 'Italy' },
      team2: { name: 'Brazil' },
      liveDetails: { score1: 1, score2: 0, sets1: [25], sets2: [20] },
      odds: { home: 1.55, away: 2.40, team1: 1.55, team2: 2.40 },
    });
    expect(vb.markets.find((m) => m.marketId === 'set1_winner')?.status).toBe('OPEN');
    expect(vb.markets.some((m) => m.marketId === 'total_sets')).toBe(true);
  });

  it('prices table tennis extras only when set scores exist', () => {
    const withSets = generate({
      id: 'api_tt_1',
      sport: 'table-tennis',
      isLive: true,
      matchState: 'in',
      team1: { name: 'Fan Zhendong' },
      team2: { name: 'Ma Long' },
      liveDetails: { score1: 2, score2: 1, sets1: [11, 9, 11], sets2: [7, 11, 8] },
      odds: { home: 1.70, away: 2.10, team1: 1.70, team2: 2.10 },
    });
    expect(withSets.markets.find((m) => m.marketId === 'set1_winner')?.status).toBe('OPEN');
    expect(withSets.markets.some((m) => m.marketId === 'total_points')).toBe(true);
  });
});
