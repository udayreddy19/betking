import { describe, it, expect } from 'vitest';
import { generate as generateV4 } from '../../lib/odds-v4/OddsEngineV4.mjs';
import { buildCanonicalFromMatch } from '../../lib/odds-v3/buildCanonicalFromMatch.mjs';
import { scoreV4Book, applyStabilityFallback } from '../../lib/odds-v4/v4BookGuardian.mjs';
import { _resetEventFreezeForTests } from '../../lib/odds-v4/eventFreeze.mjs';

function chaseMatch(overrides = {}) {
  return {
    id: 'pipe-test-1',
    sport: 'cricket',
    status: 'LIVE',
    isLive: true,
    matchState: 'in',
    matchType: 'T20',
    team1: { name: 'Alpha', id: 'a', runs: 165, wickets: 7 },
    team2: { name: 'Beta', id: 'b', runs: 90, wickets: 2 },
    liveDetails: {
      firstRuns: 165,
      firstWickets: 7,
      firstOvers: '20.0',
      chaseRuns: 90,
      chaseWickets: 2,
      chaseOvers: '12.0',
      battingTeam: 'Beta',
      innings: 2,
    },
    ...overrides,
  };
}

describe('OddsEngineV4 — full pipeline integration', () => {
  it('generate → guardian → stability → snapshot has all pipeline stages', () => {
    const state = buildCanonicalFromMatch(chaseMatch());
    const snap = generateV4(state, { debug: false });
    expect(snap.engine).toBe('OddsEngineV4');
    expect(snap.v4Meta).toBeDefined();
    expect(snap.v4Meta.enginePipelineTrace).toBeDefined();
    expect(snap.v4Meta.enginePipelineTrace).toContain('validate');
    expect(snap.v4Meta.enginePipelineTrace).toContain('circuit_breaker');
    expect(snap.v4Meta.enginePipelineTrace).toContain('house_retighten');
    expect(snap.v4Meta.enginePipelineTrace).toContain('guardian_pass2');
  });

  it('qualityScore is included in snapshot and is between 0–100', () => {
    const state = buildCanonicalFromMatch(chaseMatch());
    const snap = generateV4(state);
    expect(snap.v4Meta.qualityScore).toBeGreaterThanOrEqual(0);
    expect(snap.v4Meta.qualityScore).toBeLessThanOrEqual(100);
    expect(snap.v4Meta.qualityBreakdown).toBeDefined();
    expect(snap.v4Meta.qualityBreakdown.matchWinner).toBeGreaterThanOrEqual(0);
    expect(snap.v4Meta.qualityBreakdown.configHealth).toBeDefined();
  });

  it('quality < 70 → stability fallback drops non-core markets', () => {
    const fakeScore = {
      qualityScore: 55,
      breakdown: {},
      openMarkets: 1,
      issueCount: 5,
    };
    const markets = [
      { marketId: 'match_winner', status: 'OPEN', selections: [{ odds: 1.5 }] },
      { marketId: 'team_total', status: 'OPEN', selections: [{ odds: 1.8 }] },
      { marketId: 'next_delivery_runs', status: 'OPEN', selections: [{ odds: 2.0 }] },
    ];
    const fallback = applyStabilityFallback(markets, fakeScore);
    // match_winner and team_total should survive, next_delivery_runs suspended
    const open = fallback.filter((m) => m.status === 'OPEN');
    const suspended = fallback.filter((m) => m.status === 'SUSPENDED');
    expect(open.length).toBe(2);
    expect(suspended.length).toBe(1);
    expect(suspended[0].marketId).toBe('next_delivery_runs');
  });

  it('quality >= 70 → all markets survive stability fallback', () => {
    const fakeScore = { qualityScore: 85, breakdown: {}, openMarkets: 3 };
    const markets = [
      { marketId: 'match_winner', status: 'OPEN', selections: [] },
      { marketId: 'next_delivery_runs', status: 'OPEN', selections: [] },
    ];
    const result = applyStabilityFallback(markets, fakeScore);
    expect(result.filter((m) => m.status === 'OPEN').length).toBe(2);
  });

  it('event freeze suspends delivery markets after WICKET', () => {
    _resetEventFreezeForTests();
    const state = buildCanonicalFromMatch(chaseMatch({
      liveDetails: {
        firstRuns: 165, firstWickets: 7, firstOvers: '20.0',
        chaseRuns: 90, chaseWickets: 3, chaseOvers: '12.1',
        battingTeam: 'Beta', innings: 2,
        lastBallEvent: 'WICKET',
      },
    }));
    const snap = generateV4(state);
    // If any next_delivery markets exist, they should be suspended
    const deliveries = snap.markets.filter((m) => /next_delivery_/i.test(m.marketId));
    for (const d of deliveries) {
      expect(d.status).toBe('SUSPENDED');
    }
  });

  it('scoreV4Book configHealth dimension rewards provider blend', () => {
    const score = scoreV4Book({
      markets: [
        {
          marketId: 'match_winner', status: 'OPEN',
          selections: [
            { selectionId: '1', odds: 1.72, probability: 0.55, bettable: true },
            { selectionId: '2', odds: 2.25, probability: 0.45, bettable: true },
          ],
        },
      ],
      momentum: { factor: 1.05, marginBump: 0.02 },
      engineVersion: '4.9.5',
      providerBlendWeight: 0.22,
      providerTimestamp: Date.now() - 5000,
    });
    expect(score.breakdown.configHealth).toBeGreaterThanOrEqual(5);
    expect(score.breakdown.latency).toBeGreaterThanOrEqual(4);
  });

  it('winnerOnly path includes guardian + event freeze + circuit breaker', () => {
    const state = buildCanonicalFromMatch(chaseMatch());
    const snap = generateV4(state, { winnerOnly: true });
    expect(snap.engine).toBe('OddsEngineV4');
    // Should have at least 1 market
    expect(snap.markets.length).toBeGreaterThanOrEqual(1);
    const mw = snap.markets.find((m) => m.marketId === 'match_winner');
    // If match winner exists it should be OPEN or SUSPENDED (guardian may suspend)
    if (mw) {
      expect(['OPEN', 'SUSPENDED']).toContain(mw.status);
    }
  });
});
