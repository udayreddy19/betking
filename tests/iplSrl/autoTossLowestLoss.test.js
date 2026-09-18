import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  getIplSrlMatches,
  SRL_TOSS_PUBLIC_LEAD_MS,
} from '../../lib/iplSrlSimulator.mjs';
import { resetAllSrlOperatorSessions, getSrlOperatorSession } from '../../lib/iplSrlOperatorState.mjs';
import {
  pickLowestLossSrlTossOutcome,
  scoreSrlTossHousePnl,
  srlTossWinningSelections,
  autoLockLowestLossSrlToss,
} from '../../lib/iplSrlAdminControl.mjs';

describe('SRL auto toss — lowest house loss', () => {
  beforeEach(() => resetAllSrlOperatorSessions());
  afterEach(() => resetAllSrlOperatorSessions());

  it('scores house PnL as stake minus winning selection payout', () => {
    const winners = srlTossWinningSelections('t1', 't2', 't2', 'BOWL');
    const rows = [
      { market_id: 'toss_winner', selection_id: 'sel_t2', stake: 100, payout: 180 },
      { market_id: 'toss_winner', selection_id: 'sel_t1', stake: 50, payout: 90 },
      { market_id: 'toss_and_bowl', selection_id: 'toss_and_bowl_yes', stake: 40, payout: 70 },
      { market_id: 'match_winner', selection_id: 'sel_t1', stake: 999, payout: 2000 },
    ];
    // toss stake 190 − win payouts 180+70 = −60
    expect(scoreSrlTossHousePnl(rows, winners)).toBe(190 - 250);
  });

  it('picks the outcome that maximizes house retention', () => {
    const stakeRows = [
      // Heavy book on t1 winning toss + batting
      { market_id: 'toss_winner', selection_id: 'sel_t1', stake: 200, payout: 360 },
      { market_id: 'toss_winner', selection_id: 'sel_t2', stake: 20, payout: 40 },
      { market_id: 'toss_and_bat', selection_id: 'toss_and_bat_yes', stake: 100, payout: 180 },
      { market_id: 'toss_and_bat', selection_id: 'toss_and_bat_no', stake: 10, payout: 20 },
      { market_id: 'team_bat_first', selection_id: 'sel_t1', stake: 80, payout: 140 },
      { market_id: 'team_bat_first', selection_id: 'sel_t2', stake: 15, payout: 30 },
    ];
    const pick = pickLowestLossSrlTossOutcome({
      team1Key: 't1',
      team2Key: 't2',
      stakeRows,
      preferredWinnerKey: 't1',
      preferredDecision: 'BAT',
    });
    // Avoiding the heavy t1+BAT legs → t2 BOWL keeps the most stake.
    expect(pick.winnerKey).toBe('t2');
    expect(pick.decision).toBe('BOWL');
    expect(pick.housePnl).toBeGreaterThan(
      scoreSrlTossHousePnl(stakeRows, srlTossWinningSelections('t1', 't2', 't1', 'BAT')),
    );
  });

  it('ties fall back to preferred soft-save then BAT / team1', () => {
    const pick = pickLowestLossSrlTossOutcome({
      team1Key: 'alpha',
      team2Key: 'beta',
      stakeRows: [],
      preferredWinnerKey: 'beta',
      preferredDecision: 'BOWL',
    });
    expect(pick.winnerKey).toBe('beta');
    expect(pick.decision).toBe('BOWL');
    expect(pick.housePnl).toBe(0);
  });

  it('auto-locks at T-25 when admin never locked toss', async () => {
    const now = Date.now();
    const listed = getIplSrlMatches(now);
    const near = listed.find((m) => {
      const ms = Number(m.startTime) - now;
      return (m.matchState === 'pre' || m.matchState === 'in')
        && Number.isFinite(ms)
        && ms <= SRL_TOSS_PUBLIC_LEAD_MS;
    }) || listed.find((m) => m.matchState === 'pre') || listed[0];
    expect(near?.id).toBeTruthy();

    const atReveal = Number(near.startTime) - SRL_TOSS_PUBLIC_LEAD_MS + 5_000;
    expect(getSrlOperatorSession(near.id).toss?.locked).toBeFalsy();

    const res = await autoLockLowestLossSrlToss(near.id, 'SYSTEM', 'SUPER_ADMIN', atReveal);
    expect(res.success).toBe(true);
    expect(res.autoPicked).toBe(true);
    expect(res.toss?.locked).toBe(true);
    expect(res.toss?.autoPicked).toBe(true);
    expect(res.toss?.autoPickReason).toBe('lowest_house_loss');
    expect([near.team1?.key, near.team2?.key]).toContain(res.toss?.tossWinnerKey);
  });
});
