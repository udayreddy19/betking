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
  getIPLSRLMatchMarkets,
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

  it('applies mid-over SIX inject anchors before the over completes', async () => {
    const { applySrlScoreAnchors } = await import('../../lib/iplSrlSimulator.mjs');
    const sim = {
      first: {
        timeline: Array.from({ length: 120 }, (_, i) => ({
          runs: i + 1,
          wickets: 0,
          overs: `${Math.floor((i + 1) / 6)}.${(i + 1) % 6}`,
        })),
      },
      second: { timeline: [] },
    };
    // After 5 balls (0.5 ov), natural score is 5; SIX inject wants 4 (pre) + 6 = 10.
    const live = {
      inningsId: 1,
      phase: 'first',
      firstTeamName: 'Rajasthan Royals',
      runs: 5,
      firstRuns: 5,
      firstWickets: 0,
      firstOvers: '0.5',
      overs: '0.5',
      wickets: 0,
    };
    const next = applySrlScoreAnchors(live, sim, [{
      innings: 1,
      atOver: 0.5,
      ballIndex: 4,
      runs: 10,
      naturalRunsAtAnchor: 5,
      source: 'incident',
      applyNow: true,
    }]);
    expect(next.firstRuns).toBe(10);
    expect(next.runs).toBe(10);
  });

  it('forces wicket count on incident anchors', async () => {
    const { applySrlScoreAnchors } = await import('../../lib/iplSrlSimulator.mjs');
    const sim = {
      first: {
        timeline: Array.from({ length: 30 }, (_, i) => ({
          runs: i,
          wickets: 0,
          overs: `${Math.floor((i + 1) / 6)}.${(i + 1) % 6}`,
        })),
      },
      second: { timeline: [] },
    };
    const live = {
      inningsId: 1,
      phase: 'first',
      runs: 12,
      firstRuns: 12,
      firstWickets: 0,
      wickets: 0,
      firstOvers: '2.0',
      overs: '2.0',
    };
    const next = applySrlScoreAnchors(live, sim, [{
      innings: 1,
      atOver: 2.0,
      ballIndex: 11,
      runs: 12,
      wickets: 1,
      naturalRunsAtAnchor: 12,
      naturalWicketsAtAnchor: 0,
      applyNow: true,
      source: 'incident',
    }]);
    expect(next.firstRuns).toBe(12);
    expect(next.firstWickets).toBe(1);
    expect(next.wickets).toBe(1);
  });

  it('match markets desk exposes toss + full V4 user book for control', async () => {
    const match = getIplSrlSeasonMatches(SRL_LAUNCH_AT)[0];
    const desk = await getIPLSRLMatchMarkets(match.id);
    expect(desk.engine).toBe('OddsEngineV4');
    expect(desk.marketCount).toBeGreaterThanOrEqual(20);
    const ids = desk.markets.map((m) => m.marketId);
    expect(ids).toContain('toss_winner');
    expect(ids).toContain('toss_and_bat');
    expect(ids).toContain('toss_and_bowl');
    expect(ids).toContain('team_bat_first');
    expect(ids).toContain('match_winner');
    expect(ids).toContain('match_total');
    expect(desk.tossMarkets?.length).toBeGreaterThanOrEqual(4);
    expect(ids.slice(0, 4)).toEqual([
      'toss_winner',
      'toss_and_bat',
      'toss_and_bowl',
      'team_bat_first',
    ]);
  });

  it('operator toss remaps which side bats first on the live board', async () => {
    const { executeIPLSRLToss, startIPLSRLControlledMatch } = await import('../../lib/iplSrlAdminControl.mjs');
    const { setSrlTossAndLineup } = await import('../../lib/iplSrlOperatorState.mjs');
    const { resolveSrlBatFirstTeams } = await import('../../lib/iplSrlSimulator.mjs');

    jumpIPLSRLSeason({ matchNo: 1, at: 'live' }, 'test');
    const snap = getIPLSRLControlSnapshot();
    const match = snap.matches.find((m) => m.matchNo === 1) || snap.matches[0];
    const awayKey = match.awayTeamId;
    executeIPLSRLToss(match.matchId, { winnerTeamId: awayKey, decision: 'BAT' }, 'test');
    startIPLSRLControlledMatch(match.matchId, { admin: 'test' });

    const live = getIplSrlMatchById(match.matchId);
    expect(live.liveDetails?.firstTeamName).toBe(match.awayTeam);
    expect(live.toss?.tossWinnerKey || live.liveDetails?.toss?.tossWinnerKey).toBe(awayKey);

    const team1 = { key: 'csk', name: 'Chennai Super Kings', shortName: 'CSK' };
    const team2 = { key: 'mi', name: 'Mumbai Indians', shortName: 'MI' };
    const resolved = resolveSrlBatFirstTeams(team1, team2, null, { winner: 'mi', decision: 'BOWL' });
    expect(resolved.batFirst.key).toBe('csk');
    expect(resolved.chase.key).toBe('mi');
    setSrlTossAndLineup(match.matchId, { tossWinnerKey: awayKey, tossDecision: 'BAT' });
  });

  it('undo last inject and clear anchors restore natural board control', async () => {
    const {
      injectIPLSRLIncident,
      undoIPLSRLLastInject,
      clearIPLSRLScoreAnchors,
      startIPLSRLControlledMatch,
    } = await import('../../lib/iplSrlAdminControl.mjs');
    const { getSrlScoreAnchors } = await import('../../lib/iplSrlOperatorState.mjs');

    jumpIPLSRLSeason({ matchNo: 2, at: 'live' }, 'test');
    const snap = getIPLSRLControlSnapshot();
    const match = snap.matches.find((m) => m.matchNo === 2) || snap.matches[0];
    startIPLSRLControlledMatch(match.matchId, { admin: 'test' });
    injectIPLSRLIncident(match.matchId, { type: 'SIX', instant: true }, 'test');
    expect(getSrlScoreAnchors(match.matchId).length).toBeGreaterThan(0);
    const undone = undoIPLSRLLastInject(match.matchId, 'test');
    expect(undone.success).toBe(true);
    injectIPLSRLIncident(match.matchId, { type: 'FOUR', instant: true }, 'test');
    injectIPLSRLIncident(match.matchId, { type: 'DOT', instant: true }, 'test');
    const cleared = clearIPLSRLScoreAnchors(match.matchId, 'test');
    expect(cleared.cleared).toBeGreaterThan(0);
    expect(getSrlScoreAnchors(match.matchId)).toHaveLength(0);
  });
});
