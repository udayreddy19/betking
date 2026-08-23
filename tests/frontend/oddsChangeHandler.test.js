import { describe, it, expect } from 'vitest';
import {
  applyOddsChangedToBets,
  acceptOddsForBet,
  handleOddsChangedResponse,
  hasPendingOddsAcceptance,
  normalizeOddsUpdates,
  ODDS_STATUS,
} from '../../src/utils/oddsChangeHandler.js';

describe('oddsChangeHandler', () => {
  const bet = {
    id: 'b1',
    matchId: 'm1',
    marketId: 'match_winner',
    selection: '1',
    selectionName: 'Mumbai Indians',
    odds: 1.85,
    marketName: 'Match Winner',
  };

  it('applies ODDS_CHANGED payload without removing selection', () => {
    const updates = [{
      matchId: 'm1',
      marketId: 'match_winner',
      selectionId: '1',
      oldOdds: 1.85,
      newOdds: 2.10,
    }];
    const next = applyOddsChangedToBets([bet], updates);
    expect(next).toHaveLength(1);
    expect(next[0].odds).toBe(2.10);
    expect(next[0].previousOdds).toBe(1.85);
    expect(next[0].oddsStatus).toBe(ODDS_STATUS.CHANGED);
  });

  it('accepts updated odds explicitly', () => {
    const changed = applyOddsChangedToBets([bet], [{
      matchId: 'm1',
      selectionId: '1',
      oldOdds: 1.85,
      newOdds: 2.10,
    }])[0];
    const accepted = acceptOddsForBet(changed);
    expect(accepted.odds).toBe(2.10);
    expect(accepted.oddsStatus).toBe(ODDS_STATUS.ACCEPTED);
    expect(accepted.oddsChanged).toBe(false);
    expect(hasPendingOddsAcceptance([accepted])).toBe(false);
  });

  it('handles API rejection shape', () => {
    const result = handleOddsChangedResponse([bet], {
      success: false,
      code: 'ODDS_CHANGED',
      data: {
        matchId: 'm1',
        marketId: 'match_winner',
        selectionId: '1',
        oldOdds: '1.85',
        newOdds: '2.10',
        requiresAcceptance: true,
      },
    });
    expect(result.oddsUpdated).toBe(true);
    expect(result.requiresAcceptance).toBe(true);
    expect(result.bets[0].odds).toBe(2.10);
    expect(hasPendingOddsAcceptance(result.bets)).toBe(true);
  });

  it('normalizes repeated odds changes to latest server price', () => {
    const updates = normalizeOddsUpdates({
      oddsUpdates: [{
        matchId: 'm1',
        selectionId: '1',
        oldOdds: '2.10',
        newOdds: '2.25',
      }],
    });
    expect(updates[0].newOdds).toBe(2.25);
  });
});
