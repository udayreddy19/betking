import { describe, it, expect } from 'vitest';
import {
  pointsFromSpendAtTier,
  loyaltyTierFromPoints,
  resolveVipTierProgress,
  calculateDailyStreak,
  VIP_TIER_POINTS,
  LOYALTY_POINTS_PER_100_STANDARD,
} from '../../lib/vipBenefits.mjs';

describe('Gamification — VIP loyalty (vipBenefits) & daily streak', () => {
  describe('Loyalty point accrual & tiers', () => {
    it('accrues standard points per ₹100 wagered at BRONZE', () => {
      expect(pointsFromSpendAtTier(1000, 'BRONZE')).toBe(10 * LOYALTY_POINTS_PER_100_STANDARD);
      expect(pointsFromSpendAtTier(250, 'BRONZE')).toBe(Math.floor(2.5 * LOYALTY_POINTS_PER_100_STANDARD));
    });

    it('resolves correct tier and progress to next tier', () => {
      const gold = resolveVipTierProgress(VIP_TIER_POINTS.GOLD + 1000);
      expect(gold.tier).toBe('GOLD');
      expect(loyaltyTierFromPoints(VIP_TIER_POINTS.GOLD)).toBe('GOLD');
      expect(gold.nextTier).toBe('PLATINUM');
      expect(gold.pointsToNextTier).toBe(VIP_TIER_POINTS.PLATINUM - (VIP_TIER_POINTS.GOLD + 1000));
      expect(gold.cashbackPct).toBe(5);
    });

    it('resolves top tier DIAMOND with 100% progress', () => {
      const diamond = resolveVipTierProgress(VIP_TIER_POINTS.DIAMOND + 1000);
      expect(diamond.tier).toBe('DIAMOND');
      expect(diamond.cashbackPct).toBe(10);
      expect(diamond.nextTier).toBeNull();
      expect(diamond.progressPct).toBe(100);
    });
  });

  describe('Daily streak tracking', () => {
    it('increments streak on consecutive day activity', () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const res = calculateDailyStreak(4, yesterday);

      expect(res.streak).toBe(5);
      expect(res.milestoneBonusAwarded).toBe(false);
    });

    it('awards milestone bonus on 7th day streak', () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const res = calculateDailyStreak(6, yesterday);

      expect(res.streak).toBe(7);
      expect(res.milestoneBonusAwarded).toBe(true);
      expect(res.bonusAmount).toBe(100);
    });

    it('resets streak to 1 if user missed a day', () => {
      const threeDaysAgo = new Date(Date.now() - (3 * 86400000)).toISOString().slice(0, 10);
      const res = calculateDailyStreak(10, threeDaysAgo);

      expect(res.streak).toBe(1);
    });
  });
});
