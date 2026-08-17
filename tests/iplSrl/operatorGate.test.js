import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getIplSrlMatchById,
  getIplSrlMatches,
} from '../../lib/iplSrlSimulator.mjs';
import {
  declareSrlOperatorWinner,
  resetAllSrlOperatorSessions,
  setSrlOperatorWinner,
  startSrlOperatorMatch,
} from '../../lib/iplSrlOperatorState.mjs';
import {
  declareIPLSRLWinner,
  getIPLSRLControlSnapshot,
  setIPLSRLForcedWinner,
  startIPLSRLControlledMatch,
} from '../../lib/iplSrlAdminControl.mjs';

describe('IPL SRL operator gate', () => {
  beforeEach(() => {
    resetAllSrlOperatorSessions();
  });

  afterEach(() => {
    resetAllSrlOperatorSessions();
  });

  it('keeps user-facing matches upcoming until an operator starts them', () => {
    const now = Date.now();
    const listed = getIplSrlMatches(now);
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((m) => m.matchState === 'pre' && m.isLive === false)).toBe(true);

    const id = listed[0].id;
    startSrlOperatorMatch(id, now);
    const live = getIplSrlMatchById(id, now + 90_000);
    expect(live.matchState).toBe('in');
    expect(live.isLive).toBe(true);
  });

  it('lets the operator script a winner while live and declare it immediately', () => {
    const now = Date.now();
    const match = getIplSrlMatches(now)[0];
    startSrlOperatorMatch(match.id, now);
    const awayKey = match.team2.key;

    setSrlOperatorWinner(match.id, awayKey);
    const live = getIplSrlMatchById(match.id, now + 120_000);
    expect(live.matchState).toBe('in');
    expect(live.operator.forcedWinnerKey).toBe(awayKey);

    declareSrlOperatorWinner(match.id, awayKey, now + 180_000);
    const done = getIplSrlMatchById(match.id, now + 180_000);
    expect(done.matchState).toBe('post');
    expect(done.isLive).toBe(false);
    expect(done.liveDetails.winnerKey).toBe(awayKey);
    expect(String(done.liveDetails.commentary)).toMatch(/won/i);
  });

  it('starts from the admin snapshot without requiring a winner first', () => {
    const snap = getIPLSRLControlSnapshot();
    const desk = snap.matches[0];
    expect(desk.canStart).toBe(true);
    expect(desk.controlStatus).toBe('READY');

    const afterStart = startIPLSRLControlledMatch(desk.matchId, { admin: 'test' });
    const live = afterStart.matches.find((m) => m.matchId === desk.matchId);
    expect(live.controlStatus).toBe('LIVE');

    const withWinner = setIPLSRLForcedWinner(desk.matchId, live.awayTeamId, 'test');
    const armedLive = withWinner.matches.find((m) => m.matchId === desk.matchId);
    expect(armedLive.forcedWinnerTeamId).toBe(live.awayTeamId);
    expect(armedLive.controlStatus).toBe('LIVE');

    const declared = declareIPLSRLWinner(desk.matchId, live.awayTeamId, 'test');
    const done = declared.matches.find((m) => m.matchId === desk.matchId);
    expect(done.controlStatus).toBe('COMPLETED');
  });
});
