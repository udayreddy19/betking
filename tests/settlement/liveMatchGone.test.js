import { describe, it, expect } from 'vitest';
import {
  evaluateBetAfterMatchOver,
  evaluateDeliveryMarketBet,
  evaluateAccumulatorBet,
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

  it('settles WON/LOST once the live over/ball has moved past the market slot', () => {
    const res = evaluateDeliveryMarketBet({
      market_id: 'i1_next_delivery_wicket_39_1',
      selection_id: 'sel_wkt_no',
      selection_name: 'No',
    }, liveMatch('38.1', {
      matchType: 'ODI',
      league: 'One-Day Cup',
      overHistory: [{ overNum: 39, balls: ['1', '•'], isCurrent: true }],
    }));
    expect(res?.outcome).toBe('WON');
    expect(res.reason).toMatch(/delivery_wicket=false/);
  });

  it('settles next delivery runs markets from over history', () => {
    const res = evaluateDeliveryMarketBet({
      market_id: 'i2_next_delivery_runs_8_5',
      selection_id: 'sel_del_2',
      selection_name: '2 Runs',
    }, liveMatch('7.5', {
      liveDetails: {
        overs: '7.5',
        chaseOvers: '7.5',
        chaseRuns: 90,
        chaseWickets: 3,
        firstRuns: 140,
        inningsId: 2,
        currentOverBalls: ['1', '4', '•', '1', '2'],
      },
      overHistory: [{ overNum: 8, balls: ['1', '4', '•', '1', '2'], isCurrent: true }],
    }));
    expect(res?.outcome).toBe('WON');
    expect(res.reason).toBe('delivery_runs=2');
  });

  it('marks next delivery runs LOST when a different outcome was bowled', () => {
    const res = evaluateDeliveryMarketBet({
      market_id: 'i2_next_delivery_runs_8_5',
      selection_id: 'sel_del_0',
      selection_name: '0 Runs (Dot)',
    }, liveMatch('7.5', {
      liveDetails: {
        overs: '7.5',
        chaseOvers: '7.5',
        chaseRuns: 90,
        chaseWickets: 3,
        firstRuns: 140,
        inningsId: 2,
      },
      overHistory: [{ overNum: 8, balls: ['1', '4', '•', '1', '2'], isCurrent: true }],
    }));
    expect(res?.outcome).toBe('LOST');
    expect(res.reason).toBe('delivery_runs=2');
  });

  it('keeps delivery pending when ball passed but no authoritative feed yet', () => {
    const res = evaluateDeliveryMarketBet({
      market_id: 'i1_next_delivery_wicket_39_1',
      selection_id: 'sel_wkt_no',
    }, liveMatch('38.1', { matchType: 'ODI', league: 'One-Day Cup' }));
    expect(res).toBeNull();
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

  it('voids next-delivery when the fixture is scheduled and never started', () => {
    const res = evaluateDeliveryMarketBet({
      market_id: 'i2_next_delivery_wicket_39_1',
      selection_id: 'sel_wkt_no',
    }, {
      id: 'oy_fixture_1',
      sport: 'cricket',
      isLive: false,
      matchState: 'pre',
      matchType: 'T20',
      time: 'Today 18:00',
    });
    expect(res?.outcome).toBe('VOID');
    expect(res.reason).toBe('delivery_not_in_play');
  });

  it('keeps delivery pending when feed hydration returns an empty pre-match stub', () => {
    const res = evaluateDeliveryMarketBet({
      market_id: 'i2_next_delivery_runs_6_4',
      selection_id: 'sel_del_2',
      selection_name: '2 Runs',
    }, {
      id: 'oy_dc873391-82c6-375f-b63d-9e890a94f193',
      sport: 'cricket',
      isLive: false,
      matchState: 'pre',
      liveDetails: {},
    });
    expect(res).toBeNull();
  });

  it('keeps next-delivery open when off ticker but overs/score exist', () => {
    const res = evaluateDeliveryMarketBet({
      market_id: 'i1_next_delivery_wicket_18_2',
      selection_id: 'sel_under',
    }, {
      id: 'oy_fixture_2',
      sport: 'cricket',
      isLive: false,
      matchState: 'pre',
      matchType: 'T20',
      liveDetails: { overs: '17.4', firstRuns: 120, firstWickets: 3 },
    });
    expect(res).toBeNull();
  });

  it('settles accumulator LOST when one delivery leg loses', async () => {
    const match = liveMatch('7.5', {
      liveDetails: {
        overs: '7.5',
        firstOvers: '7.5',
        firstRuns: 90,
        firstWickets: 3,
        inningsId: 1,
      },
      overHistory: [{ overNum: 8, balls: ['1', '4', '•', '1', '2'], isCurrent: true }],
    });
    const res = await evaluateAccumulatorBet({
      bet_id: 'bet_acca_1',
      bet_type: 'ACCUMULATOR',
      match_id: 'oy_fixture_1',
      selections: [
        { market_id: 'i1_next_delivery_runs_8_5', selection_id: 'sel_del_2', selection_name: '2 Runs' },
        { market_id: 'i1_next_delivery_runs_8_5', selection_id: 'sel_del_0', selection_name: '0 Runs (Dot)' },
      ],
    }, match);
    expect(res?.outcome).toBe('LOST');
    expect(res.reason).toBe('acca_leg_lost');
  });
});

