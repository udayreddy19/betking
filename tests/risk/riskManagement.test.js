import { describe, it, expect, beforeEach } from 'vitest';
import { MatchLiabilityTracker } from '../../lib/risk/liabilityTracker.mjs';
import { SyndicateDetector } from '../../lib/risk/syndicateDetector.mjs';
import { validateBetRisk, setUserRiskProfile } from '../../lib/riskEngine.mjs';

describe('Risk & Liability Management', () => {
  describe('Match Liability Tracker', () => {
    let tracker;
    beforeEach(() => {
      tracker = new MatchLiabilityTracker({ maxMatchLiability: 100000 });
    });

    it('calculates total stakes and potential payout liability correctly', () => {
      tracker.recordBet({ matchId: 'm1', marketId: 'winner', selectionId: 'india', stake: 1000, odds: 2.0 });
      tracker.recordBet({ matchId: 'm1', marketId: 'winner', selectionId: 'pakistan', stake: 500, odds: 2.2 });

      const report = tracker.getLiabilityReport('m1');
      expect(report.totalStakes).toBe(1500);
      expect(report.isOverLimit).toBe(false);
      expect(report.markets.length).toBe(1);
    });

    it('flags when liability exceeds configured risk threshold', () => {
      tracker.recordBet({ matchId: 'm1', marketId: 'winner', selectionId: 'india', stake: 200000, odds: 2.0 });
      const report = tracker.getLiabilityReport('m1');
      expect(report.isOverLimit).toBe(true);
    });
  });

  describe('Syndicate & Arbitrage Detection', () => {
    let detector;
    beforeEach(() => {
      detector = new SyndicateDetector({ minAccountsForSyndicate: 3, minTotalStakeThreshold: 10000 });
    });

    it('detects coordinated syndicate bets across multiple accounts', () => {
      detector.recordAndAnalyze({ userId: 'u1', matchId: 'm1', marketId: 'winner', selectionId: 'india', stake: 4000 });
      detector.recordAndAnalyze({ userId: 'u2', matchId: 'm1', marketId: 'winner', selectionId: 'india', stake: 4000 });
      const third = detector.recordAndAnalyze({ userId: 'u3', matchId: 'm1', marketId: 'winner', selectionId: 'india', stake: 4000 });

      expect(third.isSyndicate).toBe(true);
      expect(third.riskLevel).toBe('CRITICAL');
    });
  });

  describe('Risk Engine Integration', () => {
    it('applies risk tiers and stake limits correctly', () => {
      setUserRiskProfile('sharp_user_1', { tier: 'SHARP' });
      const result = validateBetRisk({
        userId: 'sharp_user_1',
        matchId: 'm1',
        marketId: 'winner',
        selectionId: 'home',
        stake: 10000,
        odds: 1.95,
      });

      expect(result.flags).toContain('SHARP_BETTOR_DETECTED');
      expect(result.isApproved).toBe(false); // Exceeds sharp max stake limit (5000)
    });
  });
});
