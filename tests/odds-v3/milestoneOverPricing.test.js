import { describe, it, expect } from 'vitest';
import {
  estimateTotalAtOvers,
  generateExtendedOverMarkets,
} from '../../lib/odds-v3/markets/overTotal.mjs';
import { MAX_LIVE_TOTAL_OVER_ODDS } from '../../lib/odds-v3/pricing/MarginCalculator.mjs';

function t20Live({
  runs = 0,
  wickets = 0,
  ballsCompleted = 0,
  innings = 1,
  target = null,
} = {}) {
  return {
    status: 'LIVE',
    format: 'T20',
    currentInnings: innings,
    ballsCompleted,
    ballsRemaining: 120 - ballsCompleted,
    battingTeamId: 't1',
    bowlingTeamId: 't2',
    team1: { id: 't1', name: 'Team A', runs: innings === 1 ? runs : 180, wickets: innings === 1 ? wickets : 6 },
    team2: { id: 't2', name: 'Team B', runs: innings === 2 ? runs : 0, wickets: innings === 2 ? wickets : 0 },
    target: innings === 2 ? target : null,
  };
}

function milestone(markets, overs) {
  return markets.find((m) => m.marketId === `i1_overs_0_${overs}_total`);
}

function overSel(market) {
  return (market?.selections || []).find((s) => /^over/i.test(s.name || s.selectionId || ''));
}

describe('Milestone overs 0–N pricing', () => {
  it('posts T20 0/0 lines well above innings-fraction par (40.5 / 81.5 / 121.5)', () => {
    const state = t20Live();
    expect(estimateTotalAtOvers(state, 5)).toBeGreaterThan(48);
    expect(estimateTotalAtOvers(state, 10)).toBeGreaterThan(88);
    expect(estimateTotalAtOvers(state, 15)).toBeGreaterThan(128);

    const markets = generateExtendedOverMarkets(state);
    expect(milestone(markets, 5)?.line).toBeGreaterThanOrEqual(49.5);
    expect(milestone(markets, 10)?.line).toBeGreaterThanOrEqual(88.5);
    expect(milestone(markets, 15)?.line).toBeGreaterThanOrEqual(128.5);
  });

  it('caps live milestone Over odds like team totals', () => {
    const markets = generateExtendedOverMarkets(t20Live());
    for (const overs of [5, 10, 15]) {
      const over = overSel(milestone(markets, overs));
      expect(over?.odds).toBeLessThanOrEqual(MAX_LIVE_TOTAL_OVER_ODDS);
    }
  });

  it('does not sell a 1.8-style Over with one over left in the window', () => {
    // 80/2 after 9.0 — old linear book still offered ~83.5 Over at ~1.78
    const markets = generateExtendedOverMarkets(t20Live({
      runs: 80,
      wickets: 2,
      ballsCompleted: 54,
    }));
    const m = milestone(markets, 10);
    expect(m?.status).toBe('OPEN');
    expect(m.line).toBeGreaterThanOrEqual(85.5);
    const over = overSel(m);
    expect(over?.odds).toBeDefined();
    if (over.odds <= 2.25) {
      expect(over.odds).toBeLessThanOrEqual(MAX_LIVE_TOTAL_OVER_ODDS);
    }
  });
});
