import { describe, it, expect } from 'vitest';
import {
  evaluateBetAfterMatchOver,
  evaluateDeliveryMarketBet,
  evaluateOpenBetOutcome,
  buildSettlementMatchState,
} from '../../lib/liveMatchSettlement.mjs';

describe('live settlement when match is over / gone', () => {
  it('voids next-delivery bets after the fixture is gone', () => {
    const res = evaluateBetAfterMatchOver({
      market_id: 'i1_next_delivery_wicket_12_1',
      selection_id: 'sel_wkt_no',
      selection_name: 'No',
    });
    expect(res.outcome).toBe('VOID');
  });

  it('does not throw when building settlement state without a match object', () => {
    expect(() => buildSettlementMatchState(null)).not.toThrow();
    expect(buildSettlementMatchState(null).matchId).toBe(null);
  });

  it('voids match winner when the fixture is gone and winner is unknown', () => {
    const res = evaluateBetAfterMatchOver({
      market_id: 'match_winner',
      selection_id: 'Outer Delhi Warriors',
      selection_name: 'Outer Delhi Warriors',
    });
    expect(res.outcome).toBe('VOID');
  });

  it('settles match winner when the completed match has a result', () => {
    const match = {
      id: 'oy_test',
      matchState: 'post',
      status: 'COMPLETED',
      result: 'Outer Delhi Warriors won by 5 wickets',
      team1: { name: 'Inner Delhi Kings', shortName: 'IDK' },
      team2: { name: 'Outer Delhi Warriors', shortName: 'ODW' },
    };
    const state = buildSettlementMatchState(match);
    expect(state.status).toBe('COMPLETED');
    expect(state.winnerSide).toBe('2');
    const res = evaluateOpenBetOutcome({
      market_id: 'match_winner',
      selection_id: 'Outer Delhi Warriors',
      selection_name: 'Outer Delhi Warriors',
    }, state);
    expect(res.outcome).toBe('WON');
  });

  it('voids match winner when complete but winner cannot be resolved', () => {
    const match = {
      id: 'oy_test',
      matchState: 'post',
      status: 'COMPLETED',
      team1: { name: 'A', shortName: 'A' },
      team2: { name: 'B', shortName: 'B' },
    };
    const state = buildSettlementMatchState(match);
    const res = evaluateOpenBetOutcome({
      market_id: 'match_winner',
      selection_id: 'A',
      selection_name: 'A',
    }, state);
    expect(res.outcome).toBe('VOID');
  });
});

describe('next-delivery live settlement', () => {
  const liveMatch = (overs, extra = {}) => ({
    id: 'oy_fixture_1',
    sport: 'cricket',
    isLive: true,
    matchState: 'in',
    matchType: 'T20',
    league: 'Delhi Premier League',
    liveDetails: {
      overs,
      firstOvers: overs,
      firstRuns: 80,
      firstWickets: 2,
      inningsId: 1,
    },
    team1: { name: 'A', shortName: 'A', runs: 80, wickets: 2, overs },
    team2: { name: 'B', shortName: 'B' },
    ...extra,
  });

  it('keeps the bet open while still on that delivery', () => {
    const res = evaluateDeliveryMarketBet({
      market_id: 'i1_next_delivery_wicket_39_1',
      selection_id: 'sel_wkt_no',
    }, liveMatch('38.0', { matchType: 'ODI', league: 'One-Day Cup' }));
    expect(res).toBeNull();
  });

  it('voids once the live over/ball has moved past the market slot', () => {
    const res = evaluateDeliveryMarketBet({
      market_id: 'i1_next_delivery_wicket_39_1',
      selection_id: 'sel_wkt_no',
    }, liveMatch('38.1', { matchType: 'ODI', league: 'One-Day Cup' }));
    expect(res?.outcome).toBe('VOID');
    expect(res.reason).toMatch(/delivery_ball_passed/);
  });

  it('voids a T20 next-delivery market whose over is past the format', () => {
    const res = evaluateDeliveryMarketBet({
      market_id: 'i2_next_delivery_wicket_39_1',
      selection_id: 'sel_wkt_no',
    }, liveMatch('12.3', { liveDetails: {
      overs: '12.3',
      chaseOvers: '12.3',
      chaseRuns: 90,
      chaseWickets: 3,
      firstRuns: 140,
      inningsId: 2,
    } }));
    expect(res?.outcome).toBe('VOID');
    expect(res.reason).toBe('delivery_over_past_format');
  });

  it('voids next-delivery when the fixture is no longer in play', () => {
    const res = evaluateDeliveryMarketBet({
      market_id: 'i2_next_delivery_wicket_39_1',
      selection_id: 'sel_wkt_no',
    }, {
      id: 'oy_fixture_1',
      sport: 'cricket',
      isLive: false,
      matchState: 'pre',
      matchType: 'T20',
    });
    expect(res?.outcome).toBe('VOID');
    expect(res.reason).toBe('delivery_not_in_play');
  });
});

