import { describe, it, expect } from 'vitest';
import { isTencricEventFinished, mapTencricEvent } from '../../lib/providers/tencricProvider.mjs';
import { evaluateBetForSettlement } from '../../lib/liveMatchSettlement.mjs';
import { lookupEventForSettlement, LOOKUP_RESULT_CODES } from '../../lib/settlement/settlementEventLookup.mjs';

describe('finished 10cric snooker settlement', () => {
  const finishedEvent = {
    id: 'snk_hill_jones',
    sportName: 'Snooker',
    leagueName: 'British Open Snooker',
    isLive: false,
    eventStatus: 'FINISHED',
    eventPhase: { description: 'Finished' },
    participantHomeName: 'Hill, Aaron',
    participantAwayName: 'Jones, Jak',
    totalHomeScore: 3,
    totalAwayScore: 5,
    startEventDate: Date.now() - 12 * 3600 * 1000,
  };

  it('treats FINISHED book status as complete even when isLive is false', () => {
    expect(isTencricEventFinished(finishedEvent)).toBe(true);
    expect(isTencricEventFinished({
      ...finishedEvent,
      eventStatus: 'SCHEDULED',
      eventPhase: { description: 'Not started' },
      totalHomeScore: 0,
      totalAwayScore: 0,
    })).toBe(false);
  });

  it('maps a finished snooker event as COMPLETED with Jak as winner', async () => {
    const match = mapTencricEvent(finishedEvent);
    expect(match.sport).toBe('snooker');
    expect(match.isCompleted).toBe(true);
    expect(match.matchState).toBe('post');
    expect(match.status).toBe('COMPLETED');
    expect(match.winnerSide).toBe('2');

    const hill = await evaluateBetForSettlement({
      market_id: 'match_winner',
      selection_id: 'sel_hill',
      selection_name: 'Hill, Aaron',
    }, match);
    expect(hill.outcome).toBe('LOST');
  });

  it('accepts Last, First vs First Last identity on settlement lookup', async () => {
    const match = {
      id: 'oy_snk_1',
      team1: { name: 'Aaron Hill' },
      team2: { name: 'Jak Jones' },
      status: 'COMPLETED',
      matchState: 'post',
    };
    const result = await lookupEventForSettlement({
      bet: {
        match_id: 'oy_snk_1',
        placement_snapshot: {
          legs: [{ team1Name: 'Hill, Aaron', team2Name: 'Jones, Jak' }],
        },
      },
      liveById: new Map([['oy_snk_1', match]]),
    });
    expect(result.success).toBe(true);
    expect(result.lookupResult).not.toBe(LOOKUP_RESULT_CODES.EVENT_ID_MISMATCH);
  });
});
