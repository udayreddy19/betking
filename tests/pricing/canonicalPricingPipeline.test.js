import { describe, it, expect } from 'vitest';
import {
  priceMarketPipeline,
  verifyBookIntegrity,
  PRICING_PIPELINE_VERSION,
} from '../../lib/pricing/CanonicalPricingPipeline.mjs';

describe('Priority 1 & 2: Canonical Pricing Pipeline & Overround Mathematics', () => {
  it('separates all 8 layers and persists audit metadata on 2-way market', () => {
    const market = priceMarketPipeline({
      selections: [
        { selectionId: 'sel_ind', name: 'India', rawProbability: 0.65 },
        { selectionId: 'sel_aus', name: 'Australia', rawProbability: 0.35 },
      ],
      overround: 0.12,
      metadata: {
        modelVersion: '4.9.0',
        calibrationVersion: 'v4_cal_2026_09',
        marginPolicyVersion: 'v4_cricket_margin',
        riskPolicyVersion: 'v4_risk_v1',
        stateVersion: 14,
      },
    });

    expect(market.status).toBe('OPEN');
    expect(market.selections).toHaveLength(2);

    const ind = market.selections[0];
    const aus = market.selections[1];

    // Check all 8 layers present on selections
    expect(ind.rawProbability).toBe(0.65);
    expect(ind.calibratedProbability).toBe(0.65);
    expect(ind.fairProbability).toBeCloseTo(0.65, 4);
    expect(ind.fairOdds).toBeCloseTo(1 / 0.65, 3);
    expect(ind.configuredMargin).toBe(0.12);
    expect(ind.riskAdjustment).toBe(0);
    expect(ind.publishedOdds).toBeGreaterThan(1.0);
    expect(ind.publishedImpliedProbability).toBeCloseTo(1 / ind.publishedOdds, 4);

    // Sum of fair probabilities must equal exactly 1.0
    expect(ind.fairProbability + aus.fairProbability).toBeCloseTo(1.0, 6);

    // Book percentage must match configured overround within rounding tolerance
    expect(market.bookPercentage).toBeCloseTo(1.12, 2);

    // Metadata immutable and complete
    expect(market.pricingMetadata).toEqual(
      expect.objectContaining({
        modelVersion: '4.9.0',
        calibrationVersion: 'v4_cal_2026_09',
        pricingVersion: PRICING_PIPELINE_VERSION,
        marginPolicyVersion: 'v4_cricket_margin',
        riskPolicyVersion: 'v4_risk_v1',
        stateVersion: 14,
      }),
    );

    // Explanatory audit interface answers:
    // "What did the model believe?"
    expect(market.modelBelief['sel_ind']).toBeCloseTo(0.65, 4);
    expect(market.modelBelief['sel_aus']).toBeCloseTo(0.35, 4);
    // "What margin was added?"
    expect(market.marginAdded).toBe(0.12);
    // "What risk adjustment was applied?"
    expect(market.riskAdjustmentApplied['sel_ind']).toBe(0);
    // "What final odds were published?"
    expect(market.publishedOdds['sel_ind']).toBe(ind.publishedOdds);

    const integrity = verifyBookIntegrity(market);
    expect(integrity.valid).toBe(true);
    expect(integrity.sumFair).toBeCloseTo(1.0, 4);
  });

  it('correctly handles 3-way markets (e.g. Soccer 1X2, Test Cricket)', () => {
    const market = priceMarketPipeline({
      selections: [
        { selectionId: 'sel_home', name: 'Arsenal', rawProbability: 0.52 },
        { selectionId: 'sel_draw', name: 'Draw', rawProbability: 0.26 },
        { selectionId: 'sel_away', name: 'Chelsea', rawProbability: 0.22 },
      ],
      overround: 0.15,
      metadata: { modelVersion: '4.9.0' },
    });

    expect(market.status).toBe('OPEN');
    const [h, d, a] = market.selections;

    // Fair probability conservation
    expect(h.fairProbability + d.fairProbability + a.fairProbability).toBeCloseTo(1.0, 5);

    // Fair odds = 1 / probability
    expect(h.fairOdds).toBeCloseTo(1 / h.fairProbability, 3);
    expect(d.fairOdds).toBeCloseTo(1 / d.fairProbability, 3);
    expect(a.fairOdds).toBeCloseTo(1 / a.fairProbability, 3);

    // Commercial overround check: sum(1/odds) ≈ 1.15
    const impliedSum = 1 / h.publishedOdds + 1 / d.publishedOdds + 1 / a.publishedOdds;
    expect(impliedSum).toBeCloseTo(1.15, 1);
    expect(verifyBookIntegrity(market).valid).toBe(true);
  });

  it('correctly handles 4-way markets and property-based distributions', () => {
    const rawDistribution = [0.40, 0.30, 0.20, 0.10];
    const market = priceMarketPipeline({
      selections: rawDistribution.map((p, idx) => ({
        selectionId: `group_${idx}`,
        name: `Outcome ${idx + 1}`,
        rawProbability: p,
      })),
      overround: 0.16,
    });

    const sumFair = market.selections.reduce((acc, s) => acc + s.fairProbability, 0);
    expect(sumFair).toBeCloseTo(1.0, 5);

    const sumImplied = market.selections.reduce((acc, s) => acc + s.publishedImpliedProbability, 0);
    expect(sumImplied).toBeCloseTo(1.16, 1);
    expect(verifyBookIntegrity(market).valid).toBe(true);
  });

  it('prices Totals (Over / Under) with distinct risk adjustment without corrupting model belief', () => {
    // Model believes Over is 55%, Under is 45%
    // Risk adjustment applies slight liability dampener to Over (+3% extra margin)
    const market = priceMarketPipeline({
      selections: [
        { selectionId: 'sel_over', name: 'Over 2.5', rawProbability: 0.55 },
        { selectionId: 'sel_under', name: 'Under 2.5', rawProbability: 0.45 },
      ],
      overround: 0.14,
      riskAdjustments: {
        sel_over: 0.03,
        sel_under: 0.0,
      },
    });

    const [over, under] = market.selections;

    // Model belief is untouched
    expect(over.fairProbability).toBeCloseTo(0.55, 4);
    expect(under.fairProbability).toBeCloseTo(0.45, 4);
    expect(over.fairProbability + under.fairProbability).toBeCloseTo(1.0, 5);

    // But risk adjustment was recorded and affected published odds
    expect(over.riskAdjustment).toBe(0.03);
    expect(under.riskAdjustment).toBe(0.0);
    expect(over.publishedOdds).toBeLessThan(1 / (0.55 * 1.14));
  });

  it('prices Correct Score distributions accounting for tail and preserving normalization', () => {
    // Score grid with tail
    const scores = [
      { selectionId: 'cs_1_0', name: '1-0', rawProbability: 0.18 },
      { selectionId: 'cs_2_0', name: '2-0', rawProbability: 0.14 },
      { selectionId: 'cs_2_1', name: '2-1', rawProbability: 0.11 },
      { selectionId: 'cs_0_0', name: '0-0', rawProbability: 0.10 },
      { selectionId: 'cs_1_1', name: '1-1', rawProbability: 0.13 },
      { selectionId: 'cs_0_1', name: '0-1', rawProbability: 0.12 },
      { selectionId: 'cs_1_2', name: '1-2', rawProbability: 0.08 },
      { selectionId: 'cs_any_other', name: 'Any Other Score', rawProbability: 0.14 },
    ];

    const market = priceMarketPipeline({
      selections: scores,
      overround: 0.22,
    });

    const sumFair = market.selections.reduce((acc, s) => acc + s.fairProbability, 0);
    expect(sumFair).toBeCloseTo(1.0, 5);

    const sumImplied = market.selections.reduce((acc, s) => acc + s.publishedImpliedProbability, 0);
    expect(sumImplied).toBeCloseTo(1.22, 1);
    expect(verifyBookIntegrity(market).valid).toBe(true);
  });

  it('rejects mathematically invalid books', () => {
    // Negative probability
    const invalidNegative = priceMarketPipeline({
      selections: [
        { selectionId: '1', name: 'A', rawProbability: -0.2 },
        { selectionId: '2', name: 'B', rawProbability: 1.2 },
      ],
    });
    expect(invalidNegative.status).toBe('SUSPENDED');
    expect(invalidNegative.suspensionReason).toContain('INVALID_PROBABILITY');

    // Empty selections
    const invalidEmpty = priceMarketPipeline({ selections: [] });
    expect(invalidEmpty.status).toBe('SUSPENDED');
    expect(invalidEmpty.suspensionReason).toBe('EMPTY_SELECTIONS');

    // All zero probabilities
    const invalidZero = priceMarketPipeline({
      selections: [
        { selectionId: '1', name: 'A', rawProbability: 0 },
        { selectionId: '2', name: 'B', rawProbability: 0 },
      ],
    });
    expect(invalidZero.status).toBe('SUSPENDED');
    expect(invalidZero.suspensionReason).toBe('ZERO_TOTAL_PROBABILITY');
  });
});
