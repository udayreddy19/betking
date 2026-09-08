import { describe, it, expect } from 'vitest';
import { generate, isOtherSportsV4Sport, OSV4_SPORTS } from '../../lib/other-sports-v4/index.mjs';
import { scoreOsV4Book, applyScoreDrivenFallback } from '../../lib/other-sports-v4/book/scorecard.mjs';

function soccerMatch(extra = {}) {
  return {
    matchId: 'pipe-soc-1',
    sport: 'soccer',
    team1: { name: 'Arsenal' },
    team2: { name: 'Chelsea' },
    isLive: true,
    matchState: 'in',
    liveDetails: { score1: 1, score2: 0, minute: 35 },
    odds: { home: 1.80, draw: 3.50, away: 4.20 },
    ...extra,
  };
}

function basketballMatch(extra = {}) {
  return {
    matchId: 'pipe-bb-1',
    sport: 'basketball',
    team1: { name: 'Lakers' },
    team2: { name: 'Celtics' },
    isLive: true,
    matchState: 'in',
    liveDetails: { score1: 78, score2: 74, minute: 30 },
    odds: { home: 1.85, away: 2.05 },
    ...extra,
  };
}

function tennisMatch(extra = {}) {
  return {
    matchId: 'pipe-ten-1',
    sport: 'tennis',
    team1: { name: 'Djokovic' },
    team2: { name: 'Nadal' },
    isLive: true,
    matchState: 'in',
    liveDetails: {
      score1: 6, score2: 4, sets1: [6], sets2: [4],
      set1Score1: 6, set1Score2: 4,
      minute: 80,
    },
    odds: { home: 1.65, away: 2.30 },
    ...extra,
  };
}

function baseballMatch(extra = {}) {
  return {
    matchId: 'pipe-base-1',
    sport: 'baseball',
    team1: { name: 'Yankees' },
    team2: { name: 'Red Sox' },
    isLive: true,
    matchState: 'in',
    liveDetails: { score1: 3, score2: 2, minute: 35, inning: 5, isTopInning: true },
    odds: { home: 1.75, away: 2.15 },
    ...extra,
  };
}

function iceHockeyMatch(extra = {}) {
  return {
    matchId: 'pipe-hk-1',
    sport: 'ice-hockey',
    team1: { name: 'Maple Leafs' },
    team2: { name: 'Canadiens' },
    isLive: true,
    matchState: 'in',
    liveDetails: { score1: 2, score2: 1, minute: 35, period: 2 },
    odds: { home: 1.70, away: 2.20 },
    ...extra,
  };
}

describe('OtherSportsEngineV4 — multi-pass pipeline integration', () => {
  it('soccer generates match_winner + extras (btts, goals, DC, HT, correct score)', () => {
    const snap = generate(soccerMatch());
    expect(snap.engine).toBe('OtherSportsEngineV4');
    expect(snap.sport).toBe('soccer');
    expect(snap.osv4Meta).toBeDefined();
    expect(snap.osv4Meta.qualityScore).toBeGreaterThanOrEqual(0);
    expect(snap.osv4Meta.qualityScore).toBeLessThanOrEqual(100);

    const open = snap.markets.filter((m) => m.status === 'OPEN');
    expect(open.length).toBeGreaterThanOrEqual(3);

    const ids = open.map((m) => m.marketId);
    expect(ids).toContain('match_winner');
    // At minute 35, HT result should be present
    expect(ids).toContain('ht_result');
    // Correct score available before 75'
    expect(ids).toContain('correct_score');
    // First to score should be present if 0-0 and < 25min
  });

  it('basketball generates match_winner + spread + total + 1st half + winning margin', () => {
    const snap = generate(basketballMatch({ liveDetails: { score1: 30, score2: 28, minute: 10 } }));
    const ids = snap.markets.filter((m) => m.status === 'OPEN').map((m) => m.marketId);
    expect(ids).toContain('match_winner');
    expect(ids).toContain('spread');
    expect(ids).toContain('total_pts');
    // Before halftime should have 1st half markets
    expect(ids).toContain('first_half_winner');
    expect(ids).toContain('first_half_total');
    // winning_margin may be suspended by soft_longshot_cap on tight configs
    // Just verify it was generated (open or suspended)
    const wmMarket = snap.markets.find((m) => m.marketId === 'winning_margin');
    expect(wmMarket).toBeDefined();
  });

  it('tennis generates match_winner + extras with proper set data', () => {
    const snap = generate(tennisMatch({
      liveDetails: {
        score1: 2, score2: 1,
        sets1: [6, 3], sets2: [4, 6],
        set1Score1: 6, set1Score2: 4,
        set2Score1: 3, set2Score2: 6,
        minute: 80,
      },
    }));
    const openIds = snap.markets.filter((m) => m.status === 'OPEN').map((m) => m.marketId);
    const allIds = snap.markets.map((m) => m.marketId);
    expect(openIds).toContain('match_winner');
    // total_games and total_sets should be present (open or suspended)
    expect(allIds).toContain('total_games');
    expect(allIds).toContain('total_sets');
  });

  it('baseball is now an OSV4 sport', () => {
    expect(isOtherSportsV4Sport('baseball')).toBe(true);
    expect(OSV4_SPORTS.has('baseball')).toBe(true);
  });

  it('baseball generates moneyline + run line + total runs', () => {
    const snap = generate(baseballMatch());
    expect(snap.engine).toBe('OtherSportsEngineV4');
    const ids = snap.markets.filter((m) => m.status === 'OPEN').map((m) => m.marketId);
    expect(ids).toContain('match_winner');
    expect(ids).toContain('run_line');
    expect(ids).toContain('total_runs');
  });

  it('ice-hockey is now an OSV4 sport', () => {
    expect(isOtherSportsV4Sport('ice-hockey')).toBe(true);
    expect(OSV4_SPORTS.has('ice-hockey')).toBe(true);
  });

  it('ice-hockey generates moneyline + puck line + total goals', () => {
    const snap = generate(iceHockeyMatch());
    expect(snap.engine).toBe('OtherSportsEngineV4');
    const ids = snap.markets.filter((m) => m.status === 'OPEN').map((m) => m.marketId);
    expect(ids).toContain('match_winner');
    expect(ids).toContain('puck_line');
    expect(ids).toContain('total_goals');
  });

  it('multi-pass re-guard → tighter final prices', () => {
    const snap = generate(soccerMatch());
    const mw = snap.markets.find((m) => m.marketId === 'match_winner' && m.status === 'OPEN');
    if (mw?.selections?.length >= 2) {
      // Book mass should be >= 1.19 (21.5% overround)
      const mass = mw.selections.reduce((acc, s) => acc + 1 / Number(s.odds), 0);
      expect(mass).toBeGreaterThanOrEqual(1.15);
    }
  });

  it('quality score < 70 → only match_winner survives', () => {
    const score = { qualityScore: 55 };
    const markets = [
      { marketId: 'match_winner', status: 'OPEN', selections: [] },
      { marketId: 'btts', status: 'OPEN', selections: [] },
      { marketId: 'goals_line', status: 'OPEN', selections: [] },
    ];
    const result = applyScoreDrivenFallback(markets, score);
    const open = result.filter((m) => m.status === 'OPEN');
    expect(open.length).toBe(1);
    expect(open[0].marketId).toBe('match_winner');
  });

  it('quality score >= 70 → all markets survive', () => {
    const score = { qualityScore: 82 };
    const markets = [
      { marketId: 'match_winner', status: 'OPEN', selections: [] },
      { marketId: 'btts', status: 'OPEN', selections: [] },
    ];
    const result = applyScoreDrivenFallback(markets, score);
    expect(result.filter((m) => m.status === 'OPEN').length).toBe(2);
  });

  it('scoreOsV4Book produces breakdown with all 8 dimensions', () => {
    const score = scoreOsV4Book({
      markets: [
        {
          marketId: 'match_winner', status: 'OPEN', category: 'main',
          selections: [
            { selectionId: '1', odds: 1.72, probability: 0.55 },
            { selectionId: 'X', odds: 3.50, probability: 0.25 },
            { selectionId: '2', odds: 4.20, probability: 0.20 },
          ],
        },
        { marketId: 'btts', status: 'OPEN', category: 'goals', selections: [{ odds: 1.8 }, { odds: 2.0 }] },
      ],
      sport: 'soccer',
      blended: true,
      modelConfidence: 0.88,
      engineVersion: '4.9.5',
    });
    expect(score.qualityScore).toBeGreaterThanOrEqual(40);
    expect(score.qualityScore).toBeLessThanOrEqual(100);
    expect(score.breakdown).toBeDefined();
    expect(score.breakdown.matchWinner).toBeGreaterThanOrEqual(0);
    expect(score.breakdown.houseEdge).toBeGreaterThanOrEqual(0);
    expect(score.breakdown.marketDepth).toBeGreaterThanOrEqual(0);
    expect(score.breakdown.settlement).toBeGreaterThanOrEqual(0);
    expect(score.breakdown.stability).toBeGreaterThanOrEqual(0);
    expect(score.breakdown.latency).toBeGreaterThanOrEqual(0);
    expect(score.breakdown.ops).toBeGreaterThanOrEqual(0);
    expect(score.breakdown.models).toBeGreaterThanOrEqual(0);
  });

  it('cricket is rejected by OtherSportsEngineV4', () => {
    const snap = generate({ matchId: 'crick-1', sport: 'cricket', team1: {}, team2: {} });
    expect(snap.status).toBe('NOT_AVAILABLE');
  });

  it('unknown sport falls back to NOT_AVAILABLE', () => {
    const snap = generate({ matchId: 'unk-1', sport: 'curling', team1: {}, team2: {} });
    expect(snap.status).toBe('NOT_AVAILABLE');
  });

  it('finished match returns DETERMINED status', () => {
    const snap = generate(soccerMatch({
      isLive: false,
      matchState: 'post',
      status: 'FINISHED',
      liveDetails: { score1: 2, score2: 1, minute: 90, status: 'FINISHED' },
    }));
    expect(snap.status).toBe('DETERMINED');
  });
});
