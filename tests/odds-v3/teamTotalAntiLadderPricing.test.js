/**
 * Regression: live team_total must not sell soft ~2.2 Overs on climbing ladders.
 */
import { describe, it, expect } from 'vitest';
import {
  generateLine,
  calculateLineProbability,
  resolveTotalLineSpread,
  minLiveTotalLineLead,
} from '../../lib/odds-v3/lines/TotalLineGenerator.mjs';
import { calculateExpectedTotal } from '../../lib/odds-v3/pricing/ProbabilityModel.mjs';
import {
  generateTeamTotalMarket,
  applyLiveTotalOverOddsCap,
} from '../../lib/odds-v3/markets/TeamTotalMarket.mjs';
import { MAX_LIVE_TOTAL_OVER_ODDS } from '../../lib/odds-v3/pricing/MarginCalculator.mjs';
import { priceSelection } from '../../lib/odds-v3/pricing/OddsCalculator.mjs';

function liveT20State({
  runs,
  wickets = 3,
  ballsCompleted,
  ballsRemaining,
  innings = 1,
  teamId = 't1',
}) {
  return {
    status: 'LIVE',
    format: 'T20',
    currentInnings: innings,
    ballsCompleted,
    ballsRemaining,
    battingTeamId: teamId,
    bowlingTeamId: 't2',
    team1: { id: 't1', name: 'Team A', runs: innings === 1 ? runs : 180, wickets: innings === 1 ? wickets : 6 },
    team2: { id: 't2', name: 'Team B', runs: innings === 2 ? runs : 0, wickets: innings === 2 ? wickets : 0 },
    target: innings === 2 ? 181 : null,
  };
}

describe('Live team_total anti-ladder pricing', () => {
  it('shrinks O/U spread late in the innings', () => {
    expect(resolveTotalLineSpread(60, 120)).toBe(8);
    expect(resolveTotalLineSpread(20, 120)).toBeLessThan(6);
    expect(resolveTotalLineSpread(6, 120)).toBeLessThanOrEqual(2);
    expect(resolveTotalLineSpread(2, 120)).toBeLessThanOrEqual(1.25);
  });

  it('requires the live line to lead current score while balls remain', () => {
    const lead = minLiveTotalLineLead(24, 1.35);
    expect(lead).toBeGreaterThanOrEqual(6.5);
    expect(lead % 1).toBe(0.5);
    expect(minLiveTotalLineLead(0)).toBe(0.5);
  });

  it('weights hot live RR so expected total rises above a lagging line', () => {
    const hot = calculateExpectedTotal({
      currentScore: 160,
      ballsRemaining: 18,
      wicketsRemaining: 7,
      ballsCompleted: 102,
      format: 'T20',
    });
    const cool = calculateExpectedTotal({
      currentScore: 120,
      ballsRemaining: 18,
      wicketsRemaining: 7,
      ballsCompleted: 102,
      format: 'T20',
    });
    expect(hot.expectedTotal).toBeGreaterThan(cool.expectedTotal + 30);
    // Hot chase projection should sit well above current+0.5 coin-flip zone
    expect(hot.expectedTotal).toBeGreaterThan(170);
  });

  it('caps live Over odds at MAX_LIVE_TOTAL_OVER_ODDS', () => {
    const over = priceSelection({
      selectionId: 'o',
      name: 'Over',
      probability: 0.42,
      overround: 0.10,
    });
    const under = priceSelection({
      selectionId: 'u',
      name: 'Under',
      probability: 0.58,
      overround: 0.10,
    });
    expect(over.odds).toBeGreaterThan(MAX_LIVE_TOTAL_OVER_ODDS);
    const capped = applyLiveTotalOverOddsCap(over, under, 0.10);
    expect(capped.overSel.odds).toBeLessThanOrEqual(MAX_LIVE_TOTAL_OVER_ODDS);
    expect(capped.underSel.odds).toBeGreaterThan(1.01);
  });

  it('does not offer soft Over on a mid/late innings ladder step', () => {
    // Mirrors cb_154551-style steps: score climbing, Over previously sold ~2.2
    const steps = [
      { runs: 132, ballsCompleted: 96, ballsRemaining: 24 },
      { runs: 144, ballsCompleted: 102, ballsRemaining: 18 },
      { runs: 162, ballsCompleted: 108, ballsRemaining: 12 },
      { runs: 176, ballsCompleted: 114, ballsRemaining: 6 },
    ];

    for (const step of steps) {
      const market = generateTeamTotalMarket(liveT20State(step));
      expect(market.status).toBe('OPEN');
      const over = market.selections.find((s) => /over/i.test(s.name));
      expect(over).toBeTruthy();
      expect(over.odds).toBeLessThanOrEqual(MAX_LIVE_TOTAL_OVER_ODDS);
      // Line must sit meaningfully above current score while balls remain
      expect(market.line).toBeGreaterThanOrEqual(step.runs + minLiveTotalLineLead(step.ballsRemaining, 1.35));
    }
  });

  it('sharpens Over price when expected finish is clearly above the line', () => {
    const expected = 178;
    const line = generateLine(expected); // 178.5
    const lateSpread = resolveTotalLineSpread(6, 120);
    const earlySpread = resolveTotalLineSpread(60, 120);
    const late = calculateLineProbability(expected + 4, line, lateSpread);
    const early = calculateLineProbability(expected + 4, line, earlySpread);
    expect(late.pOver).toBeGreaterThan(early.pOver);
    const over = priceSelection({
      selectionId: 'o',
      name: 'Over',
      probability: late.pOver,
      overround: 0.10,
    });
    expect(over.odds).toBeLessThan(1.7);
  });
});
