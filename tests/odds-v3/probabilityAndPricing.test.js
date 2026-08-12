import { describe, it, expect } from 'vitest';
import { calculateMatchWinnerProbability, calculateExpectedTotal } from '../../lib/odds-v3/pricing/ProbabilityModel.mjs';
import { calculateFairOdds } from '../../lib/odds-v3/pricing/FairOddsCalculator.mjs';
import { applyMargin } from '../../lib/odds-v3/pricing/MarginCalculator.mjs';
import { priceSelection } from '../../lib/odds-v3/pricing/OddsCalculator.mjs';
import { validateSelectionPrice, validateProbabilitySum, validateOverround } from '../../lib/odds-v3/validation/PricingValidator.mjs';

describe('OddsEngineV3 — Probability & Pricing Pipeline', () => {
  it('calculates match winner probabilities summing to 1.0', () => {
    const res = calculateMatchWinnerProbability({
      runsRequired: 45,
      ballsRemaining: 42,
      wicketsRemaining: 7,
      ballsCompleted: 58,
      ballsPerInnings: 100,
      target: 143,
      chasingScore: 98,
      format: 'THE_HUNDRED',
      chasingTeamId: 'TRT',
      fieldingTeamId: 'OVI',
    });

    expect(res.pChase).toBeGreaterThan(0);
    expect(res.pChase).toBeLessThan(1);
    expect(res.pChase + res.pField).toBeCloseTo(1.0, 5);
  });

  it('calculates expected total runs based on run rate and wickets', () => {
    const res = calculateExpectedTotal({
      currentScore: 98,
      ballsRemaining: 42,
      wicketsRemaining: 7,
      ballsCompleted: 58,
      format: 'THE_HUNDRED',
    });

    expect(res.expectedTotal).toBeGreaterThan(98);
    expect(res.expectedRemaining).toBeGreaterThan(0);
  });

  it('converts raw probability to fair odds correctly (1/p)', () => {
    const fair = calculateFairOdds(0.5);
    expect(fair).toBe(2.0);

    const fairQuarter = calculateFairOdds(0.25);
    expect(fairQuarter).toBe(4.0);
  });

  it('applies proportional margin correctly', () => {
    const marginRes = applyMargin(0.5, 0.05); // 5% margin
    expect(marginRes.finalProbability).toBe(0.525);
    expect(marginRes.odds).toBeCloseTo(1 / 0.525, 4);
    expect(marginRes.margin).toBe(0.05);
  });

  it('prices selection exposure step by step transparently', () => {
    const priced = priceSelection({
      selectionId: 'sel_1',
      name: 'Team A',
      probability: 0.6,
      overround: 0.05,
    });

    expect(priced.selectionId).toBe('sel_1');
    expect(priced.probability).toBe(0.6);
    expect(priced.fairOdds).toBeCloseTo(1 / 0.6, 4);
    expect(priced.margin).toBe(0.05);
    expect(priced.finalProbability).toBeCloseTo(0.63, 4);
    expect(priced.odds).toBeCloseTo(1 / 0.63, 4);
  });

  it('validates selection price and overround invariants', () => {
    const sel1 = priceSelection({ selectionId: 's1', name: 'A', probability: 0.6, overround: 0.05 });
    const sel2 = priceSelection({ selectionId: 's2', name: 'B', probability: 0.4, overround: 0.05 });

    const val1 = validateSelectionPrice(sel1);
    expect(val1.valid).toBe(true);

    const probSum = validateProbabilitySum([sel1.probability, sel2.probability]);
    expect(probSum.valid).toBe(true);
    expect(probSum.sum).toBeCloseTo(1.0, 5);

    const overroundVal = validateOverround([sel1.odds, sel2.odds], 0.05);
    expect(overroundVal.valid).toBe(true);
  });
});
