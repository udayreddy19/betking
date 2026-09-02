import { describe, it, expect } from 'vitest';
import {
  planSplitAmounts,
  planPackAmounts,
  resolveDeliveryAmounts,
  normalizeSplitParts,
  normalizeSplitEach,
  describeSplit,
} from '../../lib/rewardSplit.mjs';

describe('reward split', () => {
  it('splits 10000 into 10 equal 1000 stakes', () => {
    expect(planSplitAmounts(10000, 10)).toEqual(Array(10).fill(1000));
  });

  it('keeps a single instrument when split is off', () => {
    expect(planSplitAmounts(500, 1)).toEqual([500]);
  });

  it('puts leftover paise on the last part', () => {
    const parts = planSplitAmounts(100, 3);
    expect(parts).toHaveLength(3);
    expect(Number(parts.reduce((s, n) => s + n, 0).toFixed(2))).toBe(100);
  });

  it('normalizes toggle + parts', () => {
    expect(normalizeSplitParts(10, { enabled: false })).toBe(1);
    expect(normalizeSplitParts(10, { enabled: true })).toBe(10);
    expect(normalizeSplitParts(99, { enabled: true })).toBe(50);
  });

  it('describes even splits for the admin preview', () => {
    expect(describeSplit(10000, 10).label).toBe('10 × ₹1,000');
    expect(describeSplit(10000, 10).each).toBe(1000);
  });

  it('packs 10 × 1000 as identical stakes without dividing a total', () => {
    expect(planPackAmounts({ parts: 10, each: 1000 })).toEqual(Array(10).fill(1000));
  });

  it('requires pack count and each amount', () => {
    expect(() => planPackAmounts({ parts: 1, each: 1000 })).toThrow(/Pack needs/);
    expect(normalizeSplitEach(1000, { enabled: false })).toBe(null);
    expect(normalizeSplitEach(1000, { enabled: true })).toBe(1000);
  });

  it('delivers the match as one stake or as an explicit pack', () => {
    expect(resolveDeliveryAmounts({ matchAmount: 10000, parts: 1 })).toEqual([10000]);
    expect(resolveDeliveryAmounts({ matchAmount: 10000, parts: 10, each: 1000 })).toEqual(Array(10).fill(1000));
  });

  it('fits a pack under a smaller match and keeps leftover', () => {
    expect(resolveDeliveryAmounts({ matchAmount: 8500, parts: 10, each: 1000 })).toEqual([
      1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 500,
    ]);
  });
});
