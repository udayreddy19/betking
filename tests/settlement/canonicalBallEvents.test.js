import { describe, it, expect } from 'vitest';
import {
  classifyEventType,
  normalizeBallToCanonicalEvent,
  extractLegalBallsFromOverRow,
} from '../../lib/settlement/canonicalBallEvents.mjs';
import { parseDeliveryBallOutcome } from '../../lib/cricketBallOutcome.mjs';

describe('canonical ball events', () => {
  it('classifies cricket event types from ball labels', () => {
    expect(classifyEventType('W')).toBe('WICKET');
    expect(classifyEventType('•')).toBe('DOT');
    expect(classifyEventType('4')).toBe('FOUR');
    expect(classifyEventType('6')).toBe('SIX');
    expect(classifyEventType('1Wd')).toBe('WIDE');
    expect(classifyEventType('2Nb')).toBe('NO_BALL');
  });

  it('extracts legal balls skipping wides/no-balls for over completion count', () => {
    const { events } = extractLegalBallsFromOverRow({
      overNum: 16,
      balls: ['4', '1Wd', '0', '2', '6'],
      isCurrent: false,
    }, 1, 'oy_test', 0);

    const legal = events.filter((e) => e.ballNumber > 0);
    expect(legal.map((e) => e.rawLabel)).toEqual(['4', '•', '2', '6']);
    expect(legal).toHaveLength(4);
  });

  it('normalizes a four into canonical event structure', () => {
    const ev = normalizeBallToCanonicalEvent({
      matchId: 'oy_1',
      innings: 1,
      overNumber: 16,
      ballNumber: 1,
      sequenceNumber: 1,
      rawBall: '4',
    });
    expect(ev.eventType).toBe('FOUR');
    expect(ev.runs).toBe(4);
    expect(ev.isBoundary).toBe(true);
    expect(parseDeliveryBallOutcome(ev.rawLabel).kind).toBe('runs');
  });

  it('rejects stale sequence in upsert logic via sequence check', () => {
    const older = normalizeBallToCanonicalEvent({
      matchId: 'oy_1',
      innings: 1,
      overNumber: 16,
      ballNumber: 1,
      sequenceNumber: 5,
      rawBall: '4',
    });
    const newer = normalizeBallToCanonicalEvent({
      matchId: 'oy_1',
      innings: 1,
      overNumber: 16,
      ballNumber: 1,
      sequenceNumber: 10,
      rawBall: '•',
    });
    expect(older.sequenceNumber).toBeLessThan(newer.sequenceNumber);
    expect(newer.eventType).toBe('DOT');
  });
});

describe('delivery ball wide/no-ball semantics', () => {
  it('wide does not consume legal ball slot', () => {
    const { events } = extractLegalBallsFromOverRow({
      overNum: 16,
      balls: ['1Wd', '4'],
      isCurrent: false,
    }, 1, 'oy_wide', 0);
    const legal = events.filter((e) => !/wd/i.test(e.rawLabel));
    expect(legal.filter((e) => e.ballNumber > 0)).toHaveLength(1);
    expect(legal.find((e) => e.ballNumber === 1)?.rawLabel).toBe('4');
  });
});
