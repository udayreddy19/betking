import { describe, it, expect } from 'vitest';
import { generate as generateV3 } from '../../lib/odds-v3/OddsEngineV3.mjs';
import { createCanonicalMatchState } from '../../lib/odds-v3/models/CanonicalMatchState.mjs';
import {
  alignWinnerMarkets,
  assertBettableQuote,
  oddsQuoteChanged,
  suspendLockMarkets,
} from '../../lib/odds-v3/bookIntegrity.mjs';
import { riskAdjustmentEngine } from '../../lib/engines/riskAdjustmentEngine.mjs';

describe('Book integrity', () => {
  it('accepts lock prices rejection and returns server odds when client drifts', () => {
    expect(() => assertBettableQuote(1.00, 1.50)).toThrow(/ODDS_LOCKED/);
    expect(() => assertBettableQuote(1.85, 2.50)).toThrow(/STALE_ODDS/);
    expect(assertBettableQuote(1.85, 1.85)).toBe(1.85);
    expect(assertBettableQuote(1.85, 1.87)).toBe(1.85);
    expect(oddsQuoteChanged(1.85, 2.50)).toBe(true);
  });

  it('copies Match Winner prices onto Winner (incl. Super Over)', () => {
    const markets = alignWinnerMarkets([
      {
        marketId: 'match_winner',
        status: 'OPEN',
        selections: [
          { selectionId: 'w1', name: 'RCB', odds: 8.2, probability: 0.12 },
          { selectionId: 'w2', name: 'PBKS', odds: 1.12, probability: 0.88 },
        ],
      },
      {
        marketId: 'match_winner_super_over',
        status: 'OPEN',
        selections: [
          { selectionId: 'so1', name: 'RCB', odds: 1.15, probability: 0.85 },
          { selectionId: 'so2', name: 'PBKS', odds: 5.5, probability: 0.15 },
        ],
      },
    ]);
    const so = markets.find((m) => m.marketId === 'match_winner_super_over');
    expect(so.selections[0].odds).toBe(8.2);
    expect(so.selections[1].odds).toBe(1.12);
    expect(so.selections[0].selectionId).toBe('so1');
  });

  it('suspends markets that print at the 1.01 floor', () => {
    const [market] = suspendLockMarkets([
      {
        marketId: 'team_total',
        status: 'OPEN',
        selections: [
          { selectionId: 'o', name: 'Over 76.5', odds: 1.01, probability: 0.99 },
          { selectionId: 'u', name: 'Under 76.5', odds: 34, probability: 0.01 },
        ],
      },
    ]);
    expect(market.status).toBe('SUSPENDED');
    expect(market.selections.every((s) => s.bettable === false)).toBe(true);
  });

  it('prices soccer 1X2 instead of inventing cricket markets', () => {
    const snap = generateV3({
      matchId: 'soccer_1',
      sport: 'soccer',
      isLive: true,
      matchState: 'in',
      team1: { name: 'Arsenal' },
      team2: { name: 'Chelsea' },
      liveDetails: { score1: 1, score2: 0, minute: "62'" },
      odds: { home: 2.1, away: 3.4, draw: 3.2, team1: 2.1, team2: 3.4 },
      stateVersion: 1,
    });
    expect(snap.status).toBe('OK');
    const winner = snap.markets.find((m) => m.marketId === 'match_winner');
    expect(winner).toBeTruthy();
    expect(winner.selections.map((s) => s.selectionId)).toEqual(['1', 'X', '2']);
    expect(snap.markets.some((m) => m.marketType === 'NEXT_DELIVERY_RUNS')).toBe(false);
    expect(snap.markets.some((m) => m.marketId === 'match_winner_super_over')).toBe(false);
  });

  it('lengthens the side with high liability', () => {
    riskAdjustmentEngine.recordBetLiability('mkt_ou', 'sel_over', 50000, 95000);
    const shifted = riskAdjustmentEngine.applyTwoWayShift(0.5, 0.5, 'mkt_ou', 'sel_over', 'sel_under');
    expect(shifted.p0).toBeLessThan(0.5);
    expect(shifted.p1).toBeGreaterThan(0.5);
  });
});
