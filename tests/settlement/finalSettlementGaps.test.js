import { describe, it, expect } from 'vitest';
import {
  assertValidTransition,
  isTerminalBetStatus,
  TERMINAL_BET_STATUSES,
} from '../../lib/betStateMachine.mjs';
import { enrichMatchWithCanonicalState, hasFinalResultWithoutBallFeed } from '../../lib/settlement/settlementCanonicalState.mjs';
import { sendToUser } from '../../lib/websocketEngine.mjs';

describe('bet state machine', () => {
  it('rejects illegal terminal transitions', () => {
    expect(() => assertValidTransition('WON', 'LOST')).toThrow(/INVALID_STATE_TRANSITION/);
    expect(() => assertValidTransition('CASHED_OUT', 'WON')).toThrow(/INVALID_STATE_TRANSITION/);
    expect(() => assertValidTransition('VOID', 'WON')).toThrow(/INVALID_STATE_TRANSITION/);
  });

  it('allows ACCEPTED → WON', () => {
    expect(assertValidTransition('ACCEPTED', 'WON')).toBe(true);
  });

  it('terminal statuses are closed', () => {
    for (const s of ['WON', 'LOST', 'VOID', 'CASHED_OUT', 'REFUNDED']) {
      expect(isTerminalBetStatus(s)).toBe(true);
      expect(TERMINAL_BET_STATUSES.has(s)).toBe(true);
    }
  });
});

describe('canonical match state for settlement', () => {
  it('enriches match with canonicalState from provider blob', () => {
    const match = {
      id: 'oy_test',
      sport: 'cricket',
      matchType: 'T20',
      team1: { name: 'A', runs: 120, wickets: 5, overs: '20.0' },
      team2: { name: 'B', runs: 100, wickets: 10, overs: '18.2' },
      liveDetails: { inningsId: 2, chaseRuns: 100, chaseOvers: '18.2' },
      status: 'COMPLETED',
    };
    const enriched = enrichMatchWithCanonicalState(match);
    expect(enriched.canonicalState).toBeTruthy();
  });

  it('detects 10Cric final without ball feed', () => {
    const match = {
      id: 'oy_999',
      source: '10cric',
      sport: 'cricket',
      matchState: 'post',
      status: 'COMPLETED',
      team1: { name: 'A', runs: 150 },
      team2: { name: 'B', runs: 140 },
      liveDetails: {},
    };
    expect(hasFinalResultWithoutBallFeed(enrichMatchWithCanonicalState(match))).toBe(true);
  });
});

describe('websocket BET_SETTLED delivery', () => {
  it('sendToUser returns safely when no subscribers', () => {
    const res = sendToUser('usr_nobody_ws', 'BET_SETTLED', {
      betId: 'b_test',
      userId: 'usr_nobody_ws',
      status: 'WON',
      payout: 100,
      eventId: 'evt_test_1',
    });
    expect(res.sent).toBe(0);
  });
});
