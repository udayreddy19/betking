/**
 * OtherSportsEngineV4 — positive + negative matrix (v4.8 / 10.0).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  generate,
  bookPoints,
  isOtherSportsV4Sport,
  OSV4_ENGINE_VERSION,
  OSV4_MARGIN_CONFIG,
  marginsForSport,
  tightenOsV4Markets,
  guardOsV4Book,
  applyOsV4StabilityFallback,
} from '../../lib/other-sports-v4/index.mjs';
import { validateMarketSettlementCompatibility } from '../../lib/settlement/marketSettlementContract.mjs';
import { getOddsEngineScorecard } from '../../lib/oddsEngineScorecard.mjs';
import {
  _resetOtherSportsEngineModeControlForTests,
  clearRuntimeOtherSportsEngineMode,
} from '../../lib/other-sports-v4/EngineModeControl.mjs';

function soccer(extra = {}) {
  return {
    matchId: 'osv47-soc',
    sport: 'soccer',
    team1: { name: 'Home FC' },
    team2: { name: 'Away FC' },
    isLive: true,
    matchState: 'in',
    liveDetails: { score1: 1, score2: 0, minute: 62 },
    odds: { home: 1.95, draw: 3.4, away: 3.8 },
    ...extra,
  };
}

function basketball(extra = {}) {
  return {
    matchId: 'osv47-bb',
    sport: 'basketball',
    team1: { name: 'Home' },
    team2: { name: 'Away' },
    isLive: true,
    matchState: 'in',
    liveDetails: { score1: 88, score2: 84, minute: 34 },
    odds: { home: 1.8, away: 2.05 },
    ...extra,
  };
}

function tennis(extra = {}) {
  return {
    matchId: 'osv47-ten',
    sport: 'tennis',
    team1: { name: 'P1' },
    team2: { name: 'P2' },
    isLive: true,
    matchState: 'in',
    liveDetails: { score1: 1, score2: 0 },
    odds: { home: 1.65, away: 2.25 },
    ...extra,
  };
}

describe('OtherSportsEngineV4 positive cases', () => {
  beforeEach(() => {
    _resetOtherSportsEngineModeControlForTests();
  });

  afterEach(async () => {
    _resetOtherSportsEngineModeControlForTests();
    await clearRuntimeOtherSportsEngineMode().catch(() => null);
  });

  it('scorecard marks OSV4 at 4.8.7 / 10.0', () => {
    expect(OSV4_ENGINE_VERSION).toBe('4.8.7');
    const row = getOddsEngineScorecard().find((r) => r.engine === 'OtherSportsEngineV4');
    expect(row.version).toBe('4.8.7');
    expect(row.score).toBe(10.0);
  });

  it('AF uses dedicated drive model', () => {
    const snap = generate(basketball({
      sport: 'american-football',
      liveDetails: { score1: 14, score2: 10, minute: 22 },
      odds: { home: 1.9, away: 1.95 },
    }), { allowModelOnly: true });
    expect(snap.osv4Meta?.features).toContain('af_drive_model');
    expect(snap.osv4Meta?.operatorMark).toBe(10.0);
    const mw = snap.markets.find((m) => m.marketId === 'match_winner');
    expect(mw?.status).toBe('OPEN');
  });

  it('prices soccer / basketball / tennis with open moneyline', () => {
    for (const match of [soccer(), basketball(), tennis()]) {
      const snap = generate(match, { allowModelOnly: true });
      expect(snap.engineVersion).toBe('4.8.7');
      expect(snap.osv4Meta?.qualityScore).toBe(10.0);
      const mw = snap.markets.find((m) => m.marketId === 'match_winner');
      expect(mw?.status).toBe('OPEN');
      expect(bookPoints(mw.selections)).toBeGreaterThanOrEqual(118);
    }
  });

  it('all open markets are settlement-compatible', () => {
    const snap = generate(soccer(), { allowModelOnly: true });
    for (const m of snap.markets.filter((x) => x.status === 'OPEN')) {
      expect(validateMarketSettlementCompatibility(m).compatible).toBe(true);
    }
  });

  it('AF tune applies tighter caps than soccer defaults', () => {
    const af = marginsForSport('american-football');
    expect(af.maxSelectionOdds).toBeLessThan(OSV4_MARGIN_CONFIG.maxSelectionOdds);
    expect(af.maxOverOdds).toBeLessThanOrEqual(OSV4_MARGIN_CONFIG.maxOverOdds);
    expect(af.matchWinnerOverround).toBeGreaterThanOrEqual(OSV4_MARGIN_CONFIG.matchWinnerOverround);
  });

  it('finished soccer returns DETERMINED empty book', () => {
    const snap = generate(soccer({
      isLive: false,
      isCompleted: true,
      matchState: 'post',
      status: 'COMPLETED',
      liveDetails: { score1: 2, score2: 1, minute: 90 },
    }), { allowModelOnly: true });
    expect(snap.status).toBe('DETERMINED');
    expect(snap.markets).toHaveLength(0);
  });

  it('soccer late lock suspends extras after minute threshold', () => {
    const snap = generate(soccer({
      liveDetails: { score1: 2, score2: 1, minute: 84 },
    }), { allowModelOnly: true });
    const mw = snap.markets.find((m) => m.marketId === 'match_winner');
    expect(mw?.status).toBe('OPEN');
    const extras = snap.markets.filter((m) => m.marketId !== 'match_winner' && m.status === 'OPEN');
    expect(extras).toHaveLength(0);
    expect(snap.osv4Meta?.features).toContain('late_lock');
  });

  it('ESPN Q4 basketball clock late-locks extras', () => {
    const snap = generate(basketball({
      liveDetails: { score1: 102, score2: 99, quarter: 'Q4 2:15' },
    }), { allowModelOnly: true });
    const mw = snap.markets.find((m) => m.marketId === 'match_winner');
    expect(mw?.status).toBe('OPEN');
    const extras = snap.markets.filter((m) => m.marketId !== 'match_winner' && m.status === 'OPEN');
    expect(extras).toHaveLength(0);
  });

  it('ESPN Q4 NFL clock late-locks extras', () => {
    const snap = generate({
      matchId: 'espn-af-q4',
      sport: 'american-football',
      team1: { name: 'Home' },
      team2: { name: 'Away' },
      isLive: true,
      matchState: 'in',
      liveDetails: { score1: 24, score2: 21, quarter: 'Q4 3:00' },
      odds: { home: 1.7, away: 2.2 },
    }, { allowModelOnly: true });
    const extras = snap.markets.filter((m) => m.marketId !== 'match_winner' && m.status === 'OPEN');
    expect(extras).toHaveLength(0);
  });

  it('FanCode minute Live fails closed on soccer extras', () => {
    const snap = generate(soccer({
      liveDetails: { score1: 2, score2: 1, minute: 'Live' },
    }), { allowModelOnly: true });
    const extras = snap.markets.filter((m) => m.marketId !== 'match_winner' && m.status === 'OPEN');
    expect(extras).toHaveLength(0);
  });

  it('does not invert a strong AF away provider favorite', () => {
    const snap = generate({
      matchId: 'af-invert',
      sport: 'american-football',
      team1: { name: 'Home Dogs' },
      team2: { name: 'Away Favs' },
      isLive: true,
      matchState: 'in',
      liveDetails: { score1: 10, score2: 17, quarter: 'Q2 8:00' },
      odds: { home: 4.5, away: 1.22 },
    }, { allowModelOnly: true });
    const mw = snap.markets.find((m) => m.marketId === 'match_winner');
    expect(mw?.status).toBe('OPEN');
    const home = mw.selections.find((s) => s.selectionId === '1' || /Dogs/i.test(s.name));
    const away = mw.selections.find((s) => s.selectionId === '2' || /Favs/i.test(s.name));
    expect(Number(away.odds)).toBeLessThan(Number(home.odds));
  });
});

describe('OtherSportsEngineV4 negative cases', () => {
  it('rejects cricket and unsupported sports', () => {
    expect(isOtherSportsV4Sport('cricket')).toBe(false);
    expect(isOtherSportsV4Sport('kabaddi')).toBe(false);
    const cricket = generate({
      matchId: 'c1',
      sport: 'cricket',
      team1: { name: 'A' },
      team2: { name: 'B' },
    }, { allowModelOnly: true });
    expect(cricket.status).toBe('NOT_AVAILABLE');
    expect(cricket.note).toMatch(/Cricket/i);

    const other = generate({
      matchId: 'k1',
      sport: 'kabaddi',
      team1: { name: 'A' },
      team2: { name: 'B' },
      odds: { home: 1.8, away: 2.0 },
    }, { allowModelOnly: true });
    expect(other.status).toBe('NOT_AVAILABLE');
  });

  it('blocks model-only pricing in production without provider odds', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const snap = generate({
        matchId: 'prod-no-odds',
        sport: 'soccer',
        team1: { name: 'A' },
        team2: { name: 'B' },
        isLive: true,
        matchState: 'in',
        liveDetails: { score1: 0, score2: 0, minute: 10 },
      }, { allowModelOnly: false });
      expect(snap.status).toBe('NOT_AVAILABLE');
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('caps longshots / favorites / overs under v4.8 limits', () => {
    const snap = generate(soccer({
      odds: { home: 1.2, draw: 7.5, away: 11 },
    }), { allowModelOnly: true });
    for (const m of snap.markets.filter((x) => x.status === 'OPEN')) {
      for (const s of m.selections || []) {
        expect(Number(s.odds)).toBeLessThanOrEqual(OSV4_MARGIN_CONFIG.maxSelectionOdds + 0.001);
        if (Number(s.probability) >= 0.48) {
          expect(Number(s.odds)).toBeLessThanOrEqual(OSV4_MARGIN_CONFIG.maxFavoriteOdds + 0.001);
        }
        if (/^over/i.test(String(s.name))) {
          expect(Number(s.odds)).toBeLessThanOrEqual(OSV4_MARGIN_CONFIG.maxOverOdds + 0.001);
        }
      }
    }
  });

  it('guardian suspends soft/thin books', () => {
    const soft = [
      {
        marketId: 'match_winner',
        marketType: 'MATCH_WINNER',
        status: 'OPEN',
        selections: [
          { selectionId: '1', name: 'A', odds: 2.05, probability: 0.5 },
          { selectionId: '2', name: 'B', odds: 2.05, probability: 0.5 },
        ],
      },
    ];
    const tightened = tightenOsV4Markets(soft, OSV4_MARGIN_CONFIG);
    const guarded = guardOsV4Book(tightened, OSV4_MARGIN_CONFIG);
    // Either enforced to min mass or suspended — never arb
    for (const m of guarded.markets.filter((x) => x.status === 'OPEN')) {
      expect(bookPoints(m.selections)).toBeGreaterThan(100);
    }
  });

  it('stability fallback keeps only match_winner when issues pile up', () => {
    const markets = [
      { marketId: 'match_winner', status: 'OPEN', selections: [{ odds: 1.5 }, { odds: 2.5 }] },
      { marketId: 'goals_line', status: 'OPEN', selections: [{ odds: 1.5 }, { odds: 2.5 }] },
      { marketId: 'btts', status: 'OPEN', selections: [{ odds: 1.5 }, { odds: 2.5 }] },
    ];
    const out = applyOsV4StabilityFallback(markets, ['a', 'b', 'c']);
    expect(out.find((m) => m.marketId === 'match_winner').status).toBe('OPEN');
    expect(out.find((m) => m.marketId === 'goals_line').status).toBe('SUSPENDED');
    expect(out.find((m) => m.marketId === 'btts').status).toBe('SUSPENDED');
  });

  it('stability fallback is a no-op with few issues', () => {
    const markets = [
      { marketId: 'goals_line', status: 'OPEN', selections: [{ odds: 1.4 }, { odds: 2.8 }] },
    ];
    const out = applyOsV4StabilityFallback(markets, ['one']);
    expect(out[0].status).toBe('OPEN');
  });
});
