import { describe, it, expect } from 'vitest';
import {
  calculateEarnedPoints,
  resolveVipTier,
  calculateDailyStreak,
} from '../../lib/vipRewardEngine.mjs';

describe('Gamification — VIP Loyalty Progression & Daily Streak Engine', () => {
  describe('Loyalty Point Accrual & Tiers', () => {
    it('accrues 1.0 point per ₹100 wagered', () => {
      expect(calculateEarnedPoints(1000)).toBe(10.0);
      expect(calculateEarnedPoints(250)).toBe(2.5);
    });

    it('resolves correct tier and progress to next tier', () => {
      const gold = resolveVipTier(6000);
      expect(gold.tier).toBe('GOLD');
      expect(gold.cashbackPct).toBe(2.0);
      expect(gold.nextTier).toBe('PLATINUM');
      expect(gold.pointsToNextTier).toBe(19000);
    });

    it('resolves top tier DIAMOND with 100% progress', () => {
      const diamond = resolveVipTier(120000);
      expect(diamond.tier).toBe('DIAMOND');
      expect(diamond.cashbackPct).toBe(5.0);
      expect(diamond.nextTier).toBeNull();
      expect(diamond.progressPct).toBe(100.0);
    });
  });

  describe('Daily Streak Tracking', () => {
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
