/**
 * OddsEngineV4 — freeze fragile markets right after wicket / big event.
 */

const FREEZE_EVENTS = new Set([
  'WICKET',
  'BOUNDARY_SIX',
  'BOUNDARY_FOUR',
  'REVIEW',
  'DRINKS',
  'INNINGS_BREAK',
]);

function detectEvent(state) {
  const raw = String(
    state?.lastBallEvent
    || state?.event
    || state?.liveDetails?.lastBallEvent
    || state?.liveDetails?.event
    || '',
  ).toUpperCase();
  if (FREEZE_EVENTS.has(raw)) return raw;
  if (/WICKET|\bW\b/.test(raw)) return 'WICKET';
  if (/SIX/.test(raw)) return 'BOUNDARY_SIX';
  if (/FOUR/.test(raw)) return 'BOUNDARY_FOUR';
  return null;
}

/**
 * Suspend delivery / next-over props immediately after a shock event.
 */
export function applyEventFreeze(markets = [], state) {
  const event = detectEvent(state);
  if (!event) return markets;

  const freezeDelivery = event === 'WICKET' || event === 'REVIEW' || event === 'INNINGS_BREAK';
  const freezeOvers = event === 'WICKET' || event === 'INNINGS_BREAK' || event === 'DRINKS';

  return (markets || []).map((market) => {
    if (!market || market.status !== 'OPEN') return market;
    const id = String(market.marketId || '');
    const hitDelivery = freezeDelivery && /next_delivery_/i.test(id);
    const hitOver = freezeOvers && (/wicket_in_(?:next_)?over_|next_over_\d+_total|current_over_/i.test(id));
    if (!hitDelivery && !hitOver) return market;
    return {
      ...market,
      status: 'SUSPENDED',
      suspensionReason: `event_freeze:${event}`,
      selections: (market.selections || []).map((s) => ({
        ...s,
        bettable: false,
        status: 'SUSPENDED',
      })),
    };
  });
}
