import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isMatchBettable } from '../../src/utils/matchBetting.js';
import {
  getIplSrlMatchById,
  getIplSrlSeasonMatches,
} from '../../lib/iplSrlSimulator.mjs';
import {
  resetAllSrlOperatorSessions,
  setSrlOperatorBettingClosed,
} from '../../lib/iplSrlOperatorState.mjs';
import {
  applySrlStakeRows,
  getIPLSRLControlSnapshot,
  jumpIPLSRLSeason,
  resetIPLSRLSeasonClock,
  setIPLSRLBettingClosed,
} from '../../lib/iplSrlAdminControl.mjs';
import { SRL_LAUNCH_AT } from '../../lib/oddsyraSrlSeason.mjs';

describe('OddsYra SRL operator controls', () => {
  beforeEach(() => {
    resetAllSrlOperatorSessions();
  });

  afterEach(() => {
    resetAllSrlOperatorSessions();
  });

  it('closes betting on a match for users and placement', () => {
    const match = getIplSrlSeasonMatches(SRL_LAUNCH_AT)[0];
    expect(isMatchBettable(match)).toBe(true);
    setSrlOperatorBettingClosed(match.id, true);
    const closed = getIplSrlMatchById(match.id, SRL_LAUNCH_AT);
    expect(closed.bettingClosed).toBe(true);
    expect(isMatchBettable(closed)).toBe(false);
    const snap = setIPLSRLBettingClosed(match.id, true, 'test');
    expect(snap.matches.find((m) => m.matchId === match.id).bettingClosed).toBe(true);
  });

  it('jumps the season clock to a league match in play', () => {
    const before = getIplSrlSeasonMatches(SRL_LAUNCH_AT - 60_000);
    expect(before.every((m) => m.matchState === 'pre')).toBe(true);

    const snap = jumpIPLSRLSeason({ matchNo: 12, at: 'live' }, 'test');
    expect(snap.seasonClock.jumped).toBe(true);
    expect(snap.seasonClock.matchNo).toBe(12);
    const live = snap.matches.find((m) => m.matchId === snap.seasonClock.matchId);
    expect(live.controlStatus).toBe('LIVE');
    expect(live.matchNo).toBe(12);

    const reset = resetIPLSRLSeasonClock('test');
    expect(reset.seasonClock.jumped).toBe(false);
  });

  it('previews house result from open stakes when declaring', () => {
    const [row] = applySrlStakeRows([{
      matchId: 'srl_ipl_0',
      homeTeamId: 'csk',
      homeShort: 'CSK',
      homeTeam: 'CSK',
      awayTeamId: 'mi',
      awayShort: 'MI',
      awayTeam: 'MI',
    }], [
      { match_id: 'srl_ipl_0', selection_id: 'csk', stake: 1000, payout: 1800, bets: 2 },
      { match_id: 'srl_ipl_0', selection_id: 'mi', stake: 400, payout: 900, bets: 1 },
    ]);
    expect(row.book.home.payout).toBe(1800);
    expect(row.book.totalStake - row.book.home.payout).toBe(-400);
  });

  it('matches selection ids with and without sel_ prefix', async () => {
    const { sameSrlSelectionId } = await import('../../lib/iplSrlAdminControl.mjs');
    expect(sameSrlSelectionId('sel_csk', 'csk')).toBe(true);
    expect(sameSrlSelectionId('1', '1')).toBe(true);
    expect(sameSrlSelectionId('sel_mi', 'sel_csk')).toBe(false);
  });

  it('maps Over/Under lines to scoreboard targets for overs markets', async () => {
    const {
      parseSrlOversTotalMarketId,
      targetRunsForOuDeclare,
    } = await import('../../lib/iplSrlAdminControl.mjs');
    expect(parseSrlOversTotalMarketId('i1_overs_0_10_total')).toEqual({
      innings: 1,
      targetOver: 10,
    });
    expect(targetRunsForOuDeclare('over', 88.5)).toBe(89);
    expect(targetRunsForOuDeclare('under', 88.5)).toBe(88);
  });

  it('rebases live score from a declare anchor at 10 overs', async () => {
    const { applySrlScoreAnchors } = await import('../../lib/iplSrlSimulator.mjs');
    const sim = {
      first: {
        timeline: Array.from({ length: 120 }, (_, i) => ({
          runs: Math.floor(i * 1.4),
          wickets: 0,
          overs: `${Math.floor(i / 6)}.${i % 6}`,
        })),
      },
      second: { timeline: [] },
    };
    const naturalAt10 = sim.first.timeline[59].runs;
    const live = {
      inningsId: 1,
      phase: 'first',
      firstTeamName: 'Gujarat Titans',
      runs: naturalAt10,
      firstRuns: naturalAt10,
      firstWickets: 1,
      firstOvers: '10.0',
      overs: '10.0',
      wickets: 1,
    };
    const next = applySrlScoreAnchors(live, sim, [{
      innings: 1,
      atOver: 10,
      ballIndex: 59,
      runs: 89,
      naturalRunsAtAnchor: naturalAt10,
    }]);
    expect(next.firstRuns).toBe(89);
    expect(next.runs).toBe(89);
  });
});
