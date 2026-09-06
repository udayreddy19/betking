import { describe, it, expect, beforeEach } from 'vitest';
import { buildCanonicalFromMatch } from '../../lib/odds-v3/buildCanonicalFromMatch.mjs';
import { generate as generateV4 } from '../../lib/odds-v4/OddsEngineV4.mjs';
import { generatePublicMatchOddsSnapshot } from '../../lib/odds-v4/engineDispatch.mjs';
import {
  generateTossFamilyMarketsV4,
} from '../../lib/odds-v4/markets/TossWinnerMarketV4.mjs';
import {
  evaluateTossWinnerBet,
  evaluateTossElectionBet,
  evaluateTeamBatFirstBet,
} from '../../lib/liveMatchSettlement.mjs';
import { resolveSettlementGrader } from '../../lib/settlement/marketSettlementRegistry.mjs';
import {
  resolveOddsEngineMode,
  setRuntimeEngineMode,
  clearRuntimeEngineMode,
  _resetEngineModeControlForTests,
} from '../../lib/odds-v4/EngineModeControl.mjs';

function prematch() {
  return {
    id: 'toss_pre_1',
    sport: 'cricket',
    status: 'SCHEDULED',
    isLive: false,
    matchState: 'pre',
    matchType: 'T20',
    team1: { name: 'Mumbai Indians', id: 'mi', shortName: 'MI', rating: 84 },
    team2: { name: 'Chennai Super Kings', id: 'csk', shortName: 'CSK', rating: 82 },
    odds: { team1: 1.85, team2: 1.95, home: 1.85, away: 1.95 },
  };
}

function srlPrematch() {
  return {
    ...prematch(),
    id: 'srl_ipl_0',
    source: 'srl',
    league: 'OddsYra SRL',
  };
}

describe('OddsEngineV4 — Toss family', () => {
  beforeEach(() => {
    delete process.env.ODDS_ENGINE;
    _resetEngineModeControlForTests();
    clearRuntimeEngineMode();
  });

  it('opens toss winner, toss&bat, toss&bowl, and bat-first pre-match', () => {
    const state = buildCanonicalFromMatch(prematch());
    const markets = generateTossFamilyMarketsV4(state, {}, { tossWinnerOverround: 0.08 });
    const ids = markets.map((m) => m.marketId).sort();
    expect(ids).toEqual(['team_bat_first', 'toss_and_bat', 'toss_and_bowl', 'toss_winner']);
    expect(markets.every((m) => m.status === 'OPEN')).toBe(true);
  });

  it('publishes the toss family in the full V4 book', () => {
    const state = buildCanonicalFromMatch(prematch());
    const snap = generateV4(state, { winnerOnly: false });
    for (const id of ['toss_winner', 'toss_and_bat', 'toss_and_bowl', 'team_bat_first']) {
      expect(snap.markets.find((m) => m.marketId === id)?.status).toBe('OPEN');
    }
  });

  it('settles toss family once toss evidence is present', () => {
    const withToss = {
      ...prematch(),
      isLive: true,
      matchState: 'in',
      status: 'LIVE',
      toss: { wonToss: 'Mumbai Indians', decision: 'bat' },
      liveDetails: { tossWinner: 'Mumbai Indians', tossDecision: 'bat' },
    };

    expect(evaluateTossWinnerBet({
      market_id: 'toss_winner',
      selection_id: 'sel_mi',
      selection_name: 'Mumbai Indians',
    }, withToss).outcome).toBe('WON');

    expect(evaluateTossElectionBet({
      market_id: 'toss_and_bat',
      selection_id: 'toss_and_bat_yes',
      selection_name: 'Yes',
    }, withToss).outcome).toBe('WON');

    expect(evaluateTossElectionBet({
      market_id: 'toss_and_bowl',
      selection_id: 'toss_and_bowl_yes',
      selection_name: 'Yes',
    }, withToss).outcome).toBe('LOST');

    expect(evaluateTeamBatFirstBet({
      market_id: 'team_bat_first',
      selection_id: 'sel_mi',
      selection_name: 'Mumbai Indians',
    }, withToss).outcome).toBe('WON');
  });

  it('registers settlement graders for the toss family', () => {
    expect(resolveSettlementGrader('toss_winner')).toBe('tossWinnerMarket');
    expect(resolveSettlementGrader('toss_and_bat')).toBe('tossElectionMarket');
    expect(resolveSettlementGrader('toss_and_bowl')).toBe('tossElectionMarket');
    expect(resolveSettlementGrader('team_bat_first')).toBe('teamBatFirstMarket');
  });

  it('forces V4 for OddsYra SRL even when global mode is v3', () => {
    setRuntimeEngineMode('v3');
    expect(resolveOddsEngineMode()).toBe('v3');
    const { publicSnapshot, mode } = generatePublicMatchOddsSnapshot(srlPrematch());
    expect(mode).toBe('v4');
    expect(publicSnapshot.engine).toBe('OddsEngineV4');
    const ids = (publicSnapshot.markets || []).map((m) => m.marketId);
    expect(ids).toContain('toss_winner');
    expect(ids).toContain('toss_and_bat');
  });
});
