import { describe, it, expect } from 'vitest';
import {
  DAILY_SPIN_PRIZES,
  DAILY_SPIN_BONUS_AMOUNTS,
  spinDateInKolkata,
  loyaltyTierFromPoints,
} from '../../lib/dailySpinPrizes.mjs';

describe('daily spin prizes', () => {
  it('only awards ₹100 / ₹200 / ₹500 / ₹750 bonus (no freebet, xp, or mega)', () => {
    expect(DAILY_SPIN_PRIZES).toHaveLength(8);
    expect(new Set(DAILY_SPIN_PRIZES.map((p) => p.index)).size).toBe(8);
    expect(DAILY_SPIN_PRIZES.every((p) => p.type === 'bonus')).toBe(true);
    expect(DAILY_SPIN_PRIZES.some((p) => p.type === 'freebet')).toBe(false);
    expect(DAILY_SPIN_PRIZES.some((p) => p.type === 'xp')).toBe(false);
    const values = [...new Set(DAILY_SPIN_PRIZES.map((p) => p.value))].sort((a, b) => a - b);
    expect(values).toEqual([...DAILY_SPIN_BONUS_AMOUNTS]);
    for (const amount of DAILY_SPIN_BONUS_AMOUNTS) {
      expect(DAILY_SPIN_PRIZES.filter((p) => p.value === amount)).toHaveLength(2);
    }
  });

  it('returns a YYYY-MM-DD calendar date in Asia/Kolkata', () => {
    expect(spinDateInKolkata(new Date('2026-08-17T20:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('maps loyalty points to tiers', () => {
    expect(loyaltyTierFromPoints(0)).toBe('BRONZE');
    expect(loyaltyTierFromPoints(1999)).toBe('BRONZE');
    expect(loyaltyTierFromPoints(2000)).toBe('SILVER');
    expect(loyaltyTierFromPoints(9999)).toBe('SILVER');
    expect(loyaltyTierFromPoints(10000)).toBe('GOLD');
    expect(loyaltyTierFromPoints(24999)).toBe('GOLD');
    expect(loyaltyTierFromPoints(25000)).toBe('PLATINUM');
    expect(loyaltyTierFromPoints(49999)).toBe('PLATINUM');
    expect(loyaltyTierFromPoints(50000)).toBe('DIAMOND');
  });
});
