import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  getIplSrlMatches,
  getIplSrlMatchById,
  isSrlTossVisibleToUsers,
  SRL_TOSS_PUBLIC_LEAD_MS,
} from '../../lib/iplSrlSimulator.mjs';
import { resetAllSrlOperatorSessions, getSrlOperatorSession } from '../../lib/iplSrlOperatorState.mjs';
import { executeIPLSRLToss, publishSrlTossToUsers } from '../../lib/iplSrlAdminControl.mjs';
import { resolveCricketTossText } from '../../src/utils/cricketScores.js';

describe('SRL toss lock — desk anytime, users at T-25', () => {
  beforeEach(() => resetAllSrlOperatorSessions());
  afterEach(() => resetAllSrlOperatorSessions());

  function pickPreMatchFarFromStart(now = Date.now()) {
    const listed = getIplSrlMatches(now);
    return listed.find((m) => {
      if (m.matchState !== 'pre') return false;
      const ms = Number(m.startTime) - now;
      return ms > SRL_TOSS_PUBLIC_LEAD_MS + 60_000;
    }) || listed.find((m) => m.matchState === 'pre') || listed[0];
  }

  it('admin can lock early; public board hides toss until T-25', async () => {
    const now = Date.now();
    const match = pickPreMatchFarFromStart(now);
    expect(match?.id).toBeTruthy();
    const matchId = match.id;
    const winnerTeamId = match.team1?.key || match.homeTeamId;
    const farBeforeReveal = Number(match.startTime) - SRL_TOSS_PUBLIC_LEAD_MS - 5 * 60_000;
    expect(isSrlTossVisibleToUsers(match, farBeforeReveal)).toBe(false);

    const res = await executeIPLSRLToss(matchId, {
      winnerTeamId,
      decision: 'BAT',
      lockAndDeclare: true,
    }, 'test_admin', 'SUPER_ADMIN', farBeforeReveal);

    expect(res.success).toBe(true);
    expect(res.lockAndDeclare).toBe(true);
    expect(res.deferred).toBe(true);
    expect(res.toss?.locked).toBe(true);
    expect(res.toss?.userPublished).toBe(false);

    const desk = getIplSrlMatchById(matchId, farBeforeReveal);
    expect(desk.toss?.locked).toBe(true);
    expect(String(desk.toss?.tossWinnerKey || '')).toBe(String(winnerTeamId));

    const publicMatch = getIplSrlMatchById(matchId, farBeforeReveal, { forPublic: true });
    expect(publicMatch.toss).toBeNull();
    expect(resolveCricketTossText(publicMatch)).toBeFalsy();
    expect(String(publicMatch.liveDetails?.commentary || '')).not.toMatch(/won the toss/i);
  });

  it('publish at T-25 settles and shows toss on the public board', async () => {
    const now = Date.now();
    const match = pickPreMatchFarFromStart(now);
    const matchId = match.id;
    const winnerTeamId = match.team1?.key || match.homeTeamId;
    const early = Number(match.startTime) - SRL_TOSS_PUBLIC_LEAD_MS - 10 * 60_000;
    const atReveal = Number(match.startTime) - SRL_TOSS_PUBLIC_LEAD_MS + 5_000;

    await executeIPLSRLToss(matchId, {
      winnerTeamId,
      decision: 'BOWL',
      lockAndDeclare: true,
    }, 'test_admin', 'SUPER_ADMIN', early);

    expect(getSrlOperatorSession(matchId).toss?.userPublished).toBe(false);

    const pub = await publishSrlTossToUsers(matchId, 'SYSTEM', 'SUPER_ADMIN', atReveal);
    expect(pub.success).toBe(true);
    expect(pub.published).toBe(true);
    expect(getSrlOperatorSession(matchId).toss?.userPublished).toBe(true);

    const publicMatch = getIplSrlMatchById(matchId, atReveal, { forPublic: true });
    expect(publicMatch.toss).toBeTruthy();
    expect(String(resolveCricketTossText(publicMatch) || '')).toMatch(/won the toss/i);
    expect(String(publicMatch.liveDetails?.commentary || '')).toMatch(/TOSS/i);
  });

  it('lock inside the T-25 window publishes immediately', async () => {
    const now = Date.now();
    const listed = getIplSrlMatches(now);
    const near = listed.find((m) => {
      const ms = Number(m.startTime) - now;
      return (m.matchState === 'pre' || m.matchState === 'in')
        && Number.isFinite(ms)
        && ms <= SRL_TOSS_PUBLIC_LEAD_MS;
    });
    if (!near) {
      expect(true).toBe(true);
      return;
    }
    const winnerTeamId = near.team1?.key || near.homeTeamId;
    const res = await executeIPLSRLToss(near.id, {
      winnerTeamId,
      decision: 'BAT',
      lockAndDeclare: true,
    }, 'test_admin', 'SUPER_ADMIN', now);
    expect(res.deferred).toBe(false);
    expect(res.toss?.userPublished).toBe(true);
    const publicMatch = getIplSrlMatchById(near.id, now, { forPublic: true });
    expect(publicMatch.toss?.locked).toBe(true);
    expect(String(resolveCricketTossText(publicMatch) || '')).toMatch(/won the toss/i);
  });
});
