import { describe, it, expect } from 'vitest';
import { blendModelAndProvider } from '../../lib/odds-v3/pricing/modelBlendEngine.mjs';
import { calculateSgpJointOdds } from '../../lib/odds-v3/pricing/correlationEngine.mjs';
import { calculateDynamicOverround } from '../../lib/odds-v3/pricing/dynamicMarginEngine.mjs';

describe('OddsEngineV3 — P1: Blending, Correlation & Dynamic Margin', () => {
  it('blends model and provider probabilities correctly', () => {
    const blend = blendModelAndProvider({
      outcomes: [
        { selectionId: 's1', name: 'Team A', modelProb: 0.60, providerProb: 0.50 },
        { selectionId: 's2', name: 'Team B', modelProb: 0.40, providerProb: 0.50 },
      ],
      config: { defaultModelWeight: 0.60, defaultProviderWeight: 0.40 },
    });

    expect(blend.valid).toBe(true);
    // 0.60 * 0.60 + 0.40 * 0.50 = 0.36 + 0.20 = 0.56
    expect(blend.outcomes[0].blendedProb).toBe(0.56);
    expect(blend.outcomes[1].blendedProb).toBe(0.44);
  });

  it('Correlation Engine: adjusts SGP accumulator odds for positively correlated legs', () => {
    const sgp = calculateSgpJointOdds([
      { marketType: 'match_winner', probability: 0.80, isSameTeam: true },
      { marketType: 'team_total', probability: 0.70, isSameTeam: true },
    ]);

    expect(sgp.valid).toBe(true);
    expect(sgp.correlationApplied).toBe(true);
    // Joint probability should be higher than independent naive product (0.80 * 0.70 = 0.56)
    expect(sgp.jointProbability).toBeGreaterThan(sgp.independentProbability);
    // SGP odds should be lower than naive accumulator odds (protecting the house against correlated edge)
    const naiveOdds = 1 / (0.80 * 0.70);
    expect(sgp.sgpOdds).toBeLessThan(naiveOdds);
  });

  it('Correlation Engine: rejects mutually exclusive contradictory legs', () => {
    const contradictory = calculateSgpJointOdds([
      { marketType: 'match_winner', probability: 0.60, isSameTeam: true },
      { marketType: 'match_winner', probability: 0.40, isSameTeam: false },
    ]);

    expect(contradictory.valid).toBe(false);
    expect(contradictory.telemetry.reason).toBe('mutually_exclusive_legs');
  });

  it('Dynamic Margin: expands overround under high volatility', () => {
    const margin = calculateDynamicOverround({
      baseOverround: 0.05,
      isLive: true,
      volatilityScore: 0.90, // High volatility
      config: { enabled: true },
    });

    expect(margin).toBeGreaterThan(0.05);
  });
});
