import { describe, it, expect } from 'vitest';
import { isTencricEventFinished, mapTencricEvent } from '../../lib/providers/tencricProvider.mjs';
import { evaluateBetForSettlement, resolveLiveMatchWinner } from '../../lib/liveMatchSettlement.mjs';
import { inferScoreSportStaleLiveFinal, markInferredFinal } from '../../lib/settlement/wallClockFinality.mjs';
import { inferPersistedSport } from '../../lib/eventPersistence.mjs';

describe('finished handball / score-sport settlement (V4.3)', () => {
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

  it('infers handball sport from Andebol competition names', () => {
    expect(inferPersistedSport('1a Divisao', 'AA Aguas Santas', 'OS Belenenses')).toBe('cricket');
    expect(inferPersistedSport('Andebol 1a Divisao', 'AA Aguas Santas', 'OS Belenenses')).toBe('handball');
  });
});
