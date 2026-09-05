import { describe, it, expect } from 'vitest';
import { generate } from '../../lib/odds-v3/OddsEngineV3.mjs';
import { adaptV3SnapshotToPublicContract } from '../../lib/odds-v3/adapters/V3ApiAdapter.mjs';
import { findQuotedSelection } from '../../lib/odds-v3/bookIntegrity.mjs';
import { resolveSettlementGrader } from '../../lib/settlement/marketSettlementRegistry.mjs';
import {
  evaluateBetForSettlement,
  evaluateSoccerResultBet,
  evaluateScoreSpreadBet,
  evaluateScoreTotalBet,
  evaluateSetWinnerBet,
} from '../../lib/liveMatchSettlement.mjs';

function finishedSoccer(score1, score2, overrides = {}) {
  return {
    id: 'api_soc_ft',
    sport: 'soccer',
    isLive: false,
    isCompleted: true,
    matchState: 'post',
    status: 'COMPLETED',
    time: 'FT',
    team1: { name: 'Arsenal' },
    team2: { name: 'Chelsea' },
    score1,
    score2,
    liveDetails: { score1, score2 },
    ...overrides,
  };
}

describe('other-sports settlement graders', () => {
  it('routes soccer double_chance to FT scores instead of cricket SPECIAL_MATCH runs', async () => {
    expect(resolveSettlementGrader('double_chance')).toBe('specialMatchMarket');
    expect(resolveSettlementGrader('dnb')).toBe('soccerChanceMarket');

    const match = finishedSoccer(2, 1);
    const dc1x = await evaluateBetForSettlement(
      { market_id: 'double_chance', selection_id: 'DC:1X', selection_name: 'Arsenal or Draw' },
      match,
    );
    const dcx2 = await evaluateBetForSettlement(
      { market_id: 'double_chance', selection_id: 'DC:X2', selection_name: 'Draw or Chelsea' },
      match,
    );
    const dc12 = await evaluateBetForSettlement(
      { market_id: 'double_chance', selection_id: 'DC:12', selection_name: 'Arsenal or Chelsea' },
      match,
    );
    expect(dc1x.outcome).toBe('WON');
    expect(dcx2.outcome).toBe('LOST');
    expect(dc12.outcome).toBe('WON');
    expect(dc1x.reason).toMatch(/soccer_dc/);
  });

  it('voids draw-no-bet on a soccer draw and pays the winner otherwise', () => {
    expect(evaluateSoccerResultBet(
      { market_id: 'dnb', selection_id: 'DNB:1' },
      finishedSoccer(1, 1),
    ).outcome).toBe('VOID');
    expect(evaluateSoccerResultBet(
      { market_id: 'dnb', selection_id: 'DNB:1' },
      finishedSoccer(2, 0),
    ).outcome).toBe('WON');
    expect(evaluateSoccerResultBet(
      { market_id: 'dnb', selection_id: 'DNB:2' },
      finishedSoccer(2, 0),
    ).outcome).toBe('LOST');
  });

  it('grades basketball spread and total from final scores including overtime', () => {
    const match = {
      sport: 'basketball',
      isCompleted: true,
      matchState: 'post',
      status: 'COMPLETED',
      score1: 112,
      score2: 108,
      liveDetails: { score1: 112, score2: 108 },
    };
    expect(evaluateScoreSpreadBet(
      { market_id: 'spread', selection_id: 'Spread:1 -5.5', selection_name: 'Lakers -5.5' },
      match,
    ).outcome).toBe('LOST');
    expect(evaluateScoreSpreadBet(
      { market_id: 'spread', selection_id: 'Spread:2 +5.5', selection_name: 'Celtics +5.5' },
      match,
    ).outcome).toBe('WON');
    expect(evaluateScoreTotalBet(
      { market_id: 'total_pts', selection_id: 'Points:Over 220.5', selection_name: 'Over 220.5' },
      match,
    ).outcome).toBe('LOST');
    expect(evaluateScoreTotalBet(
      { market_id: 'total_pts', selection_id: 'Points:Under 220.5', selection_name: 'Under 220.5' },
      match,
    ).outcome).toBe('WON');
  });

  it('grades tennis set winner and total games from set scores', () => {
    const match = {
      sport: 'tennis',
      isCompleted: true,
      matchState: 'post',
      status: 'COMPLETED',
      score1: 2,
      score2: 0,
      liveDetails: { score1: 2, score2: 0, sets1: [6, 6], sets2: [4, 3] },
    };
    expect(evaluateSetWinnerBet(
      { market_id: 'set1_winner', selection_id: 'Set1:1' },
      match,
    ).outcome).toBe('WON');
    expect(evaluateScoreTotalBet(
      { market_id: 'total_games', selection_id: 'Games:Over 21.5', selection_name: 'Over 21.5 Games' },
      match,
    ).outcome).toBe('LOST');
    expect(evaluateSetWinnerBet(
      { market_id: 'set1_winner', selection_id: 'Set1:1' },
      { ...match, liveDetails: { score1: 2, score2: 0 } },
    ).outcome).toBe('VOID');
  });

  it('grades kabaddi match_total and volleyball total_sets at match complete', async () => {
    const kabaddi = await evaluateBetForSettlement(
      { market_id: 'match_total', selection_id: 'Total:Over 35.5', selection_name: 'Over 35.5' },
      {
        sport: 'kabaddi',
        isCompleted: true,
        matchState: 'post',
        status: 'COMPLETED',
        score1: 42,
        score2: 38,
        liveDetails: { score1: 42, score2: 38 },
      },
    );
    expect(kabaddi.outcome).toBe('WON');

    const sets = evaluateScoreTotalBet(
      { market_id: 'total_sets', selection_id: 'Sets:Over 3.5', selection_name: 'Over 3.5' },
      {
        sport: 'volleyball',
        isCompleted: true,
        matchState: 'post',
        status: 'COMPLETED',
        score1: 3,
        score2: 1,
        liveDetails: { score1: 3, score2: 1, sets1: [25, 22, 25, 25], sets2: [20, 25, 18, 19] },
      },
    );
    expect(sets.outcome).toBe('WON');
  });

  it('declares finished snooker match_winner from frame score (Hill vs Jones)', async () => {
    const match = {
      id: 'oy_snk_hill_jones',
      sport: 'snooker',
      isLive: false,
      isCompleted: true,
      matchState: 'post',
      status: 'COMPLETED',
      winnerSide: '2',
      team1: { name: 'Hill, Aaron', shortName: 'HIL' },
      team2: { name: 'Jones, Jak', shortName: 'JON' },
      score1: 3,
      score2: 5,
      liveDetails: { score1: 3, score2: 5 },
    };
    const lost = await evaluateBetForSettlement(
      {
        market_id: 'match_winner',
        selection_id: 'sel_hill',
        selection_name: 'Hill, Aaron',
      },
      match,
    );
    const won = await evaluateBetForSettlement(
      {
        market_id: 'match_winner',
        selection_id: 'sel_jones',
        selection_name: 'Jones, Jak',
      },
      match,
    );
    expect(lost.outcome).toBe('LOST');
    expect(won.outcome).toBe('WON');
  });

  it('quotes soccer extra markets from the V3 public snapshot', () => {
    const match = {
      id: 'api_soc_q',
      sport: 'soccer',
      isLive: true,
      matchState: 'in',
      team1: { name: 'Arsenal' },
      team2: { name: 'Chelsea' },
      liveDetails: { score1: 1, score2: 0, minute: "62'" },
      odds: { home: 2.1, away: 3.4, draw: 3.2, team1: 2.1, team2: 3.4 },
    };
    const snap = adaptV3SnapshotToPublicContract(generate(match), match);
    const dc = snap.markets.find((m) => m.marketId === 'double_chance');
    expect(dc).toBeTruthy();
    const quoted = findQuotedSelection(snap, 'double_chance', 'DC:1X');
    expect(quoted.odds).toBeGreaterThan(1);
  });
});
