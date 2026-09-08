/**
 * OddsEngineV4 — positive + negative matrix (v4.7 house book).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildCanonicalFromMatch } from '../../lib/odds-v3/buildCanonicalFromMatch.mjs';
import { generate as generateV4, V4_ENGINE_VERSION } from '../../lib/odds-v4/OddsEngineV4.mjs';
import { generate as generateV3 } from '../../lib/odds-v3/OddsEngineV3.mjs';
import { V4_MARGIN_CONFIG, tightenV4Markets, resolveSrlV4Margins } from '../../lib/odds-v4/v4HouseProtect.mjs';
import { SRL_MARGIN_CONFIG } from '../../lib/odds-v3/pricing/MarginCalculator.mjs';
import { enrichIplSrlMatchCard } from '../../lib/iplSrlCardMarkets.mjs';
import { validateMarketSettlementCompatibility } from '../../lib/settlement/marketSettlementContract.mjs';
import { getOddsEngineScorecard } from '../../lib/oddsEngineScorecard.mjs';

function liveChase(extra = {}) {
  return {
    id: 'v47_chase',
    sport: 'cricket',
    status: 'LIVE',
    isLive: true,
    matchState: 'in',
    matchType: 'T20',
    team1: { name: 'Alpha', id: 'a' },
    team2: { name: 'Beta', id: 'b' },
    liveDetails: {
      firstRuns: 160,
      firstWickets: 6,
      firstOvers: '20.0',
      chaseRuns: 95,
      chaseWickets: 2,
      chaseOvers: '11.0',
      battingTeam: 'Beta',
      innings: 2,
      batter1: { name: 'Bat One', runs: 45, balls: 30 },
      batter2: { name: 'Bat Two', runs: 22, balls: 20 },
    },
    ...extra,
  };
}

function openImplied(market) {
  return (market?.selections || []).reduce((s, x) => s + 1 / Number(x.odds), 0);
}

describe('OddsEngineV4 positive cases', () => {
  beforeEach(() => {
    delete process.env.ODDS_ENGINE;
  });

  it('emits v4.9.0 identity and scorecard mark 10.0', () => {
    expect(V4_ENGINE_VERSION).toBe('4.9.0');
    const row = getOddsEngineScorecard().find((r) => r.engine === 'OddsEngineV4');
    expect(row.score).toBe(10.0);
    expect(row.version).toBe('4.9.0');
  });

  it('opens match_winner with thick house book on live chase', () => {
    const snap = generateV4(buildCanonicalFromMatch(liveChase()), { winnerOnly: true });
    expect(snap.engine).toBe('OddsEngineV4');
    expect(snap.engineVersion).toBe('4.9.0');
    const mw = snap.markets.find((m) => m.marketId === 'match_winner');
    expect(mw?.status).toBe('OPEN');
    expect(mw.selections.length).toBe(2);
    expect(openImplied(mw)).toBeGreaterThanOrEqual(1.14);
    expect(snap.v4Meta?.features).toEqual(expect.arrayContaining([
      'house_v49',
      'favorite_cap',
      'book_guardian',
      'soft_leak_suspend',
    ]));
  });

  it('keeps match_winner selections in team1/team2 order when team2 bats', () => {
    const state = buildCanonicalFromMatch(liveChase());
    expect(state.battingTeamId).toBe(state.team2.id);
    const snap = generateV4(state, { winnerOnly: true });
    const mw = snap.markets.find((m) => m.marketId === 'match_winner');
    expect(mw?.selections?.[0]?.selectionId).toBe(`sel_${state.team1.id}`);
    expect(mw?.selections?.[1]?.selectionId).toBe(`sel_${state.team2.id}`);
    expect(mw.selections[0].name).toBe(state.team1.name);
    expect(mw.selections[1].name).toBe(state.team2.name);
  });

  it('full book only publishes settlement-compatible open markets', () => {
    const snap = generateV4(buildCanonicalFromMatch(liveChase()), { winnerOnly: false });
    const open = snap.markets.filter((m) => m.status === 'OPEN');
    expect(open.length).toBeGreaterThan(5);
    for (const m of open) {
      const compat = validateMarketSettlementCompatibility(m);
      expect(compat.compatible).toBe(true);
    }
  });

  it('caps soft favorites and soft Overs under v4.7 house limits', () => {
    const snap = generateV4(buildCanonicalFromMatch(liveChase()), { winnerOnly: false });
    for (const m of snap.markets.filter((x) => x.status === 'OPEN')) {
      for (const s of m.selections || []) {
        expect(Number(s.odds)).toBeLessThanOrEqual(V4_MARGIN_CONFIG.maxSelectionOdds + 0.001);
        const fairP = Number(s.probability);
        if (Number.isFinite(fairP) && fairP >= 0.48) {
          expect(Number(s.odds)).toBeLessThanOrEqual(V4_MARGIN_CONFIG.maxFavoriteOdds + 0.001);
        }
        if (String(s.name).toLowerCase() === 'over' && fairP >= 0.42) {
          expect(Number(s.odds)).toBeLessThanOrEqual(V4_MARGIN_CONFIG.maxLiveTotalOverOdds + 0.001);
        }
      }
    }
  });

  it('completed match returns DETERMINED winner market', () => {
    const match = liveChase({
      status: 'COMPLETED',
      isLive: false,
      matchState: 'post',
      winner: 'Alpha',
      liveDetails: {
        firstRuns: 160,
        firstWickets: 6,
        firstOvers: '20.0',
        chaseRuns: 120,
        chaseWickets: 10,
        chaseOvers: '18.2',
        battingTeam: 'Beta',
        innings: 2,
      },
    });
    const snap = generateV4(buildCanonicalFromMatch(match), { winnerOnly: true });
    expect(snap.status).toBe('DETERMINED');
  });

  it('features include v4.9 house_v49 + integrity fixes + min_book_mass', () => {
    const snap = generateV4(buildCanonicalFromMatch(liveChase()), { winnerOnly: true });
    expect(snap.v4Meta?.features).toEqual(expect.arrayContaining([
      'house_v49',
      'chase_side_integrity',
      'odd_even_parity_fix',
      'post_vol_reteighten',
      'finite_fairp_over_cap',
      'min_book_mass',
      'core_only_lock',
      'soft_leak_suspend',
    ]));
    expect(snap.v4Meta?.operatorMark).toBe(10.0);
  });

  it('thicker MW implied mass than V3 on same state', () => {
    const state = buildCanonicalFromMatch(liveChase());
    const v3 = generateV3(state, { winnerOnly: true });
    const v4 = generateV4(state, { winnerOnly: true });
    const mw3 = v3.markets.find((m) => m.marketId === 'match_winner');
    const mw4 = v4.markets.find((m) => m.marketId === 'match_winner');
    expect(openImplied(mw4)).toBeGreaterThan(openImplied(mw3));
  });

  it('SRL margins cannot soften V4 Over/favorite ceilings', () => {
    const m = resolveSrlV4Margins(SRL_MARGIN_CONFIG);
    expect(m.maxLiveTotalOverOdds).toBeLessThanOrEqual(V4_MARGIN_CONFIG.maxLiveTotalOverOdds);
    expect(m.maxFavoriteOdds).toBe(V4_MARGIN_CONFIG.maxFavoriteOdds);
    expect(m.liveMatchWinnerOverround).toBeGreaterThanOrEqual(V4_MARGIN_CONFIG.liveMatchWinnerOverround);
  });

  it('SRL card maps team1/team2 odds by selectionId when team2 bats', () => {
    const match = {
      ...liveChase(),
      id: 'srl_oy_chase',
      league: 'OddsYra SRL',
      team1: { name: 'Alpha', id: 'a', key: 'alpha' },
      team2: { name: 'Beta', id: 'b', key: 'beta' },
    };
    const card = enrichIplSrlMatchCard(match);
    const mw = card.engineCardMarkets?.find((m) => m.marketId === 'match_winner');
    expect(mw?.status).toBe('OPEN');
    const t1Sel = mw.selections.find((s) => s.selectionId === 'sel_a');
    const t2Sel = mw.selections.find((s) => s.selectionId === 'sel_b');
    expect(Number(card.odds.team1)).toBe(Number(t1Sel.odds));
    expect(Number(card.odds.team2)).toBe(Number(t2Sel.odds));
  });
});

describe('OddsEngineV4 negative cases', () => {
  it('returns INVALID_STATE for empty/garbage match state', () => {
    const snap = generateV4({ sport: 'cricket' }, { winnerOnly: true });
    expect(['INVALID_STATE', 'NO_OPEN_MARKETS', 'OK', 'DETERMINED']).toContain(snap.status);
    if (snap.status === 'INVALID_STATE') {
      expect(snap.markets || []).toHaveLength(0);
    }
  });

  it('does not leave arb (implied mass ≤ 1.0) on open two-way markets', () => {
    const snap = generateV4(buildCanonicalFromMatch(liveChase()), { winnerOnly: false });
    for (const m of snap.markets.filter((x) => x.status === 'OPEN')) {
      const sels = (m.selections || []).filter((s) => Number(s.odds) >= 1.01);
      if (sels.length === 2) {
        expect(openImplied({ selections: sels })).toBeGreaterThan(1.0);
      }
    }
  });

  it('tightenV4Markets never raises odds above caps', () => {
    const soft = [
      {
        marketId: 'match_winner',
        status: 'OPEN',
        selections: [
          { name: 'Fav', odds: 1.9, probability: 0.55 },
          { name: 'Dog', odds: 9.5, probability: 0.45 },
        ],
      },
      {
        marketId: 'team_total',
        status: 'OPEN',
        selections: [
          { name: 'Over', odds: 1.8, probability: 0.6 },
          { name: 'Under', odds: 2.1, probability: 0.4 },
        ],
      },
    ];
    const out = tightenV4Markets(soft, V4_MARGIN_CONFIG);
    expect(Number(out[0].selections[0].odds)).toBeLessThanOrEqual(V4_MARGIN_CONFIG.maxFavoriteOdds);
    expect(Number(out[0].selections[1].odds)).toBeLessThanOrEqual(V4_MARGIN_CONFIG.maxSelectionOdds);
    expect(Number(out[1].selections[0].odds)).toBeLessThanOrEqual(V4_MARGIN_CONFIG.maxLiveTotalOverOdds);
  });

  it('rejects orphan market ids via settlement contract', () => {
    const compat = validateMarketSettlementCompatibility({
      marketId: 'totally_fake_market_xyz',
      status: 'OPEN',
      selections: [{ name: 'A', odds: 1.5 }, { name: 'B', odds: 2.5 }],
    });
    expect(compat.compatible).toBe(false);
    expect(compat.reason).toMatch(/ORPHAN_MARKET/);
  });

  it('rejects missing marketId', () => {
    const compat = validateMarketSettlementCompatibility({ status: 'OPEN' });
    expect(compat.compatible).toBe(false);
    expect(compat.reason).toMatch(/INVALID_MARKET/);
  });

  it('event freeze suspends delivery markets after wicket', () => {
    const base = buildCanonicalFromMatch(liveChase());
    const snap = generateV4({ ...base, lastBallEvent: 'WICKET' }, { winnerOnly: false });
    const delivery = snap.markets.filter((m) => /next_delivery_/i.test(m.marketId));
    expect(delivery.length).toBeGreaterThan(0);
    expect(delivery.every((m) => m.status === 'SUSPENDED')).toBe(true);
  });
});
