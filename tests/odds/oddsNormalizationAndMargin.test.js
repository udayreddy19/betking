import { describe, it, expect } from 'vitest';
import { convertToDecimalOdds, normalizeSelections } from '../../lib/normalizers/oddsNormalizer.mjs';
import { oddsMarginEngine } from '../../lib/oddsMarginEngine.mjs';

describe('Phase 4 Odds Normalization & Margin Calculation Tests', () => {
  it('should normalize Decimal, Fractional, and American odds to Canonical Decimal Odds', () => {
    expect(convertToDecimalOdds(1.85)).toBe(1.85);
    expect(convertToDecimalOdds('17/20')).toBe(1.85);
    expect(convertToDecimalOdds('5/2')).toBe(3.50);
    expect(convertToDecimalOdds('+150')).toBe(2.50);
    expect(convertToDecimalOdds('-110')).toBe(1.91);
  });

  it('CRITICAL: invalid odds (null, NaN, <= 1.00, negative) must be REJECTED', () => {
    expect(() => convertToDecimalOdds(null)).toThrow('Odds value is required');
    expect(() => convertToDecimalOdds(0.95)).toThrow('Decimal odds must be strictly greater than 1.00');
    expect(() => convertToDecimalOdds(-150)).toThrow('Decimal odds must be strictly greater than 1.00');
    expect(() => convertToDecimalOdds('invalid_str')).toThrow();
  });

  it('should calculate implied probability and market margin correctly', () => {
    const selections = [
      { name: 'Home', odds: 2.00 },
      { name: 'Away', odds: 1.90 },
    ];

    const normalized = normalizeSelections(selections);
    expect(normalized[0].impliedProbability).toBe(0.5000);
    expect(normalized[1].impliedProbability).toBe(0.5263);

    const margin = oddsMarginEngine.calculateMarketMargin(normalized);
    expect(margin).toBe(0.0263); // 2.63% overround margin
  });
});
