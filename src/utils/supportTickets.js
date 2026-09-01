/**
 * Normalize support ticket list payloads from /api/v1/support/tickets.
 * The route returns `{ tickets, conversations }` at the top level.
 * Older clients looked under `data.tickets`; accept both so the list never goes blank.
 */

export function ticketId(ticket) {
  if (!ticket || typeof ticket !== 'object') return '';
  return String(
    ticket.conversationId
      || ticket.id
      || ticket.ticketReference
      || ticket.ticketNumber
      || ticket.conversationNumber
      || ''
  );
}

export function ticketReference(ticket) {
  if (!ticket || typeof ticket !== 'object') return '';
  return String(
    ticket.referenceNumber
      || ticket.ticketReference
      || ticket.ticketNumber
      || ticket.conversationNumber
      || ticketId(ticket)
  );
}

export function normalizeSupportTicket(ticket) {
  if (!ticket || typeof ticket !== 'object') return null;
  const id = ticketId(ticket);
  if (!id) return null;
  return {
    ...ticket,
    id,
    conversationId: ticket.conversationId || ticket.id || id,
    referenceNumber: ticketReference(ticket),
    subject: ticket.subject || 'Support request',
    category: ticket.category || 'OTHER',
    status: ticket.status || 'OPEN',
    createdAt: ticket.createdAt || ticket.created_at || null,
    messages: Array.isArray(ticket.messages) ? ticket.messages : [],
  };
}

export function extractTicketsFromResponse(payload) {
  if (!payload || typeof payload !== 'object') return [];

  const candidates = [
    payload.tickets,
    payload.conversations,
    payload.data?.tickets,
    payload.data?.conversations,
    Array.isArray(payload.data) ? payload.data : null,
    Array.isArray(payload) ? payload : null,
  ];

  const raw = candidates.find((value) => Array.isArray(value)) || [];
  return raw.map(normalizeSupportTicket).filter(Boolean);
}
