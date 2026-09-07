/**
 * Settlement contract + grading — positive and negative matrix.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveMarketContract,
  validateMarketSettlementCompatibility,
  MARKET_SETTLEMENT_CONTRACTS,
} from '../../lib/settlement/marketSettlementContract.mjs';
import { resolveSettlementGrader } from '../../lib/settlement/marketSettlementRegistry.mjs';
import {
  evaluateBetForSettlement,
  evaluateSoccerResultBet,
  evaluateScoreSpreadBet,
  evaluateScoreTotalBet,
} from '../../lib/liveMatchSettlement.mjs';
import { generate as generateOsV4 } from '../../lib/other-sports-v4/OtherSportsEngineV4.mjs';
import { generate as generateV4 } from '../../lib/odds-v4/OddsEngineV4.mjs';
import { buildCanonicalFromMatch } from '../../lib/odds-v3/buildCanonicalFromMatch.mjs';

function finishedSoccer(score1, score2, overrides = {}) {
  return {
    id: 'ft_soc',
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

function finishedBasketball(score1, score2) {
  return {
    id: 'ft_bb',
    sport: 'basketball',
    isCompleted: true,
    matchState: 'post',
    status: 'COMPLETED',
    score1,
    score2,
    liveDetails: { score1, score2 },
  };
}

describe('settlement contract positive cases', () => {
  it('registers core cricket + soccer + basketball contracts', () => {
    expect(MARKET_SETTLEMENT_CONTRACTS.length).toBeGreaterThan(20);
    for (const id of [
      'match_winner',
      'toss_winner',
      'team_total',
      'match_total',
      'goals_line',
      'double_chance',
      'dnb',
      'btts',
      'spread',
    ]) {
      const c = resolveMarketContract(id);
      expect(c, id).toBeTruthy();
      expect(c.supported).toBe(true);
      expect(c.resolver).toBeTruthy();
    }
  });

  it('validates known market ids as compatible', () => {
    for (const id of ['match_winner', 'goals_line', 'spread', 'toss_winner']) {
      const r = validateMarketSettlementCompatibility({ marketId: id });
      expect(r.compatible).toBe(true);
      expect(r.resolver).toBeTruthy();
    }
  });

  it('soccer match_winner grades home / draw / away correctly', async () => {
    const homeWin = await evaluateBetForSettlement(
      { market_id: 'match_winner', selection_id: '1', selection_name: 'Arsenal' },
      finishedSoccer(2, 1),
    );
    const awayLose = await evaluateBetForSettlement(
      { market_id: 'match_winner', selection_id: '2', selection_name: 'Chelsea' },
      finishedSoccer(2, 1),
    );
    const drawWin = await evaluateBetForSettlement(
      { market_id: 'match_winner', selection_id: 'X', selection_name: 'Draw' },
      finishedSoccer(1, 1),
    );
    expect(homeWin.outcome).toBe('WON');
    expect(awayLose.outcome).toBe('LOST');
    expect(drawWin.outcome).toBe('WON');
  });

  it('soccer DNB voids on draw and pays decisive results', () => {
    expect(evaluateSoccerResultBet(
      { market_id: 'dnb', selection_id: 'DNB:1' },
      finishedSoccer(0, 0),
    ).outcome).toBe('VOID');
    expect(evaluateSoccerResultBet(
      { market_id: 'dnb', selection_id: 'DNB:2' },
      finishedSoccer(0, 2),
    ).outcome).toBe('WON');
  });

  it('basketball spread + total grade from final score', () => {
    const match = finishedBasketball(110, 100);
    expect(evaluateScoreSpreadBet(
      {
        market_id: 'spread',
        selection_id: 'Spread:1 -5.5',
        selection_name: 'Home -5.5',
        line: 5.5,
      },
      match,
    ).outcome).toBe('WON');
    expect(evaluateScoreTotalBet(
      {
        market_id: 'total_pts',
        selection_id: 'Over 205.5',
        selection_name: 'Over 205.5',
        line: 205.5,
      },
      match,
    ).outcome).toBe('WON');
    expect(evaluateScoreTotalBet(
      {
        market_id: 'total_pts',
        selection_id: 'Under 205.5',
        selection_name: 'Under 205.5',
        line: 205.5,
      },
      match,
    ).outcome).toBe('LOST');
  });

  it('async evaluateBetForSettlement pays soccer DC legs', async () => {
    const match = finishedSoccer(3, 1);
    const won = await evaluateBetForSettlement(
      { market_id: 'double_chance', selection_id: 'DC:1X', selection_name: 'Arsenal or Draw' },
      match,
    );
    const lost = await evaluateBetForSettlement(
      { market_id: 'double_chance', selection_id: 'DC:X2', selection_name: 'Draw or Chelsea' },
      match,
    );
    expect(won.outcome).toBe('WON');
    expect(lost.outcome).toBe('LOST');
  });

  it('OSV4 open markets resolve to a known settlement grader', () => {
    const snap = generateOsV4({
      matchId: 'live-soc',
      sport: 'soccer',
      team1: { name: 'A' },
      team2: { name: 'B' },
      isLive: true,
      matchState: 'in',
      liveDetails: { score1: 0, score2: 0, minute: 20 },
      odds: { home: 2.1, draw: 3.3, away: 3.4 },
    }, { allowModelOnly: true });
    for (const m of snap.markets.filter((x) => x.status === 'OPEN')) {
      const grader = resolveSettlementGrader(m.marketId);
      expect(grader, m.marketId).toBeTruthy();
    }
  });
});

describe('settlement contract negative cases', () => {
  it('rejects orphan / unsupported / empty market ids', () => {
    expect(validateMarketSettlementCompatibility(null).compatible).toBe(false);
    expect(validateMarketSettlementCompatibility({}).compatible).toBe(false);
    expect(validateMarketSettlementCompatibility({ marketId: 'nope_xyz' }).compatible).toBe(false);
    expect(resolveMarketContract('nope_xyz')).toBeNull();
  });

  it('does not invent a grader for unknown market ids', () => {
    expect(resolveSettlementGrader('totally_unknown_market_99')).toBeNull();
  });

  it('losing soccer selections are LOST not VOID', async () => {
    const r = await evaluateBetForSettlement(
      { market_id: 'match_winner', selection_id: '2', selection_name: 'Chelsea' },
      finishedSoccer(4, 0),
    );
    expect(r.outcome).toBe('LOST');
    expect(r.outcome).not.toBe('VOID');
    expect(r.outcome).not.toBe('WON');
  });

  it('spread loser is LOST when cover fails', () => {
    const r = evaluateScoreSpreadBet(
      {
        market_id: 'spread',
        selection_id: 'Spread:1 -12.5',
        selection_name: 'Home -12.5',
        line: 12.5,
      },
      finishedBasketball(110, 100),
    );
    expect(r.outcome).toBe('LOST');
  });

  it('cricket V4 open markets stay settlement-compatible (no orphans)', () => {
    const match = {
      id: 'csettle',
      sport: 'cricket',
      status: 'LIVE',
      isLive: true,
      matchState: 'in',
      matchType: 'T20',
      team1: { name: 'A', id: 'a' },
      team2: { name: 'B', id: 'b' },
      liveDetails: {
        firstRuns: 140,
        firstWickets: 5,
        firstOvers: '20.0',
        chaseRuns: 70,
        chaseWickets: 1,
        chaseOvers: '9.0',
        battingTeam: 'B',
        innings: 2,
        batter1: { name: 'X', runs: 30, balls: 20 },
        batter2: { name: 'Y', runs: 20, balls: 18 },
      },
    };
    const snap = generateV4(buildCanonicalFromMatch(match), { winnerOnly: false });
    const open = snap.markets.filter((m) => m.status === 'OPEN');
    expect(open.length).toBeGreaterThan(0);
    const orphans = open.filter((m) => !validateMarketSettlementCompatibility(m).compatible);
    expect(orphans.map((m) => m.marketId)).toEqual([]);
  });

  it('abandoned-style soccer without scores does not falsely pay winner', async () => {
    const abandoned = {
      id: 'abd',
      sport: 'soccer',
      status: 'ABANDONED',
      isCompleted: false,
      matchState: 'post',
      team1: { name: 'A' },
      team2: { name: 'B' },
      score1: null,
      score2: null,
      liveDetails: {},
    };
    const r = await evaluateBetForSettlement(
      { market_id: 'match_winner', selection_id: '1', selection_name: 'A' },
      abandoned,
    );
    expect(['VOID', 'PENDING', 'LOST', 'UNSETTLED', 'NO_RESULT']).toContain(
      String(r.outcome || r.status || 'PENDING').toUpperCase(),
    );
    expect(r.outcome).not.toBe('WON');
  });
});
