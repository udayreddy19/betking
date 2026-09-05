import { describe, it, expect, beforeEach } from 'vitest';
import { buildCanonicalFromMatch } from '../../lib/odds-v3/buildCanonicalFromMatch.mjs';
import { generate as generateV3 } from '../../lib/odds-v3/OddsEngineV3.mjs';
import { generate as generateV4 } from '../../lib/odds-v4/OddsEngineV4.mjs';
import { chaseWinProbability } from '../../lib/odds-v4/models/WinExpectancyEngine.mjs';
import { pOverChaseTeamTotal } from '../../lib/odds-v4/chaseTotalCaps.mjs';
import {
  resolveOddsEngineMode,
  setRuntimeEngineMode,
  clearRuntimeEngineMode,
  _resetEngineModeControlForTests,
} from '../../lib/odds-v4/EngineModeControl.mjs';

function chaseMatch() {
  return {
    id: 'v4_chase_1',
    sport: 'cricket',
    status: 'LIVE',
    isLive: true,
    matchState: 'in',
    matchType: 'T20',
    team1: { name: 'Alpha', id: 'a' },
    team2: { name: 'Beta', id: 'b' },
    liveDetails: {
      firstRuns: 165,
      firstWickets: 7,
      firstOvers: '20.0',
      chaseRuns: 90,
      chaseWickets: 2,
      chaseOvers: '12.0',
      battingTeam: 'Beta',
      innings: 2,
      batter1: { name: 'Bat One', runs: 40, balls: 28 },
      batter2: { name: 'Bat Two', runs: 20, balls: 18 },
    },
  };
}

describe('OddsEngineV4 — resource MW + V3 catalog', () => {
  beforeEach(() => {
    delete process.env.ODDS_ENGINE;
    _resetEngineModeControlForTests();
  });

  it('prices chase with resource table (not silent 1.90/1.90)', () => {
    const state = buildCanonicalFromMatch(chaseMatch());
    const snap = generateV4(state, { winnerOnly: true });
    expect(snap.engine).toBe('OddsEngineV4');
    const mw = snap.markets.find((m) => m.marketId === 'match_winner');
    expect(mw?.status).toBe('OPEN');
    const o1 = Number(mw.selections[0].odds);
    const o2 = Number(mw.selections[1].odds);
    expect(!(o1 === 1.9 && o2 === 1.9)).toBe(true);
    const implied = 1 / o1 + 1 / o2;
    expect(implied).toBeGreaterThan(1.12);
  });

  it('publishes a tighter house book than V3 (higher MW overround + shorter soft Overs)', () => {
    const state = buildCanonicalFromMatch(chaseMatch());
    const v3 = generateV3(state, { winnerOnly: true });
    const v4 = generateV4(state, { winnerOnly: true });
    const mw3 = v3.markets.find((m) => m.marketId === 'match_winner');
    const mw4 = v4.markets.find((m) => m.marketId === 'match_winner');
    const implied3 = mw3.selections.reduce((s, x) => s + 1 / Number(x.odds), 0);
    const implied4 = mw4.selections.reduce((s, x) => s + 1 / Number(x.odds), 0);
    expect(implied4).toBeGreaterThan(implied3);
    expect(implied4).toBeGreaterThanOrEqual(1.13);

    const full = generateV4(state, { winnerOnly: false });
    const overs = full.markets.flatMap((m) => m.selections || []).filter((s) => String(s.name).toLowerCase() === 'over');
    expect(overs.length).toBeGreaterThan(0);
    // Soft Overs capped; correctly long chase Overs may exceed 1.45
    const softOvers = overs.filter((s) => Number(s.probability) >= 0.42);
    if (softOvers.length) {
      expect(Math.max(...softOvers.map((s) => Number(s.odds)))).toBeLessThanOrEqual(1.45);
    }
  });

  it('resource chase favors field when asking rate is extreme', () => {
    const hard = chaseWinProbability({
      runsRequired: 80,
      ballsRemaining: 12,
      wicketsRemaining: 2,
      ballsPerInnings: 120,
      format: 'T20',
    });
    expect(hard.pChase).toBeLessThan(0.25);
    expect(hard.method).toBe('resource_table');
  });

  it('full book keeps compact V3 market families', () => {
    const state = buildCanonicalFromMatch(chaseMatch());
    const snap = generateV4(state, { winnerOnly: false });
    expect(snap.engine).toBe('OddsEngineV4');
    const ids = snap.markets.map((m) => m.marketId);
    expect(ids).toContain('match_winner');
    expect(ids).toContain('match_winner_super_over');
    expect(ids.some((id) => id === 'team_total' || id === 'match_total')).toBe(true);
  });

  it('offers a richer book than V3 compact (unlocks odd_even / boundaries / H2H families when generated)', () => {
    const state = buildCanonicalFromMatch(chaseMatch());
    const v3 = generateV3(state, { winnerOnly: false });
    const v4 = generateV4(state, { winnerOnly: false });
    expect(v4.markets.length).toBeGreaterThan(v3.markets.length);
    const ids = v4.markets.map((m) => m.marketId);
    const unlocked = ids.some((id) =>
      /odd_even|most_sixes|most_fours|team_total_fours|team_total_sixes|total_match_|method_of_next|top_batter|batter_h2h|will_there_be_a_tie|double_chance|player_75_|team_total_ladder|match_total_ladder|next_delivery_four|player_alt_/i.test(id)
    );
    expect(unlocked).toBe(true);
  });

  it('emits team/match ladders and delivery yes-no extras', () => {
    const state = buildCanonicalFromMatch(chaseMatch());
    const v4 = generateV4(state, { winnerOnly: false });
    const ids = v4.markets.map((m) => m.marketId);
    expect(ids.some((id) => /team_total_ladder_/i.test(id))).toBe(true);
    expect(ids.some((id) => /match_total_ladder_/i.test(id))).toBe(true);
    expect(ids.some((id) => /player_alt_/i.test(id))).toBe(true);
  });

  it('catalog market count is at least V3 compact size', () => {
    const state = buildCanonicalFromMatch(chaseMatch());
    const v3 = generateV3(state, { winnerOnly: false });
    const v4 = generateV4(state, { winnerOnly: false });
    expect(v4.markets.length).toBeGreaterThanOrEqual(v3.markets.length);
  });

  it('admin toggle overrides env to v4', async () => {
    process.env.ODDS_ENGINE = 'v3';
    await setRuntimeEngineMode('v4', { updatedBy: 'test' });
    expect(resolveOddsEngineMode()).toBe('v4');
    await clearRuntimeEngineMode({ updatedBy: 'test' });
    expect(resolveOddsEngineMode()).toBe('v3');
  });

  it('chase near target: team/match Overs above target are long (Under short)', () => {
    // MUT 187 all out → target 188; IAI 186/4 need 2 — Over 190.5 must not be soft.
    const match = {
      id: 'v4_chase_cap',
      sport: 'cricket',
      status: 'LIVE',
      isLive: true,
      matchState: 'in',
      matchType: 'ODI',
      team1: { name: 'Muscat Thunders', id: 'mut' },
      team2: { name: 'IAS Invincibles', id: 'iai' },
      liveDetails: {
        firstRuns: 187,
        firstWickets: 10,
        firstOvers: '50.0',
        chaseRuns: 186,
        chaseWickets: 4,
        chaseOvers: '36.0',
        battingTeam: 'IAS Invincibles',
        innings: 2,
        batter1: { name: 'Bat One', runs: 40, balls: 30 },
        batter2: { name: 'Bat Two', runs: 20, balls: 15 },
      },
    };
    const state = buildCanonicalFromMatch(match);
    expect(state.target).toBe(188);
    expect(state.runsRequired).toBe(2);

    const p190 = pOverChaseTeamTotal({
      line: 190.5,
      currentScore: 186,
      runsRequired: 2,
      target: 188,
    });
    expect(p190).toBeLessThan(0.12);

    const v4 = generateV4(state, { winnerOnly: false });
    expect(v4.engineVersion).toBe('4.2.0');
    expect(v4.v4Meta?.features?.length).toBeGreaterThan(0);
    // Near-target books are intentionally thinner; full 100 score is asserted on mid-chase.
    const teamTotal = v4.markets.find((m) => m.marketId === 'team_total');
    expect(teamTotal?.status).toBe('OPEN');
    const over = teamTotal.selections.find((s) => String(s.name).toLowerCase().startsWith('over'));
    const under = teamTotal.selections.find((s) => String(s.name).toLowerCase().startsWith('under'));
    const line = Number(teamTotal.line);
    if (line >= 189.5) {
      expect(Number(under.odds)).toBeLessThan(Number(over.odds));
      expect(Number(under.odds)).toBeLessThan(1.35);
      expect(Number(over.odds)).toBeGreaterThan(2.4);
    }

    const matchTotal = v4.markets.find((m) => m.marketId === 'match_total');
    if (matchTotal?.status === 'OPEN') {
      const mOver = matchTotal.selections.find((s) => String(s.name).toLowerCase().startsWith('over'));
      const mUnder = matchTotal.selections.find((s) => String(s.name).toLowerCase().startsWith('under'));
      const mLine = Number(matchTotal.line);
      if (mLine >= 187 + 189.5) {
        expect(Number(mUnder.odds)).toBeLessThan(Number(mOver.odds));
        expect(Number(mUnder.odds)).toBeLessThan(1.35);
      }
    }
  });

  it('freezes delivery markets after a wicket event', () => {
    const base = buildCanonicalFromMatch(chaseMatch());
    const state = { ...base, lastBallEvent: 'WICKET' };
    const v4 = generateV4(state, { winnerOnly: false });
    const delivery = v4.markets.filter((m) => /next_delivery_/i.test(m.marketId));
    expect(delivery.length).toBeGreaterThan(0);
    expect(delivery.every((m) => m.status === 'SUSPENDED')).toBe(true);
  });

  it('exposes feature markets (next-over OE or forward overs / dismissal+1)', () => {
    const state = buildCanonicalFromMatch(chaseMatch());
    const v4 = generateV4(state, { winnerOnly: false });
    const ids = v4.markets.map((m) => m.marketId);
    const hasFeature = ids.some((id) =>
      /next_over_\d+_odd_even|overs_0_\d+_total|team_score_at_\d+_dismissal/i.test(id)
    );
    expect(hasFeature).toBe(true);
    expect(v4.v4Meta?.phase).toBeTruthy();
  });

  it('scores a full live book at 100/100 on the readiness rubric', () => {
    const state = buildCanonicalFromMatch(chaseMatch());
    const v4 = generateV4(state, { winnerOnly: false });
    expect(v4.engineVersion).toBe('4.2.0');
    expect(v4.v4Meta.qualityScore).toBe(100);
    expect(v4.v4Meta.qualityBreakdown.matchWinner).toBe(20);
    expect(v4.v4Meta.qualityBreakdown.houseEdge).toBe(20);
    expect(v4.v4Meta.qualityBreakdown.ops).toBe(5);
  });
});
