import { describe, it, expect } from 'vitest';
import {
  estimateTotalAtOvers,
  generateExtendedOverMarkets,
} from '../../lib/odds-v3/markets/overTotal.mjs';
import { MAX_LIVE_TOTAL_OVER_ODDS } from '../../lib/odds-v3/pricing/MarginCalculator.mjs';
import { getFormatRules } from '../../lib/odds-v3/format/CricketFormatRules.mjs';

function liveState({
  format = 'T20',
  runs = 0,
  wickets = 0,
  ballsCompleted = 0,
  innings = 1,
  target = null,
} = {}) {
  const rules = getFormatRules(format) || getFormatRules('T20');
  const ballsPerInnings = rules.ballsPerInnings;
  return {
    status: 'LIVE',
    format,
    currentInnings: innings,
    ballsCompleted,
    ballsRemaining: ballsPerInnings - ballsCompleted,
    battingTeamId: 't1',
    bowlingTeamId: 't2',
    team1: { id: 't1', name: 'Team A', runs: innings === 1 ? runs : 180, wickets: innings === 1 ? wickets : 6 },
    team2: { id: 't2', name: 'Team B', runs: innings === 2 ? runs : 0, wickets: innings === 2 ? wickets : 0 },
    target: innings === 2 ? target : null,
  };
}

function milestone(markets, overs, innings = 1) {
  return markets.find((m) => m.marketId === `i${innings}_overs_0_${overs}_total`);
}

function overSel(market) {
  return (market?.selections || []).find((s) => /^over/i.test(s.name || s.selectionId || ''));
}

describe('Milestone overs 0–N pricing', () => {
  it('posts T20 0/0 near format averages with small juice (not 40.5 leak, not 59.5 hammer)', () => {
    const state = liveState({ format: 'T20' });
    // Above old linear leak, below aggressive +8 pad book
    expect(estimateTotalAtOvers(state, 5)).toBeGreaterThan(45);
    expect(estimateTotalAtOvers(state, 5)).toBeLessThan(53);
    expect(estimateTotalAtOvers(state, 10)).toBeGreaterThan(82);
    expect(estimateTotalAtOvers(state, 10)).toBeLessThan(94);
    expect(estimateTotalAtOvers(state, 15)).toBeGreaterThan(118);
    expect(estimateTotalAtOvers(state, 15)).toBeLessThan(132);

    const markets = generateExtendedOverMarkets(state);
    expect(milestone(markets, 5)?.line).toBeGreaterThanOrEqual(46.5);
    expect(milestone(markets, 5)?.line).toBeLessThanOrEqual(52.5);
    expect(milestone(markets, 10)?.line).toBeGreaterThanOrEqual(84.5);
    expect(milestone(markets, 10)?.line).toBeLessThanOrEqual(92.5);
    expect(milestone(markets, 15)?.line).toBeGreaterThanOrEqual(120.5);
    expect(milestone(markets, 15)?.line).toBeLessThanOrEqual(130.5);
  });

  it('uses format powerplay split for T10 (0–5 only)', () => {
    const state = liveState({ format: 'T10' });
    const markets = generateExtendedOverMarkets(state);
    expect(milestone(markets, 10)).toBeUndefined();
    expect(estimateTotalAtOvers(state, 5)).toBeGreaterThan(52);
    expect(estimateTotalAtOvers(state, 5)).toBeLessThan(68);
    const m = milestone(markets, 5);
    expect(m?.status).toBe('OPEN');
    expect(m.line).toBeGreaterThanOrEqual(52.5);
    expect(m.line).toBeLessThanOrEqual(66.5);
    expect(overSel(m)?.odds).toBeLessThanOrEqual(MAX_LIVE_TOTAL_OVER_ODDS);
  });

  it('uses format powerplay split for ODI 0–5 / 0–10 / 0–15', () => {
    const state = liveState({ format: 'ODI' });
    expect(estimateTotalAtOvers(state, 5)).toBeGreaterThan(30);
    expect(estimateTotalAtOvers(state, 5)).toBeLessThan(42);
    expect(estimateTotalAtOvers(state, 10)).toBeGreaterThan(60);
    expect(estimateTotalAtOvers(state, 10)).toBeLessThan(76);
    expect(estimateTotalAtOvers(state, 15)).toBeGreaterThan(85);
    expect(estimateTotalAtOvers(state, 15)).toBeLessThan(105);

    const markets = generateExtendedOverMarkets(state);
    expect(milestone(markets, 5)?.line).toBeGreaterThanOrEqual(30.5);
    expect(milestone(markets, 10)?.line).toBeGreaterThanOrEqual(60.5);
    expect(milestone(markets, 15)?.line).toBeGreaterThanOrEqual(85.5);
    for (const overs of [5, 10, 15, 20]) {
      const over = overSel(milestone(markets, overs));
      if (over) expect(over.odds).toBeLessThanOrEqual(MAX_LIVE_TOTAL_OVER_ODDS);
    }
  });

  it('uses format powerplay split for The Hundred', () => {
    const state = liveState({ format: 'THE_HUNDRED' });
    expect(estimateTotalAtOvers(state, 5)).toBeGreaterThan(36);
    expect(estimateTotalAtOvers(state, 5)).toBeLessThan(50);
    expect(estimateTotalAtOvers(state, 10)).toBeGreaterThan(68);
    expect(estimateTotalAtOvers(state, 10)).toBeLessThan(86);

    const markets = generateExtendedOverMarkets(state);
    expect(milestone(markets, 5)?.line).toBeGreaterThanOrEqual(36.5);
    expect(milestone(markets, 5)?.line).toBeLessThanOrEqual(48.5);
    expect(milestone(markets, 10)?.line).toBeGreaterThanOrEqual(68.5);
  });

  it('caps soft live milestone Over odds like team totals', () => {
    const markets = generateExtendedOverMarkets(liveState({ format: 'T20' }));
    for (const overs of [5, 10, 15]) {
      const over = overSel(milestone(markets, overs));
      expect(over?.odds).toBeDefined();
      if (over.odds <= 2.25) {
        expect(over.odds).toBeLessThanOrEqual(MAX_LIVE_TOTAL_OVER_ODDS);
      }
    }
  });

  it('does not sell a 1.8-style Over with one over left in the window', () => {
    const markets = generateExtendedOverMarkets(liveState({
      format: 'T20',
      runs: 80,
      wickets: 2,
      ballsCompleted: 54,
    }));
    const m = milestone(markets, 10);
    expect(m?.status).toBe('OPEN');
    expect(m.line).toBeGreaterThanOrEqual(83.5);
    const over = overSel(m);
    expect(over?.odds).toBeDefined();
    if (over.odds <= 2.25) {
      expect(over.odds).toBeLessThanOrEqual(MAX_LIVE_TOTAL_OVER_ODDS);
    }
  });
});
