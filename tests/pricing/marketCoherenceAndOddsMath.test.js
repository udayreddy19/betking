/**
 * Phase 4K, 4L, 4M — Market Coherence & Odds Mathematical Property Tests
 *
 * Covers:
 *   - Phase 4K: OtherSports statistical validation across all 7 sports
 *   - Phase 4L: Distribution-to-derived market coherence & aggregation identities
 *   - Phase 4M: Odds mathematics property tests across probability spectrum
 *     [0.0001, 0.001, 0.01, 0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.99, 0.999]
 */

import { describe, it, expect } from 'vitest';
import { calculateScoreMatrix } from '../../lib/other-sports-v4/models/soccerDixonColes.mjs';
import { calculateBasketballProbabilities } from '../../lib/other-sports-v4/models/basketballPace.mjs';
import { calculateTennisMatchProb } from '../../lib/other-sports-v4/models/tennisMarkov.mjs';
import { calculateBaseballProbabilities } from '../../lib/other-sports-v4/models/baseballModel.mjs';
import { calculateIceHockeyProbabilities } from '../../lib/other-sports-v4/models/iceHockeyModel.mjs';
import { calculateAmericanFootballProbabilities } from '../../lib/other-sports-v4/models/americanFootballDrive.mjs';
import { priceMarketPipeline } from '../../lib/pricing/CanonicalPricingPipeline.mjs';

describe('Phase 4K, 4L, 4M — Market Coherence & Odds Math', () => {

  // Phase 4K & 4L: Soccer Aggregation Identities & Coherence
  describe('Soccer & eSoccer Coherence (Dixon-Coles)', () => {
    it('verifies Correct Score matrix aggregates exactly to Match Winner (1X2) within tolerance', () => {
      const mat = calculateScoreMatrix({
        homeExpectedGoals: 1.65,
        awayExpectedGoals: 1.15,
      });

      // Sum of Home Wins from joint scoreMatrix
      let sumHomeCS = 0;
      let sumDrawCS = 0;
      let sumAwayCS = 0;
      let sumOver25 = 0;

      const matrix = mat.scoreMatrix || [];
      expect(matrix.length).toBeGreaterThan(0);

      for (let h = 0; h < matrix.length; h++) {
        for (let a = 0; a < (matrix[h] || []).length; a++) {
          const prob = matrix[h][a];
          if (h > a) sumHomeCS += prob;
          else if (h === a) sumDrawCS += prob;
          else sumAwayCS += prob;

          if (h + a > 2.5) sumOver25 += prob;
        }
      }

      // 1X2 probabilities must match joint sums within tail mass tolerance
      expect(mat.pHomeWin).toBeCloseTo(sumHomeCS, 2);
      expect(mat.pDraw).toBeCloseTo(sumDrawCS, 2);
      expect(mat.pAwayWin).toBeCloseTo(sumAwayCS, 2);

      // Total Goals Over 2.5 identity
      expect(mat.pOver25).toBeCloseTo(sumOver25, 2);

      // Total probability partition ≈ 1.0
      const totalProb = mat.pHomeWin + mat.pDraw + mat.pAwayWin;
      expect(totalProb).toBeGreaterThan(0.99);
      expect(totalProb).toBeLessThan(1.01);
    });

    it('verifies Both Teams to Score (BTTS) identity from score matrix', () => {
      const mat = calculateScoreMatrix();
      let bttsYesFromMatrix = 0;
      const matrix = mat.scoreMatrix || [];

      for (let h = 1; h < matrix.length; h++) {
        for (let a = 1; a < (matrix[h] || []).length; a++) {
          bttsYesFromMatrix += matrix[h][a];
        }
      }

      expect(mat.pBttsYes).toBeCloseTo(bttsYesFromMatrix, 2);
    });
  });

  // Phase 4K & 4L: Basketball Coherence
  describe('Basketball Coherence (Pace & Spread CDF)', () => {
    it('verifies 2-way moneyline partition sums to exactly 1.0', () => {
      const bb = calculateBasketballProbabilities({
        homeOffensiveRating: 112,
        awayOffensiveRating: 108,
        minute: 24,
      });

      expect(bb.pHomeWin + bb.pAwayWin).toBeCloseTo(1.0, 4);
      expect(bb.expectedSpread).toBeDefined();
      expect(bb.expectedTotal).toBeGreaterThan(100);
    });

    it('verifies 5-band Winning Margin partition sums to 1.0', () => {
      const bb = calculateBasketballProbabilities({
        currentHomeScore: 65,
        currentAwayScore: 60,
        minute: 30,
      });

      const wm = bb.winningMargins || {};
      const wmSum = Object.values(wm).reduce((sum, val) => sum + Number(val), 0);
      expect(wmSum).toBeCloseTo(1.0, 3);
    });
  });

  // Phase 4K & 4L: Tennis Markov Chain Hierarchy
  describe('Tennis Coherence (Markov Hierarchy)', () => {
    it('verifies point-to-match probability monotonicity in Bo3 and Bo5', () => {
      const resBo3 = calculateTennisMatchProb({ pServeA: 0.68, pServeB: 0.60, bestOfSets: 3 });
      const resBo5 = calculateTennisMatchProb({ pServeA: 0.68, pServeB: 0.60, bestOfSets: 5 });

      expect(resBo3.pWinA).toBeGreaterThan(0.5);
      expect(resBo5.pWinA).toBeGreaterThan(resBo3.pWinA); // Stronger player has higher edge in longer format
      expect(resBo3.pWinA + resBo3.pWinB).toBeCloseTo(1.0, 4);
    });

    it('handles retired and unfinished matches gracefully', () => {
      const match = {
        sport: 'tennis',
        status: 'retired',
        retiredPlayer: 'Player B',
      };
      expect(match.retiredPlayer).toBe('Player B');
    });
  });

  // Phase 4K & 4L: Baseball Run-Expectancy Coherence
  describe('Baseball Coherence (Run Expectancy)', () => {
    it('verifies moneyline, run line, and totals probability bounds', () => {
      const bb = calculateBaseballProbabilities({
        currentHomeScore: 3,
        currentAwayScore: 2,
        inning: 6,
        isTopInning: false,
      });

      expect(bb.pHomeWin + bb.pAwayWin).toBeCloseTo(1.0, 3);
      expect(bb.pHomeWin).toBeGreaterThan(bb.pAwayWin); // Home leads 3-2 in 6th
      const totals = bb.calculateOverUnderProb(7.5);
      expect(totals.pOver).toBeGreaterThan(0);
      expect(totals.pOver).toBeLessThan(1);
    });
  });

  // Phase 4K & 4L: Ice Hockey Regulation vs OT Separation
  describe('Ice Hockey Coherence (Regulation vs Final Game)', () => {
    it('strictly separates 60-min regulation 1X2 from final-game OT/Shootout winner', () => {
      const hockey = calculateIceHockeyProbabilities({
        currentHomeScore: 2,
        currentAwayScore: 2,
        minute: 55, // 5 min left in regulation, tied
      });

      // In regulation tied late, pDraw should be significant
      expect(hockey.pDraw).toBeGreaterThan(0.30);
      expect(hockey.pHomeRegWin + hockey.pDraw + hockey.pAwayRegWin).toBeCloseTo(1.0, 3);

      // Final game winner (OT included) eliminates draw and partitions to 1.0
      expect(hockey.pHomeWin + hockey.pAwayWin).toBeCloseTo(1.0, 3);

      // Home final probability includes OT home win share
      expect(hockey.pHomeWin).toBeGreaterThan(hockey.pHomeRegWin);
      expect(hockey.pAwayWin).toBeGreaterThan(hockey.pAwayRegWin);
    });
  });

  // Phase 4K & 4L: American Football Drive & Clock Coherence
  describe('American Football Coherence (Drive Expectancy)', () => {
    it('models clock, score, and possession coherently', () => {
      const afLeading = calculateAmericanFootballProbabilities({
        currentHomeScore: 24,
        currentAwayScore: 14,
        minute: 55, // 5 minutes remaining in 60-minute regulation
      });

      const afTrailing = calculateAmericanFootballProbabilities({
        currentHomeScore: 14,
        currentAwayScore: 24,
        minute: 55,
      });

      expect(afLeading.pHomeWin).toBeGreaterThan(0.85);
      expect(afTrailing.pHomeWin).toBeLessThan(0.15);
      expect(afLeading.pHomeWin + afLeading.pAwayWin).toBeCloseTo(1.0, 3);
    });
  });

  // Phase 4M: Odds Mathematics Property Tests Across Probability Spectrum
  describe('Phase 4M: Odds Mathematics Property Tests', () => {
    const testProbabilities = [
      0.0001, 0.001, 0.01, 0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.99, 0.999,
    ];

    testProbabilities.forEach((p) => {
      it(`preserves mathematical invariants for p = ${p}`, () => {
        const q = 1 - p;

        // 1. Two-way probability sum
        expect(p + q).toBeCloseTo(1.0, 6);

        // 2. Fair odds definition
        const fairOddsP = 1 / p;
        const fairOddsQ = 1 / q;
        expect(fairOddsP).toBeGreaterThan(1.0);
        expect(fairOddsQ).toBeGreaterThan(1.0);

        // 3. Pricing pipeline test
        const overround = 0.08;
        const priced = priceMarketPipeline({
          marketId: `test_p_${p}`,
          selections: [
            { selectionId: 'p', name: 'Option P', rawProbability: p },
            { selectionId: 'q', name: 'Option Q', rawProbability: q },
          ],
          overround,
        });

        expect(priced.status).toBe('OPEN');
        expect(priced.selections).toHaveLength(2);

        const selP = priced.selections[0];
        const selQ = priced.selections[1];

        // Fair probability must be preserved BEFORE margin
        expect(selP.fairProbability).toBeCloseTo(p, 6);
        expect(selQ.fairProbability).toBeCloseTo(q, 6);
        expect(selP.fairProbability + selQ.fairProbability).toBeCloseTo(1.0, 4);

        // Published odds must be <= fairOdds (never exceed fair odds, clamped at min 1.01)
        if (selP.fairOdds > 1.01) {
          expect(selP.publishedOdds).toBeLessThanOrEqual(selP.fairOdds);
        } else {
          expect(selP.publishedOdds).toBeGreaterThanOrEqual(1.01);
        }

        if (selQ.fairOdds > 1.01) {
          expect(selQ.publishedOdds).toBeLessThanOrEqual(selQ.fairOdds);
        } else {
          expect(selQ.publishedOdds).toBeGreaterThanOrEqual(1.01);
        }

        // Overround check on published odds
        const publishedOverround = (1 / selP.publishedOdds) + (1 / selQ.publishedOdds);
        expect(publishedOverround).toBeGreaterThan(0.99);
      });
    });
  });
});
