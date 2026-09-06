import { describe, it, expect } from 'vitest';
import { isTencricEventFinished, mapTencricEvent } from '../../lib/providers/tencricProvider.mjs';
import { evaluateBetForSettlement, resolveLiveMatchWinner } from '../../lib/liveMatchSettlement.mjs';
import {
  inferScoreSportStaleLiveFinal,
  markInferredFinal,
  looksLikePeriodBreak,
  compareEngineVersions,
} from '../../lib/settlement/wallClockFinality.mjs';
import { inferPersistedSport } from '../../lib/eventPersistence.mjs';
import { inferWallClockMatchFinal } from '../../lib/settlement/wallClockFinality.mjs';

describe('finished handball / score-sport settlement (V4.4)', () => {
  const finishedHandball = {
    id: 'hb_aguas_belenenses',
    sportName: 'Handball',
    leagueName: '1a Divisao',
    isLive: false,
    eventStatus: 'FINISHED',
    eventPhase: { description: 'Finished' },
    participantHomeName: 'AA Aguas Santas',
    participantAwayName: 'OS Belenenses',
    totalHomeScore: 31,
    totalAwayScore: 28,
    startEventDate: Date.now() - 6 * 3600 * 1000,
  };

  it('maps finished handball as COMPLETED with home winner', async () => {
    expect(isTencricEventFinished(finishedHandball)).toBe(true);
    const match = mapTencricEvent(finishedHandball);
    expect(match.sport).toBe('handball');
    expect(match.isCompleted).toBe(true);
    expect(match.status).toBe('COMPLETED');
    expect(match.winnerSide).toBe('1');
    expect(resolveLiveMatchWinner(match)).toBe('1');

    const belenenses = await evaluateBetForSettlement({
      market_id: 'match_winner',
      selection_id: '2',
      selection_name: 'OS Belenenses',
    }, match);
    expect(belenenses.outcome).toBe('LOST');

    const aguas = await evaluateBetForSettlement({
      market_id: 'match_winner',
      selection_id: '1',
      selection_name: 'AA Aguas Santas',
    }, match);
    expect(aguas.outcome).toBe('WON');
  });

  it('treats stale frozen LIVE score boards as final', async () => {
    const now = Date.now();
    const frozen = {
      id: 'hb_frozen',
      sport: 'handball',
      isLive: true,
      matchState: 'in',
      status: 'LIVE',
      score1: 25,
      score2: 24,
      startTime: new Date(now - 4 * 3600 * 1000).toISOString(),
      updatedAt: new Date(now - 40 * 60 * 1000).toISOString(),
      team1: { name: 'AA Aguas Santas' },
      team2: { name: 'OS Belenenses' },
      liveDetails: { score1: 25, score2: 24 },
    };
    expect(inferScoreSportStaleLiveFinal(frozen, { now })).toBe(true);
    markInferredFinal(frozen);
    expect(frozen.status).toBe('COMPLETED');
    expect(resolveLiveMatchWinner(frozen)).toBe('1');

    const lost = await evaluateBetForSettlement({
      market_id: 'match_winner',
      selection_id: '2',
      selection_name: 'OS Belenenses',
    }, frozen);
    expect(lost.outcome).toBe('LOST');
  });

  it('does not finalize actively updating long matches by start age alone', () => {
    const now = Date.now();
    const liveUpdating = {
      sport: 'handball',
      isLive: true,
      score1: 20,
      score2: 18,
      startTime: new Date(now - 3 * 3600 * 1000).toISOString(),
      updatedAt: new Date(now - 60 * 1000).toISOString(),
    };
    const tennis = {
      sport: 'tennis',
      isLive: true,
      score1: 2,
      score2: 1,
      startTime: new Date(now - 3 * 3600 * 1000).toISOString(),
      updatedAt: new Date(now - 30 * 1000).toISOString(),
    };
    expect(inferScoreSportStaleLiveFinal(liveUpdating, { now })).toBe(false);
    expect(inferScoreSportStaleLiveFinal(tennis, { now })).toBe(false);
  });

  it('extends grace during half-time / break freezes', () => {
    const now = Date.now();
    const ht = {
      sport: 'handball',
      isLive: true,
      time: 'HT',
      score1: 14,
      score2: 12,
      startTime: new Date(now - 50 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 30 * 60 * 1000).toISOString(),
    };
    expect(looksLikePeriodBreak(ht)).toBe(true);
    expect(inferScoreSportStaleLiveFinal(ht, { now })).toBe(false);
  });

  it('infers handball sport from club names when league is generic', () => {
    expect(inferPersistedSport('1a Divisao', 'AA Aguas Santas', 'OS Belenenses')).toBe('handball');
    expect(inferPersistedSport('Andebol 1a Divisao', 'AA Aguas Santas', 'OS Belenenses')).toBe('handball');
  });

  it('runs score-sport finality on reconstruct-style probes with sport set', () => {
    const now = Date.now();
    const probe = {
      sport: 'handball',
      isLive: true,
      matchState: 'in',
      status: 'LIVE',
      score1: 31,
      score2: 28,
      startTime: new Date(now - 5 * 3600 * 1000).toISOString(),
      updatedAt: new Date(now - 50 * 60 * 1000).toISOString(),
    };
    expect(inferWallClockMatchFinal(probe, { now })).toBe(true);
  });

  it('compares engine versions numerically', () => {
    expect(compareEngineVersions('4.10.0', '4.9.0')).toBe(1);
    expect(compareEngineVersions('4.4.0', '4.3.0')).toBe(1);
    expect(compareEngineVersions('4.4.0', '4.4.0')).toBe(0);
  });

  it('marks draws with winnerSide X for handball', () => {
    const draw = {
      sport: 'handball',
      score1: 22,
      score2: 22,
    };
    markInferredFinal(draw);
    expect(draw.winnerSide).toBe('X');
  });
});
