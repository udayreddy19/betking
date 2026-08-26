import { describe, it, expect } from 'vitest';
import {
  evaluatePlayerPropMarketBet,
  parsePlayerPropMarket,
  slugifyPlayerName,
  resolvePlayerBatter,
} from '../../lib/settlement/playerMilestoneEvaluator.mjs';
import { resolveSettlementGrader } from '../../lib/settlement/marketSettlementRegistry.mjs';
import { parseMarketInstance } from '../../lib/placementSnapshot.mjs';

describe('player milestone settlement (25/50/100)', () => {
  const liveMatch = ({ batter1, batter2, scorecardBatters, final = false, inningsId = 1 } = {}) => ({
    id: 'oy_player_prop',
    sport: 'cricket',
    isLive: !final,
    matchState: final ? 'post' : 'in',
    status: final ? 'COMPLETED' : 'LIVE',
    matchType: 'T20',
    liveDetails: {
      inningsId,
      overs: inningsId === 2 ? '12.0' : '10.0',
      firstOvers: inningsId === 2 ? '20.0' : '10.0',
      firstRuns: 160,
      firstWickets: inningsId === 2 ? 7 : 2,
      chaseOvers: inningsId === 2 ? '12.0' : undefined,
      chaseRuns: inningsId === 2 ? 90 : undefined,
      chaseWickets: inningsId === 2 ? 3 : undefined,
      batter1,
      batter2,
      scorecardBatters,
    },
    team1: { name: 'A', runs: 160, wickets: 7, overs: '20.0' },
    team2: { name: 'B', runs: inningsId === 2 ? 90 : 0, wickets: inningsId === 2 ? 3 : 0 },
    scorecardInnings: scorecardBatters ? [{
      inningsId: 1,
      batters: scorecardBatters,
    }] : [],
  });

  it('registers player prop graders', () => {
    expect(resolveSettlementGrader('player_25_alex_hales')).toBe('playerPropMarket');
    expect(resolveSettlementGrader('player_50_virat_kohli_srl')).toBe('playerPropMarket');
    expect(resolveSettlementGrader('player_100_jos_buttler')).toBe('playerPropMarket');
    expect(resolveSettlementGrader('player_alt_alex_hales')).toBe('playerPropMarket');
  });

  it('parses market ids and placement instances', () => {
    expect(parsePlayerPropMarket('player_25_alex_hales')).toEqual({
      kind: 'MILESTONE',
      target: 25,
      playerSlug: 'alex_hales',
      marketType: 'PLAYER_SCORE_25',
    });
    expect(parseMarketInstance('player_50_alex_hales').type).toBe('PLAYER_MILESTONE');
    expect(slugifyPlayerName('Alex Hales')).toBe('alex_hales');
  });

  it('settles Yes WON as soon as 25+ is reached live', () => {
    const match = liveMatch({
      batter1: { name: 'Alex Hales', runs: 28, balls: 16, notOut: true, dismissal: 'batting' },
    });
    const res = evaluatePlayerPropMarketBet({
      market_id: 'player_25_alex_hales',
      selection_id: 'sel_25_yes',
      selection_name: 'Yes',
    }, match);
    expect(res).toEqual({ outcome: 'WON', reason: 'player_25_runs=28' });
  });

  it('keeps 50+ PENDING while batting under the target', () => {
    const match = liveMatch({
      batter1: { name: 'Alex Hales', runs: 28, balls: 16, notOut: true, dismissal: 'batting' },
    });
    expect(evaluatePlayerPropMarketBet({
      market_id: 'player_50_alex_hales',
      selection_id: 'sel_50_yes',
      selection_name: 'Yes',
    }, match)).toBeNull();
  });

  it('settles Yes LOST when batter is dismissed under the milestone', () => {
    const match = liveMatch({
      batter1: { name: 'Other Batter', runs: 5, balls: 4, notOut: true, dismissal: 'batting' },
      scorecardBatters: [
        { name: 'Alex Hales', runs: 22, balls: 18, notOut: false, dismissal: 'c mid-off b Archer' },
        { name: 'Other Batter', runs: 5, balls: 4, notOut: true, dismissal: 'batting' },
      ],
    });
    const res = evaluatePlayerPropMarketBet({
      market_id: 'player_25_alex_hales',
      selection_id: 'sel_25_yes',
      selection_name: 'Yes',
    }, match);
    expect(res).toEqual({ outcome: 'LOST', reason: 'player_25_final=22' });
  });

  it('settles No WON when innings ends under the milestone (not out)', () => {
    const match = liveMatch({
      inningsId: 2,
      batter1: { name: 'Chase Opener', runs: 40, balls: 30, notOut: true, dismissal: 'batting' },
      scorecardBatters: [
        { name: 'Alex Hales', runs: 41, balls: 28, notOut: true, dismissal: 'not out' },
        { name: 'Tom Banton', runs: 18, balls: 12, notOut: false, dismissal: 'bowled' },
      ],
    });
    // first innings done (chase started) — Hales finished on 41
    const res = evaluatePlayerPropMarketBet({
      market_id: 'player_50_alex_hales',
      selection_id: 'sel_50_no',
      selection_name: 'No',
    }, match);
    expect(res).toEqual({ outcome: 'WON', reason: 'player_50_final=41' });
  });

  it('VOIDs when player did not bat and match is complete', () => {
    const match = liveMatch({
      final: true,
      scorecardBatters: [
        { name: 'Someone Else', runs: 55, balls: 40, notOut: false, dismissal: 'caught' },
      ],
    });
    const res = evaluatePlayerPropMarketBet({
      market_id: 'player_25_alex_hales',
      selection_id: 'sel_25_yes',
      selection_name: 'Yes',
    }, match);
    expect(res).toEqual({ outcome: 'VOID', reason: 'player_alex_hales_dnb' });
  });

  it('settles alt Over when live runs cross the line', () => {
    const match = liveMatch({
      batter1: { name: 'Alex Hales', runs: 36, balls: 20, notOut: true, dismissal: 'batting' },
    });
    const res = evaluatePlayerPropMarketBet({
      market_id: 'player_alt_alex_hales',
      selection_id: 'sel_palt_over',
      selection_name: 'Over 34.5',
    }, match);
    expect(res).toEqual({ outcome: 'WON', reason: 'player_alt_runs=36_line=34.5' });
  });

  it('settles alt Under when batter finishes below the line', () => {
    const match = liveMatch({
      scorecardBatters: [
        { name: 'Alex Hales', runs: 30, balls: 22, notOut: false, dismissal: 'lbw' },
      ],
      batter1: { name: 'Partner', runs: 10, balls: 8, notOut: true, dismissal: 'batting' },
    });
    const res = evaluatePlayerPropMarketBet({
      market_id: 'player_alt_alex_hales',
      selection_id: 'sel_palt_under',
      selection_name: 'Under 34.5',
    }, match);
    expect(res).toEqual({ outcome: 'WON', reason: 'player_alt_final=30_line=34.5' });
  });

  it('matches abbreviated scorecard names to market slug', () => {
    const match = liveMatch({
      batter1: { name: 'A Hales', runs: 58, balls: 30, notOut: true, dismissal: 'batting' },
    });
    expect(resolvePlayerBatter(match, 'alex_hales')?.runs).toBe(58);
    expect(evaluatePlayerPropMarketBet({
      market_id: 'player_50_alex_hales',
      selection_id: 'sel_50_yes',
      selection_name: 'Yes',
    }, match)?.outcome).toBe('WON');
  });
});
