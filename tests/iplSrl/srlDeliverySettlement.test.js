import { describe, it, expect } from 'vitest';
import {
  evaluateDeliveryMarketBet,
  evaluateDeliveryMarketBetAsync,
  gradeDeliveryMarketBet,
  resolveSrlDeliveryOutcome,
} from '../../lib/liveMatchSettlement.mjs';
import {
  getIplSrlMatches,
  getIplSrlMatchById,
  getSrlDeliveryBallLabel,
} from '../../lib/iplSrlSimulator.mjs';

describe('SRL next-delivery settlement', () => {
  it('resolves ball labels from the sim timeline', () => {
    const live = getIplSrlMatches().find((m) => m.matchState === 'in') || getIplSrlMatches()[0];
    expect(live?.id).toBeTruthy();
    const label = getSrlDeliveryBallLabel(live.id, 1, 14, 5);
    // Match may still be early in the innings in some timezones — only assert when ball exists.
    if (label != null) {
      expect(String(label).length).toBeGreaterThan(0);
    }
  });

  it('grades next-delivery bets from SRL overHistory when present', () => {
    const live = getIplSrlMatches().find((m) => m.matchState === 'in');
    if (!live) return;
    const m = getIplSrlMatchById(live.id);
    const oh = m?.overHistory || m?.liveDetails?.overHistory || [];
    const over14 = oh.find((r) => Number(r.overNum) === 14);
    if (!over14 || (over14.balls || []).length < 5) return;

    const bet = {
      bet_id: 't1',
      match_id: m.id,
      market_id: 'i1_next_delivery_runs_14_5',
      selection_id: 'sel_del_0',
      selection_name: '0 Runs (Dot)',
    };
    const graded = evaluateDeliveryMarketBet(bet, m);
    expect(graded?.outcome).toMatch(/WON|LOST/);
    expect(graded?.reason).toMatch(/delivery_/);
  });

  it('settles SRL delivery via timeline even when overHistory is stripped', async () => {
    const live = getIplSrlMatches().find((m) => m.matchState === 'in');
    if (!live) return;
    const full = getIplSrlMatchById(live.id);
    const label = getSrlDeliveryBallLabel(live.id, 1, 14, 5);
    if (!label) return; // innings not far enough yet

    const stripped = {
      ...full,
      overHistory: [],
      liveDetails: {
        ...(full.liveDetails || {}),
        overHistory: [],
        currentOverBalls: [],
        // Force "ball passed" by claiming late overs
        firstOvers: '18.0',
        overs: '18.0',
        firstRuns: Number(full.liveDetails?.firstRuns || 100),
        firstWickets: Number(full.liveDetails?.firstWickets || 2),
      },
      source: 'srl',
      matchState: 'in',
      isLive: true,
    };

    const bet = {
      bet_id: 't2',
      match_id: live.id,
      market_id: 'i1_next_delivery_runs_14_5',
      selection_id: 'sel_del_0',
      selection_name: '0 Runs (Dot)',
    };

    const syncNull = evaluateDeliveryMarketBet(bet, stripped);
    expect(syncNull).toBeNull();

    const asyncGraded = await evaluateDeliveryMarketBetAsync(bet, stripped, live.id);
    expect(asyncGraded?.awaitingEvidence).not.toBe(true);
    expect(asyncGraded?.outcome).toMatch(/WON|LOST/);

    const direct = await resolveSrlDeliveryOutcome(live.id, 1, 14, 5);
    const expected = gradeDeliveryMarketBet(bet, direct);
    expect(asyncGraded.outcome).toBe(expected.outcome);
  });
});
