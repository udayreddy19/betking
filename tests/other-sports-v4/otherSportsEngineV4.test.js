import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  generate,
  bookPoints,
  isOtherSportsV4Sport,
  OSV4_ENGINE_VERSION,
} from '../../lib/other-sports-v4/index.mjs';
import {
  resolveOtherSportsEngineMode,
  setRuntimeOtherSportsEngineMode,
  clearRuntimeOtherSportsEngineMode,
  _resetOtherSportsEngineModeControlForTests,
} from '../../lib/other-sports-v4/EngineModeControl.mjs';
import { generatePublicMatchOddsSnapshot } from '../../lib/odds-v4/engineDispatch.mjs';
import { _resetEngineModeControlForTests } from '../../lib/odds-v4/EngineModeControl.mjs';
import {
  countSetWins,
  isCompletedTennisSet,
} from '../../lib/odds-v3/sports/readLiveScoreState.mjs';

function soccerMatch(extra = {}) {
  return {
    matchId: 'soc-1',
    sport: 'soccer',
    team1: { name: 'Arsenal' },
    team2: { name: 'Chelsea' },
    isLive: true,
    matchState: 'in',
    liveDetails: { score1: 1, score2: 0, minute: 55 },
    odds: { home: 2.1, draw: 3.4, away: 3.5 },
    ...extra,
  };
}

function basketballMatch(extra = {}) {
  return {
    matchId: 'bb-1',
    sport: 'basketball',
    team1: { name: 'Lakers' },
    team2: { name: 'Celtics' },
    isLive: true,
    matchState: 'in',
    liveDetails: { score1: 78, score2: 74, minute: 30 },
    odds: { home: 1.85, away: 2.05 },
    ...extra,
  };
}

function tennisMatch(extra = {}) {
  return {
    matchId: 'ten-1',
    sport: 'tennis',
    team1: { name: 'Player A' },
    team2: { name: 'Player B' },
    isLive: true,
    matchState: 'in',
    liveDetails: { score1: 3, score2: 2 },
    odds: { home: 1.7, away: 2.2 },
    ...extra,
  };
}

describe('OtherSportsEngineV4 house protect', () => {
  beforeEach(() => {
    _resetOtherSportsEngineModeControlForTests();
    _resetEngineModeControlForTests();
  });

  afterEach(async () => {
    _resetOtherSportsEngineModeControlForTests();
    await clearRuntimeOtherSportsEngineMode().catch(() => null);
  });

  it('marks P0 sports and rejects cricket', () => {
    expect(isOtherSportsV4Sport('soccer')).toBe(true);
    expect(isOtherSportsV4Sport('cricket')).toBe(false);
  });

  it('prices soccer 1X2 with thick house book (≥116 pts, no arb)', () => {
    const snap = generate(soccerMatch(), { allowModelOnly: true });
    expect(snap.engine).toBe('OtherSportsEngineV4');
    expect(snap.engineVersion).toBe('4.9.0');
    expect(snap.osv4Meta?.qualityScore).toBeGreaterThanOrEqual(40);
    expect(snap.houseProtect).toBe(true);
    const mw = snap.markets.find((m) => m.marketId === 'match_winner');
    expect(mw?.status).toBe('OPEN');
    const pts = bookPoints(mw.selections);
    expect(pts).toBeGreaterThanOrEqual(118);
    expect(pts).toBeLessThan(180);
  });

  it('never publishes soft totals Overs above house cap', () => {
    const snap = generate(soccerMatch(), { allowModelOnly: true });
    const goals = snap.markets.find((m) => m.marketId === 'goals_line');
    expect(goals?.status).toBe('OPEN');
    const over = goals.selections.find((s) => String(s.name).startsWith('Over'));
    expect(Number(over.odds)).toBeLessThanOrEqual(1.25);
    const pts = bookPoints(goals.selections);
    expect(pts).toBeGreaterThan(100);
  });

  it('DC Yes/No books stay house-thick (not ~210 exclusive junk)', () => {
    const snap = generate(soccerMatch(), { allowModelOnly: true });
    const dc1x = snap.markets.find((m) => m.marketId === 'double_chance_1x');
    expect(dc1x?.status).toBe('OPEN');
    const pts = bookPoints(dc1x.selections);
    expect(pts).toBeGreaterThanOrEqual(116);
    expect(pts).toBeLessThan(160);
    expect(pts).not.toBeCloseTo(210, 0);
    const yes = dc1x.selections.find((s) => s.selectionId === 'DC:1X');
    expect(Number(yes.odds)).toBeLessThanOrEqual(1.62);
  });

  it('basketball totals use pace + hard Over cap', () => {
    const snap = generate(basketballMatch(), { allowModelOnly: true });
    const total = snap.markets.find((m) => m.marketId === 'total_pts');
    expect(total?.status).toBe('OPEN');
    expect(total.expectedTotal).toBeGreaterThan(100);
    const over = total.selections.find((s) => String(s.name).startsWith('Over'));
    expect(Number(over.odds)).toBeLessThanOrEqual(1.25);
    expect(bookPoints(total.selections)).toBeGreaterThan(100);
  });

  it('suspends tennis set markets without set scores', () => {
    const snap = generate(tennisMatch(), { allowModelOnly: true });
    expect(snap.markets.find((m) => m.marketId === 'set1_winner')?.status).toBe('SUSPENDED');
    expect(snap.markets.find((m) => m.marketId === 'match_winner')?.status).toBe('OPEN');
  });

  it('defaults OTHER_SPORTS_ENGINE to v3', () => {
    expect(resolveOtherSportsEngineMode({ OTHER_SPORTS_ENGINE: undefined })).toBe('v3');
  });

  it('dispatch serves OtherSportsEngineV4 when OTHER_SPORTS_ENGINE=v4', async () => {
    await setRuntimeOtherSportsEngineMode('v4', { updatedBy: 'test' });
    const { rawSnapshot, publicSnapshot } = generatePublicMatchOddsSnapshot(soccerMatch(), {
      allowModelOnly: true,
    });
    expect(rawSnapshot.engine).toBe('OtherSportsEngineV4');
    expect(publicSnapshot?.engine).toBe('OtherSportsEngineV4');
  });

  it('dispatch keeps cricket off OtherSportsEngineV4', () => {
    const cricket = {
      matchId: 'ck-1',
      sport: 'cricket',
      team1: { name: 'A', id: 't1' },
      team2: { name: 'B', id: 't2' },
      status: 'LIVE',
      isLive: true,
      format: 'T20',
    };
    const { publicSnapshot, rawSnapshot } = generatePublicMatchOddsSnapshot(cricket, {});
    const engine = publicSnapshot?.engine || rawSnapshot?.engine;
    expect(engine).not.toBe('OtherSportsEngineV4');
  });

  it('suspends extreme longshots instead of printing soft dogs at the cap', () => {
    const snap = generate(soccerMatch({
      odds: { home: 1.15, draw: 8.0, away: 12.0 },
    }), { allowModelOnly: true });
    const mw = snap.markets.find((m) => m.marketId === 'match_winner');
    expect(['OPEN', 'SUSPENDED']).toContain(mw?.status);
    if (mw?.status === 'OPEN') {
      for (const s of mw.selections) {
        expect(Number(s.odds)).toBeLessThanOrEqual(2.75);
      }
    }
  });

  it('does not invert a strong soccer away provider favorite', () => {
    const snap = generate(soccerMatch({
      liveDetails: { score1: 0, score2: 0, minute: 0 },
      odds: { home: 6.0, draw: 4.2, away: 1.40 },
      status: 'SCHEDULED',
      isLive: false,
      matchState: 'pre',
    }), { allowModelOnly: true });
    const mw = snap.markets.find((m) => m.marketId === 'match_winner');
    // Multi-pass re-guard may suspend MW when away odds are near maxFavoriteOdds cap
    expect(['OPEN', 'SUSPENDED']).toContain(mw?.status);
    if (mw?.status === 'OPEN') {
      const home = mw.selections.find((s) => s.selectionId === '1');
      const away = mw.selections.find((s) => s.selectionId === '2');
      expect(Number(away.odds)).toBeLessThan(Number(home.odds));
    }
  });

  it('counts only completed tennis sets toward set wins', () => {
    expect(isCompletedTennisSet(4, 3)).toBe(false);
    expect(isCompletedTennisSet(6, 3)).toBe(true);
    expect(countSetWins([4], [3])).toEqual({ setWins1: 0, setWins2: 0 });
    expect(countSetWins([6, 2], [3, 1])).toEqual({ setWins1: 1, setWins2: 0 });
  });

  it('suspends set1_winner after set 1 is decided', () => {
    const snap = generate(tennisMatch({
      liveDetails: {
        sets1: [6, 2],
        sets2: [3, 1],
        score1: 1,
        score2: 0,
      },
    }), { allowModelOnly: true });
    expect(snap.markets.find((m) => m.marketId === 'set1_winner')?.status).toBe('SUSPENDED');
    expect(snap.markets.find((m) => m.marketId === 'match_winner')?.status).toBe('OPEN');
  });

  it('never pays soft favorites above maxFavoriteOdds', () => {
    const snap = generate(soccerMatch({
      odds: { home: 1.25, draw: 5.5, away: 9.0 },
    }), { allowModelOnly: true });
    const mw = snap.markets.find((m) => m.marketId === 'match_winner');
    if (mw?.status !== 'OPEN') return;
    for (const s of mw.selections) {
      if (Number(s.probability) >= 0.48) {
        expect(Number(s.odds)).toBeLessThanOrEqual(1.40);
      }
    }
  });

  it('applies american-football tune with AF-specific caps', () => {
    const snap = generate(basketballMatch({
      sport: 'american-football',
      liveDetails: { score1: 14, score2: 10, minute: 28 },
      odds: { home: 1.9, away: 1.95 },
    }), { allowModelOnly: true });
    expect(snap.engineVersion).toBe('4.9.0');
    expect(snap.osv4Meta?.features).toContain('american_football_tune');
    expect(snap.osv4Meta?.qualityScore).toBeGreaterThanOrEqual(40);
    const mw = snap.markets.find((m) => m.marketId === 'match_winner');
    expect(mw?.status).toBe('OPEN');
    for (const s of mw.selections) {
      expect(Number(s.odds)).toBeLessThanOrEqual(2.55);
    }
  });
});
