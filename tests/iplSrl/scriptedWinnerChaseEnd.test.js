import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getIplSrlMatchById,
  getIplSrlMatches,
  isSrlChaseFinished,
  freezeChaseAtTarget,
  resolveChaseResultWinnerKey,
} from '../../lib/iplSrlSimulator.mjs';
import {
  resetAllSrlOperatorSessions,
  setSrlOperatorWinner,
  startSrlOperatorMatch,
  seekSrlOperatorElapsed,
  upsertSrlScoreAnchor,
  setSrlTossAndLineup,
} from '../../lib/iplSrlOperatorState.mjs';

describe('SRL scripted winner + chase end', () => {
  beforeEach(() => {
    resetAllSrlOperatorSessions();
  });

  afterEach(() => {
    resetAllSrlOperatorSessions();
  });

  it('resolveChaseResultWinnerKey follows batting order (chase vs defend)', () => {
    const batFirst = { key: 'rr', name: 'RR' };
    const chase = { key: 'pbks', name: 'PBKS' };
    expect(resolveChaseResultWinnerKey(
      { inningsId: 2, phase: 'chase', firstRuns: 160, chaseRuns: 161, chaseWickets: 3 },
      batFirst,
      chase,
    )).toBe('pbks');
    expect(resolveChaseResultWinnerKey(
      { inningsId: 2, phase: 'chase-complete', firstRuns: 160, chaseRuns: 140, chaseWickets: 10 },
      batFirst,
      chase,
    )).toBe('rr');
  });

  it('freezeChaseAtTarget marks chase-complete when runs pass target', () => {
    const frozen = freezeChaseAtTarget({
      inningsId: 2,
      phase: 'chase',
      firstRuns: 150,
      chaseRuns: 151,
      chaseWickets: 2,
      chaseTeamName: 'PBKS',
      batter1: { name: 'X' },
      currentOverBalls: ['1', '4'],
    });
    expect(frozen.phase).toBe('chase-complete');
    expect(frozen.batter1).toBeUndefined();
    expect(frozen.currentOverBalls).toEqual([]);
    expect(isSrlChaseFinished(frozen)).toBe(true);
  });

  it('ends the match when chase target is reached (no more live overs)', () => {
    const listed = getIplSrlMatches(Date.now());
    const match = listed.find((m) => m.team1?.key && m.team2?.key) || listed[0];
    const wall = Date.now();
    startSrlOperatorMatch(match.id, wall, 0);

    const chaseStart = Number(match.sim?.timing?.breakEndMs)
      || (Number(match.sim?.timing?.inningsPlayMs) + Number(match.sim?.timing?.inningsBreakMs || 15 * 60_000));
    const nearChaseEnd = Math.min(
      Number(match.sim?.totalDuration || match.expectedDurationMs) - 60_000,
      chaseStart + (Number(match.sim?.timing?.inningsPlayMs) || 90 * 60_000) - 30_000,
    );
    seekSrlOperatorElapsed(match.id, Math.max(chaseStart + 60_000, nearChaseEnd), wall, { pause: true });

    // Force chase score above target via anchor → board must complete.
    const liveMid = getIplSrlMatchById(match.id, wall);
    const first = Number(liveMid.liveDetails?.firstRuns ?? liveMid.liveDetails?.runs ?? 150);
    const target = first + 1;
    upsertSrlScoreAnchor(match.id, {
      innings: 2,
      runs: target + 5,
      wickets: 2,
      atOver: 12.3,
      ballIndex: 75,
      applyNow: true,
      source: 'test',
      naturalRunsAtAnchor: Number(liveMid.liveDetails?.chaseRuns ?? 0),
      naturalWicketsAtAnchor: Number(liveMid.liveDetails?.chaseWickets ?? 0),
    });

    const done = getIplSrlMatchById(match.id, wall);
    expect(done.matchState).toBe('post');
    expect(done.isLive).toBe(false);
    expect(done.liveDetails?.phase).toBe('chase-complete');
    expect(Number(done.liveDetails?.chaseRuns)).toBeGreaterThanOrEqual(target);
  });

  it('scripted chasing team wins even when natural scoreboard had them behind', () => {
    const listed = getIplSrlMatches(Date.now());
    const match = listed.find((m) => m.team1?.key && m.team2?.key) || listed[0];
    const wall = Date.now();
    startSrlOperatorMatch(match.id, wall, 0);

    const chaseKey = match.team2.key; // fixture team2 chases under seed toss (team1 bats first)
    setSrlOperatorWinner(match.id, chaseKey);

    const duration = Number(match.sim?.totalDuration || match.expectedDurationMs);
    seekSrlOperatorElapsed(match.id, duration - 1, wall, { pause: true });

    const done = getIplSrlMatchById(match.id, wall);
    expect(done.matchState).toBe('post');
    expect(done.liveDetails?.winnerKey).toBe(chaseKey);
    expect(String(done.liveDetails?.commentary || '')).toMatch(/won/i);
    // Scripted chase win must show chase above first-innings total.
    expect(Number(done.liveDetails?.chaseRuns)).toBeGreaterThan(Number(done.liveDetails?.firstRuns));
  });

  it('scripted defending team wins with chase under first total when toss flipped batting order', () => {
    const listed = getIplSrlMatches(Date.now());
    const match = listed.find((m) => m.team1?.key && m.team2?.key) || listed[0];
    const wall = Date.now();
    startSrlOperatorMatch(match.id, wall, 0);

    // Operator toss: team2 bats first → fixture team1 chases.
    setSrlTossAndLineup(match.id, {
      tossWinnerKey: match.team2.key,
      tossDecision: 'BAT',
      locked: true,
      userPublished: true,
      winnerName: match.team2.name,
    });
    setSrlOperatorWinner(match.id, match.team2.key); // defending (bat-first) side

    const duration = Number(match.sim?.totalDuration || match.expectedDurationMs);
    seekSrlOperatorElapsed(match.id, duration - 1, wall, { pause: true });
    const done = getIplSrlMatchById(match.id, wall);

    expect(done.liveDetails?.winnerKey).toBe(match.team2.key);
    expect(Number(done.liveDetails?.chaseRuns)).toBeLessThan(Number(done.liveDetails?.firstRuns));
    expect(String(done.liveDetails?.commentary || '')).toMatch(/won by \d+ runs/i);
  });
});
