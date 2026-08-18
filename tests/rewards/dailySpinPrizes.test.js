import { describe, it, expect } from 'vitest';
import { DAILY_SPIN_PRIZES, spinDateInKolkata, loyaltyTierFromPoints } from '../../lib/dailySpinPrizes.mjs';

describe('daily spin prizes', () => {
  it('has eight unique sectors covering bonus, freebet, and xp', () => {
    expect(DAILY_SPIN_PRIZES).toHaveLength(8);
    expect(new Set(DAILY_SPIN_PRIZES.map((p) => p.index)).size).toBe(8);
    expect(DAILY_SPIN_PRIZES.some((p) => p.type === 'freebet')).toBe(true);
    expect(DAILY_SPIN_PRIZES.some((p) => p.type === 'bonus')).toBe(true);
    expect(DAILY_SPIN_PRIZES.some((p) => p.type === 'xp')).toBe(true);
  });

  it('returns a YYYY-MM-DD calendar date in Asia/Kolkata', () => {
    expect(spinDateInKolkata(new Date('2026-08-17T20:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('maps loyalty points to tiers', () => {
    expect(loyaltyTierFromPoints(0)).toBe('BRONZE');
    expect(loyaltyTierFromPoints(500)).toBe('SILVER');
    expect(loyaltyTierFromPoints(2000)).toBe('GOLD');
    expect(loyaltyTierFromPoints(10000)).toBe('PLATINUM');
  });
});
