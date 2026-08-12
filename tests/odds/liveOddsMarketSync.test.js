import { describe, it, expect } from 'vitest';
import { evaluateMarketAgainstMatchState } from '../../lib/marketEvaluationEngine.mjs';
import { marketStateMachine, MARKET_STATES } from '../../lib/marketStateMachine.mjs';
import { betPlacementEngine } from '../../lib/betPlacementEngine.mjs';
import { generateMatchMarkets } from '../../src/utils/oddsMarketsGenerator.js';

describe('CRITICAL Live Odds / Market State / Score Synchronization Tests — Exact Screenshot Verification', () => {
  // Shared match state representing exact screenshot:
  // Australia: 178/5 (Innings 1 complete)
  // South Africa: 156/7 (Innings 2, 17.4 overs, target 179, needs 23 runs)
  const matchState = {
    teams: {
      team1: { name: 'Australia', runs: 178, wickets: 5 },
      team2: { name: 'South Africa', runs: 156, wickets: 7 },
    },
    currentInnings: { number: 2, batTeam: 'South Africa' },
    status: 'LIVE',
    chaseState: { target: 179, runsNeeded: 23, ballsRemaining: 14 },
    liveDetails: {
      runs: 178,
      wickets: 5,
      score2: 156,
      wickets2: 7,
      overs: '17.4',
      target: 179,
      chaseTeamName: 'South Africa',
      firstTeamName: 'Australia',
      inningsId: 2,
    },
  };

  it('BUG #1 VERIFICATION — Total Match Runs line 298.5 (combined score = 334) -> DETERMINED / NOT BETTABLE', () => {
    const market = {
      key: 'match_total_runs',
      title: 'Total Match Runs',
      line: 298.5,
      options: [
        { selection: 'MatchRuns:Over 298.5', name: 'Over 298.5', line: 298.5 },
        { selection: 'MatchRuns:Under 298.5', name: 'Under 298.5', line: 298.5 },
      ],
    };

    const res = evaluateMarketAgainstMatchState(market, matchState);
    expect(res.status).toBe('DETERMINED');
    expect(res.determined).toBe(true);

    const overOpt = res.options.find(o => o.name.includes('Over'));
    const underOpt = res.options.find(o => o.name.includes('Under'));

    expect(overOpt.status).toBe('DETERMINED');
    expect(overOpt.bettable).toBe(false);
    expect(overOpt.won).toBe(true);

    expect(underOpt.status).toBe('DETERMINED');
    expect(underOpt.bettable).toBe(false);
    expect(underOpt.won).toBe(false);
  });

  it('BUG #2 VERIFICATION — Australia Total Runs line 165.5 (Australia score = 178) -> DETERMINED / NOT BETTABLE', () => {
    const market = {
      key: 'team1_runs',
      title: 'Australia Total Runs',
      line: 165.5,
      options: [
        { selection: 'T1Runs:Over 165.5', name: 'Over 165.5', line: 165.5 },
        { selection: 'T1Runs:Under 165.5', name: 'Under 165.5', line: 165.5 },
      ],
    };

    const res = evaluateMarketAgainstMatchState(market, matchState);
    expect(res.status).toBe('DETERMINED');
    expect(res.determined).toBe(true);

    const overOpt = res.options.find(o => o.name.includes('Over'));
    const underOpt = res.options.find(o => o.name.includes('Under'));

    expect(overOpt.status).toBe('DETERMINED');
    expect(overOpt.bettable).toBe(false);
    expect(overOpt.won).toBe(true);

    expect(underOpt.status).toBe('DETERMINED');
    expect(underOpt.bettable).toBe(false);
    expect(underOpt.won).toBe(false);
  });

  it('BUG #3 VERIFICATION — South Africa Total Runs line 175.5 (SA score = 156, Target = 179) -> OPEN / BETTABLE', () => {
    const market = {
      key: 'team2_runs',
      title: 'South Africa Total Runs',
      line: 175.5,
      options: [
        { selection: 'T2Runs:Over 175.5', name: 'Over 175.5', line: 175.5 },
        { selection: 'T2Runs:Under 175.5', name: 'Under 175.5', line: 175.5 },
      ],
    };

    const res = evaluateMarketAgainstMatchState(market, matchState);
    expect(res.status).toBe('OPEN');
    expect(res.determined).toBe(false);

    const overOpt = res.options.find(o => o.name.includes('Over'));
    const underOpt = res.options.find(o => o.name.includes('Under'));

    expect(overOpt.status).toBe('OPEN');
    expect(overOpt.bettable).toBe(true);
    expect(underOpt.status).toBe('OPEN');
    expect(underOpt.bettable).toBe(true);
  });

  it('BUG #4 VERIFICATION — 1st Innings 6 Over Powerplay Total line 48.5 (Innings 1 Completed) -> DETERMINED / NOT BETTABLE', () => {
    const market = {
      key: 'powerplay_total',
      title: '1st Innings 6 Over Powerplay Total',
      line: 48.5,
      options: [
        { selection: 'Powerplay:Over 48.5', name: 'Over 48.5', line: 48.5 },
        { selection: 'Powerplay:Under 48.5', name: 'Under 48.5', line: 48.5 },
      ],
    };

    const res = evaluateMarketAgainstMatchState(market, matchState);
    expect(res.status).toBe('DETERMINED');
    expect(res.determined).toBe(true);

    res.options.forEach((opt) => {
      expect(opt.status).toBe('DETERMINED');
      expect(opt.bettable).toBe(false);
    });
  });

  it('Test 5: South Africa line >= target (e.g. 185.5 where Target = 179) -> DETERMINED (Over Impossible)', () => {
    const market = {
      key: 'team2_runs',
      title: 'South Africa Total Runs',
      line: 185.5,
      options: [
        { selection: 'T2Runs:Over 185.5', name: 'Over 185.5', line: 185.5 },
        { selection: 'T2Runs:Under 185.5', name: 'Under 185.5', line: 185.5 },
      ],
    };

    const res = evaluateMarketAgainstMatchState(market, matchState);
    expect(res.status).toBe('DETERMINED');
    expect(res.determined).toBe(true);
  });

  it('Test 6: Market State Machine transitions to DETERMINED cleanly', () => {
    expect(marketStateMachine.isValidTransition(MARKET_STATES.OPEN, MARKET_STATES.DETERMINED)).toBe(true);
    expect(marketStateMachine.isValidTransition(MARKET_STATES.SUSPENDED, MARKET_STATES.DETERMINED)).toBe(true);
    expect(marketStateMachine.isValidTransition(MARKET_STATES.DETERMINED, MARKET_STATES.CLOSED)).toBe(true);
  });

  it('Test 7: Backend bet placement engine rejects bet placement on determined market selection', async () => {
    const betAttempt = betPlacementEngine.placeBet({
      userId: 'usr_test_123',
      matchId: 'm_test_live',
      marketId: 'team1_runs',
      selectionId: 'T1Runs:Over 165.5',
      stake: 100,
      clientOdds: 1.85,
    });

    await expect(betAttempt).rejects.toThrow();
  });

  it('Test 8: generateMatchMarkets generates dynamic lines and marks determined lines', () => {
    const match = {
      id: 'm_aus_sa_live',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      team1: { name: 'Australia', shortName: 'AUS' },
      team2: { name: 'South Africa', shortName: 'SA' },
      liveDetails: {
        runs: 178,
        wickets: 5,
        overs: '19.2',
        score2: 156,
        wickets2: 7,
        inningsId: 2,
        chaseTeamName: 'South Africa',
        firstTeamName: 'Australia',
      },
    };

    const markets = generateMatchMarkets(match);
    const t1Market = markets.find(m => m.key === 'team1_runs');
    const t2Market = markets.find(m => m.key === 'team2_runs');
    const ppMarket = markets.find(m => m.key === 'powerplay_total');

    expect(t1Market).toBeDefined();
    expect(t2Market).toBeDefined();
    expect(ppMarket).toBeDefined();
    expect(ppMarket.status).toBe('DETERMINED');
  });
});
