import { describe, it, expect } from 'vitest';
import { calculatePartialCashout } from '../../lib/cashoutPricing.mjs';
import { calculateAccaBoost } from '../../lib/accaBonusEngine.mjs';

describe('Betting Engine — Partial Cashout & Acca Booster', () => {
  describe('Partial Cashout', () => {
    it('calculates 50% partial cashout accurately', () => {
      const mockQuote = {
        available: true,
        stake: 1000,
        acceptedOdds: 3.0,
        cashoutValue: 1500,
      };

      const partial = calculatePartialCashout(mockQuote, 0.5);
      expect(partial.available).toBe(true);
      expect(partial.percentage).toBe(0.5);
      expect(partial.partialCashoutValue).toBe(750);
      expect(partial.remainingStake).toBe(500);
      expect(partial.remainingPotentialPayout).toBe(1500);
    });

    it('rejects partial cashout if full quote is unavailable', () => {
      const partial = calculatePartialCashout({ available: false }, 0.5);
      expect(partial.available).toBe(false);
    });
  });

  describe('Acca Multi-Bet Booster', () => {
    it('calculates +10% boost for 5-leg parlay with qualifying odds', () => {
      const legs = [
        { odds: 1.50 },
        { odds: 1.60 },
        { odds: 1.70 },
        { odds: 1.80 },
        { odds: 1.90 },
      ];
      const result = calculateAccaBoost(legs, 100);

      expect(result.eligible).toBe(true);
      expect(result.qualifyingLegs).toBe(5);
      expect(result.boostPct).toBe(10.0);
      expect(result.boostedPayout).toBeGreaterThan(result.basePayout);
    });

    it('disqualifies legs with odds below minimum 1.20', () => {
      const legs = [
        { odds: 1.10 }, // Below 1.20
        { odds: 1.15 }, // Below 1.20
        { odds: 1.80 },
      ];
      const result = calculateAccaBoost(legs, 100);
      expect(result.eligible).toBe(false);
      expect(result.qualifyingLegs).toBe(1);
    });
  });
});
