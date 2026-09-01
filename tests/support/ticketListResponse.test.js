import { describe, it, expect } from 'vitest';
import {
  extractTicketsFromResponse,
  ticketId,
  ticketReference,
} from '../../src/utils/supportTickets.js';

const sample = {
  conversationId: 'conv_1',
  ticketReference: 'OD-2026-3862284',
  ticketNumber: 'OD-2026-3862284',
  subject: 'Deposit pending',
  category: 'DEPOSIT',
  status: 'OPEN',
  createdAt: '2026-08-31T10:00:00.000Z',
};

describe('extractTicketsFromResponse', () => {
  it('reads tickets from the live API top-level shape', () => {
    const list = extractTicketsFromResponse({
      success: true,
      tickets: [sample],
      conversations: [sample],
    });
    expect(list).toHaveLength(1);
    expect(ticketId(list[0])).toBe('conv_1');
    expect(ticketReference(list[0])).toBe('OD-2026-3862284');
    expect(list[0].status).toBe('OPEN');
  });

  it('reads tickets nested under data.tickets (widget bug shape)', () => {
    const list = extractTicketsFromResponse({
      success: true,
      data: { tickets: [sample] },
    });
    expect(list).toHaveLength(1);
    expect(list[0].referenceNumber).toBe('OD-2026-3862284');
  });

  it('does not treat a missing data object as an empty list when tickets exist', () => {
    const brokenWidgetParse = (payload) => payload.data?.tickets || payload.data || [];
    const apiPayload = { success: true, tickets: [sample] };
    expect(brokenWidgetParse(apiPayload)).toEqual([]);
    expect(extractTicketsFromResponse(apiPayload)).toHaveLength(1);
  });

  it('returns [] for empty or malformed payloads', () => {
    expect(extractTicketsFromResponse(null)).toEqual([]);
    expect(extractTicketsFromResponse({})).toEqual([]);
    expect(extractTicketsFromResponse({ data: {} })).toEqual([]);
  });
});
