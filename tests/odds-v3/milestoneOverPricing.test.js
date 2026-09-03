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
    // 50-over book includes mid/late windows (not full 50 = team_total)
    for (const overs of [5, 10, 15, 20, 25, 30, 40, 45]) {
      const m = milestone(markets, overs);
      expect(m?.status).toBe('OPEN');
      expect(m.line).toBeGreaterThan(0);
      const over = overSel(m);
      if (over) expect(over.odds).toBeLessThanOrEqual(MAX_LIVE_TOTAL_OVER_ODDS);
    }
    expect(milestone(markets, 50)).toBeUndefined();
  });

  it('offers long-form milestone windows for Test with 60% early cuts', () => {
    const state = liveState({ format: 'TEST' });
    const markets = generateExtendedOverMarkets(state);
    for (const overs of [5, 10, 15, 20, 25, 30, 40, 50, 60]) {
      const m = milestone(markets, overs);
      expect(m?.status, `expected OPEN 0–${overs}`).toBe('OPEN');
      expect(m.line).toBeGreaterThan(0);
    }
    // Full configured innings not duplicated as a milestone
    expect(milestone(markets, 75)).toBeUndefined();

    // 0–40 cuts after 24 overs (144 balls); 0–60 after 36 overs (216 balls)
    const at24 = generateExtendedOverMarkets(liveState({
      format: 'TEST', runs: 70, wickets: 2, ballsCompleted: 144,
    }));
    expect(milestone(at24, 40)?.status).toBe('SUSPENDED');
    expect(milestone(at24, 50)?.status).toBe('OPEN');

    const at36 = generateExtendedOverMarkets(liveState({
      format: 'TEST', runs: 110, wickets: 3, ballsCompleted: 216,
    }));
    expect(milestone(at36, 60)?.status).toBe('SUSPENDED');
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

  it('drops every 0–N market once ~60% of its window is bowled', () => {
    // 0–5: after 3 overs (18 balls) → 4th over
    const at3 = generateExtendedOverMarkets(liveState({
      format: 'T20', runs: 28, wickets: 0, ballsCompleted: 18,
    }));
    expect(milestone(at3, 5)?.status).toBe('SUSPENDED');
    expect(milestone(at3, 10)?.status).toBe('OPEN');
    expect(milestone(at3, 15)?.status).toBe('OPEN');

    // Still open in 3rd over (2.5 = 17 balls)
    const at2x5 = generateExtendedOverMarkets(liveState({
      format: 'T20', runs: 24, wickets: 0, ballsCompleted: 17,
    }));
    expect(milestone(at2x5, 5)?.status).toBe('OPEN');

    // 0–10: after 6 overs → 7th over
    const at6 = generateExtendedOverMarkets(liveState({
      format: 'T20', runs: 45, wickets: 1, ballsCompleted: 36,
    }));
    expect(milestone(at6, 10)?.status).toBe('SUSPENDED');
    expect(milestone(at6, 15)?.status).toBe('OPEN');

    // 0–15: after 9 overs → 10th over
    const at9 = generateExtendedOverMarkets(liveState({
      format: 'T20', runs: 78, wickets: 2, ballsCompleted: 54,
    }));
    expect(milestone(at9, 10)?.status).toBe('SUSPENDED');
    expect(milestone(at9, 15)?.status).toBe('SUSPENDED');

    // ODI 0–20: after 12 overs → 13th over
    const odi12 = generateExtendedOverMarkets(liveState({
      format: 'ODI', runs: 70, wickets: 1, ballsCompleted: 72,
    }));
    expect(milestone(odi12, 20)?.status).toBe('SUSPENDED');
    expect(milestone(odi12, 15)?.status).toBe('SUSPENDED');

    const odi11 = generateExtendedOverMarkets(liveState({
      format: 'ODI', runs: 65, wickets: 1, ballsCompleted: 71,
    }));
    expect(milestone(odi11, 20)?.status).toBe('OPEN');

    // ODI 0–40: after 24 overs → 25th over
    const odi24 = generateExtendedOverMarkets(liveState({
      format: 'ODI', runs: 120, wickets: 2, ballsCompleted: 144,
    }));
    expect(milestone(odi24, 40)?.status).toBe('SUSPENDED');
    expect(milestone(odi24, 45)?.status).toBe('OPEN');
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
});

