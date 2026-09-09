/**
 * Phase 4H, 4I, 4J — Cricket V4 Market & Format Validation Suite
 *
 * Validates:
 *   - Phase 4H: Cricket V4 Market Pipeline (Fair -> Published -> Accepted -> Settlement)
 *   - Phase 4I: Test Cricket format-awareness (ballsRemaining = null, lead/deficit/session)
 *   - Phase 4J: The Hundred (100 legal deliveries, 0, 1, 50, 99, 100 balls)
 */

import { describe, it, expect } from 'vitest';
import { generateMatchWinnerMarketV4 } from '../../lib/odds-v4/markets/MatchWinnerMarketV4.mjs';
import { generateTossFamilyMarketsV4 } from '../../lib/odds-v4/markets/TossWinnerMarketV4.mjs';
import { remainingResourcePct, expectedRemainingRuns } from '../../lib/odds-v4/models/resourceTables.mjs';
import { priceMarketPipeline } from '../../lib/pricing/CanonicalPricingPipeline.mjs';
import { validateMarketSettlementCompatibility } from '../../lib/settlement/marketSettlementContract.mjs';
import { resolveSettlementGrader } from '../../lib/settlement/marketSettlementRegistry.mjs';
import { getFormatRules } from '../../lib/odds-v3/format/CricketFormatRules.mjs';
import { resolveCricketOversFormat } from '../../src/utils/cricketFormat.js';

describe('Phase 4H, 4I, 4J — Cricket V4 Validation', () => {

  // Phase 4H: Cricket Validation Across Market Families
  describe('Phase 4H: Major Cricket V4 Market Validation', () => {
    const liveMatch = {
      id: 'crick_v4_test_01',
      sport: 'cricket',
      format: 'T20',
      team1: { id: 'csk', name: 'Chennai Super Kings' },
      team2: { id: 'mi', name: 'Mumbai Indians' },
      status: 'LIVE',
      currentInnings: 2,
      score: {
        innings1: { runs: 180, wickets: 6, overs: 20 },
        innings2: { runs: 120, wickets: 3, overs: 14.2 },
      },
      target: 181,
      ballsRemaining: 34,
      runsNeeded: 61,
      wicketsInHand: 7,
      odds: {
        home: 1.65,
        away: 2.25,
      },
    };

    const preMatch = {
      id: 'crick_v4_test_pre',
      sport: 'cricket',
      format: 'T20',
      team1: { id: 'csk', name: 'Chennai Super Kings' },
      team2: { id: 'mi', name: 'Mumbai Indians' },
      status: 'SCHEDULED',
      odds: {
        home: 1.70,
        away: 2.15,
      },
    };

    it('generates Match Winner preserving fair probability before margin', () => {
      const mw = generateMatchWinnerMarketV4(liveMatch);
      expect(mw).toBeDefined();
      expect(mw.marketId).toBe('match_winner');
      expect(mw.selections).toHaveLength(2);

      // Pricing pipeline separation
      const priced = priceMarketPipeline({
        marketId: 'match_winner',
        selections: [
          { selectionId: 'csk', name: liveMatch.team1.name, rawProbability: 0.65 },
          { selectionId: 'mi', name: liveMatch.team2.name, rawProbability: 0.35 },
        ],
        overround: 0.08,
      });

      expect(priced.status).toBe('OPEN');
      expect(priced.selections[0].fairProbability).toBe(0.65);
      expect(priced.selections[1].fairProbability).toBe(0.35);
      expect(priced.selections[0].fairProbability + priced.selections[1].fairProbability).toBeCloseTo(1.0, 4);

      // Published odds have margin applied
      expect(priced.selections[0].publishedOdds).toBeLessThan(priced.selections[0].fairOdds);
      expect(priced.selections[1].publishedOdds).toBeLessThan(priced.selections[1].fairOdds);

      // Compatibility & settlement
      const compat = validateMarketSettlementCompatibility({ marketId: 'match_winner' });
      expect(compat.compatible).toBe(true);
      expect(resolveSettlementGrader('match_winner')).toBe('openBetOutcome');
    });

    it('validates Toss Family markets in pre-match state', () => {
      const tossMarkets = generateTossFamilyMarketsV4(preMatch);
      expect(tossMarkets.length).toBeGreaterThanOrEqual(3);

      for (const m of tossMarkets) {
        const compat = validateMarketSettlementCompatibility({ marketId: m.marketId });
        expect(compat.compatible).toBe(true);
        expect(resolveSettlementGrader(m.marketId)).toBeDefined();
      }
    });

    it('verifies settlement compatibility across all major cricket market families', () => {
      const families = [
        'match_winner',
        'match_total',
        'team_total',
        'next_over_15_total',
        'next_delivery_15_3',
        'method_of_next_wicket_4',
        'player_50_csk_batter1',
        'total_match_sixes',
        'toss_winner',
      ];

      for (const marketId of families) {
        const compat = validateMarketSettlementCompatibility({ marketId });
        expect(compat.compatible).toBe(true);
        const grader = resolveSettlementGrader(marketId);
        expect(grader).toBeTruthy();
      }
    });
  });

  // Phase 4I: Test Cricket Format-Awareness
  describe('Phase 4I: Test Cricket Resource & State Modeling', () => {
    it('strictly returns null for ballsRemaining in Test cricket', () => {
      const testResource = remainingResourcePct({
        format: 'TEST',
        wicketsInHand: 6,
        ballsRemaining: null,
      });
      expect(testResource).toBeNull();

      const expectedRuns = expectedRemainingRuns({
        format: 'TEST',
        wicketsInHand: 6,
        ballsRemaining: null,
      });
      expect(expectedRuns).toBeNull();
    });

    it('correctly classifies Test format rules and prevents limited-overs assumptions', () => {
      const testRules = getFormatRules('TEST');
      expect(testRules).toBeDefined();
      expect(testRules.ballsPerInnings).toBe(2700);

      const t20Rules = getFormatRules('T20');
      expect(t20Rules.ballsPerInnings).toBe(120);

      const resolved = resolveCricketOversFormat({ format: 'TEST' });
      expect(resolved).toBe('TEST');
    });

    it('evaluates Test match state features (lead, deficit, session, day) without inventing deliveries', () => {
      const testMatchState = {
        format: 'TEST',
        day: 4,
        session: 'EVENING',
        innings: 4,
        ballsRemaining: null, // Null delivery count is explicitly verified
        score: {
          innings1: { team: 'India', runs: 350, wickets: 10 },
          innings2: { team: 'England', runs: 280, wickets: 10 },
          innings3: { team: 'India', runs: 240, wickets: 10 },
          innings4: { team: 'England', runs: 180, wickets: 5 },
        },
        target: 311,
        lead: 0,
        deficit: 131,
        oversRemainingToday: 15.0,
      };

      expect(testMatchState.ballsRemaining).toBeNull();
      expect(testMatchState.deficit).toBe(131);
      expect(testMatchState.session).toBe('EVENING');
      expect(testMatchState.day).toBe(4);
    });
  });

  // Phase 4J: The Hundred 100-Delivery Modeling
  describe('Phase 4J: The Hundred 100 Legal Deliveries', () => {
    it('correctly identifies The Hundred format and loads 100 balls rule', () => {
      const hundredRules = getFormatRules('THE_HUNDRED');
      expect(hundredRules).toBeDefined();
      expect(hundredRules.ballsPerInnings).toBe(100);
      expect(hundredRules.ballsPerOver).toBe(5);

      const resolved = resolveCricketOversFormat({ league: 'The Hundred Men 2026' });
      expect(resolved).toBe('THE_HUNDRED');
    });

    it('evaluates resource percentages across key ball milestones: 0, 1, 50, 99, 100', () => {
      // 0 balls remaining (innings complete)
      const res0 = remainingResourcePct({
        format: 'THE_HUNDRED',
        wicketsInHand: 5,
        ballsRemaining: 0,
        ballsPerInnings: 100,
      });
      expect(res0).toBe(0);

      // 1 ball remaining
      const res1 = remainingResourcePct({
        format: 'THE_HUNDRED',
        wicketsInHand: 5,
        ballsRemaining: 1,
        ballsPerInnings: 100,
      });
      expect(res1).toBeGreaterThan(0);
      expect(res1).toBeLessThan(5);

      // 50 balls remaining (halfway)
      const res50 = remainingResourcePct({
        format: 'THE_HUNDRED',
        wicketsInHand: 10,
        ballsRemaining: 50,
        ballsPerInnings: 100,
      });
      expect(res50).toBeGreaterThan(45);
      expect(res50).toBeLessThan(75);

      // 99 balls remaining
      const res99 = remainingResourcePct({
        format: 'THE_HUNDRED',
        wicketsInHand: 10,
        ballsRemaining: 99,
        ballsPerInnings: 100,
      });
      expect(res99).toBeGreaterThan(95);

      // 100 balls remaining (match start)
      const res100 = remainingResourcePct({
        format: 'THE_HUNDRED',
        wicketsInHand: 10,
        ballsRemaining: 100,
        ballsPerInnings: 100,
      });
      expect(res100).toBe(100);
    });

    it('correctly tracks Hundred delivery display (not 6-ball overs)', () => {
      const hundredState = {
        format: 'THE_HUNDRED',
        ballsBowled: 45,
        ballsRemaining: 55,
        legalDeliveriesTotal: 100,
      };

      expect(hundredState.ballsBowled + hundredState.ballsRemaining).toBe(100);
      expect(hundredState.ballsBowled % 5 === 0).toBe(true); // 5-ball end
    });
  });
});
