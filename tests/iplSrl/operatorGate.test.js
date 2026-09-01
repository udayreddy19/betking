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

describe('OddsYra SRL automated clock', () => {
  beforeEach(() => {
    resetAllSrlOperatorSessions();
  });

  afterEach(() => {
    resetAllSrlOperatorSessions();
  });

  it('lists in-house SRL matches without an operator session', () => {
    const listed = getIplSrlMatches(Date.now());
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((m) => m.source === 'srl' && m.league === 'OddsYra SRL')).toBe(true);
    expect(listed.some((m) => m.matchState === 'in' || m.matchState === 'pre')).toBe(true);
  });

  it('auto-plays a match once wall-clock passes its scheduled start', () => {
    const now = Date.now();
    const listed = getIplSrlMatches(now);
    const upcoming = listed.find((m) => m.matchState === 'pre') || listed[0];
    const live = getIplSrlMatchById(upcoming.id, upcoming.startTime + 90_000);
    expect(live.matchState).toBe('in');
    expect(live.isLive).toBe(true);
    expect(live.time).toBe('Live');
  });

  it('lets the operator override a winner while auto-live and declare it', () => {
    const now = Date.now();
    const match = getIplSrlMatches(now)[0];
    const liveAt = match.startTime + 120_000;
    startSrlOperatorMatch(match.id, liveAt, 120_000);
    const awayKey = match.team2.key;

    setSrlOperatorWinner(match.id, awayKey);
    const live = getIplSrlMatchById(match.id, liveAt);
    expect(live.operator.forcedWinnerKey).toBe(awayKey);

    declareSrlOperatorWinner(match.id, awayKey, liveAt + 60_000);
    const done = getIplSrlMatchById(match.id, liveAt + 60_000);
    expect(done.matchState).toBe('post');
    expect(done.isLive).toBe(false);
    expect(done.liveDetails.winnerKey).toBe(awayKey);
    expect(String(done.liveDetails.commentary)).toMatch(/won/i);
  });

  it('exposes auto-live matches on the admin desk', () => {
    const snap = getIPLSRLControlSnapshot();
    expect(snap.matches.length).toBeGreaterThan(0);
    const desk = snap.matches[0];
    expect(['READY', 'LIVE', 'PAUSED', 'COMPLETED', 'ARMED']).toContain(desk.controlStatus);

    if (desk.controlStatus === 'READY' || desk.controlStatus === 'ARMED') {
      const afterStart = startIPLSRLControlledMatch(desk.matchId, { admin: 'test' });
      const live = afterStart.matches.find((m) => m.matchId === desk.matchId);
      expect(live.controlStatus).toBe('LIVE');
      const withWinner = setIPLSRLForcedWinner(desk.matchId, live.awayTeamId, 'test');
      const armedLive = withWinner.matches.find((m) => m.matchId === desk.matchId);
      expect(armedLive.forcedWinnerTeamId).toBe(live.awayTeamId);
      const declared = declareIPLSRLWinner(desk.matchId, live.awayTeamId, 'test');
      const done = declared.matches.find((m) => m.matchId === desk.matchId);
      expect(done.controlStatus).toBe('COMPLETED');
    } else {
      expect(desk.canPause || desk.canDeclare).toBe(true);
    }
  });
});
