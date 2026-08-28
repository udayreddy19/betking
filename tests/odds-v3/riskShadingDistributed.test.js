import { describe, it, expect } from 'vitest';
import { calculateRiskShadedPrice, applyRiskAdjustment } from '../../lib/odds-v3/pricing/RiskCalculator.mjs';
import { getSelectionLiability, getMarketLiabilityAggregate, recordSelectionLiability } from '../../lib/marketLiabilityStore.mjs';

describe('OddsEngineV3 — P0: Liability Risk Shading & Distributed State', () => {
  it('preserves unshaded odds when risk shading is disabled or liability is zero', () => {
    const unshaded = calculateRiskShadedPrice({
      probability: 0.50,
      netLiability: 0,
      config: { enabled: false },
    });

    expect(unshaded.odds).toBe(2.0);
    expect(unshaded.riskShift).toBe(0);
    expect(unshaded.liabilityBucket).toBe('LOW_POSITIVE');
  });

  it('correctly shortens odds when net liability is high positive (heavy exposure)', () => {
    const shaded = calculateRiskShadedPrice({
      probability: 0.50,
      netLiability: 80000,
      capacity: 100000,
      config: { enabled: true, sensitivityGamma: 0.06 },
    });

    // Probability shifts upward (from 0.50 to ~0.548) -> odds drop from 2.0 to ~1.82
    expect(shaded.probability).toBeGreaterThan(0.50);
    expect(shaded.odds).toBeLessThan(2.0);
    expect(shaded.liabilityBucket).toBe('CRITICAL_HIGH');
  });

  it('correctly sweetens odds when net liability is negative (under-backed outcome)', () => {
    const shaded = calculateRiskShadedPrice({
      probability: 0.50,
      netLiability: -50000,
      capacity: 100000,
      config: { enabled: true, sensitivityGamma: 0.06 },
    });

    // Probability shifts downward -> odds increase
    expect(shaded.probability).toBeLessThan(0.50);
    expect(shaded.odds).toBeGreaterThan(2.0);
    expect(shaded.liabilityBucket).toBe('UNDER_BACKED');
  });

  it('enforces hard boundary caps [1.01, 1000.0]', () => {
    const extremeHigh = calculateRiskShadedPrice({
      probability: 0.95,
      netLiability: 500000,
      capacity: 10000,
      config: { enabled: true },
    });
    expect(extremeHigh.odds).toBeGreaterThanOrEqual(1.01);

    const extremeLow = calculateRiskShadedPrice({
      probability: 0.001,
      netLiability: -500000,
      capacity: 10000,
      config: { enabled: true },
    });
    expect(extremeLow.odds).toBeLessThanOrEqual(1000.0);
  });

  it('records liability in marketLiabilityStore and retrieves aggregate', async () => {
    const marketId = `test_mkt_${Date.now()}`;
    await recordSelectionLiability({
      marketId,
      selectionId: 'sel_team_a',
      stake: 500,
      potentialPayout: 1000,
    });

    const net = getSelectionLiability(marketId, 'sel_team_a');
    expect(net).toBe(500); // 1000 payout - 500 stake

    const agg = getMarketLiabilityAggregate(marketId);
    expect(agg.bySelection['sel_team_a']).toBe(500);
  });
});
