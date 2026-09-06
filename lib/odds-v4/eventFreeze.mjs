/**
 * OddsEngineV4 — freeze fragile markets right after wicket / big event.
 * In-memory TTL so sticky provider event strings cannot suspend forever.
 */

export const EVENT_FREEZE_TTL_MS = 12_000;

const FREEZE_EVENTS = new Set([
  'WICKET',
  'BOUNDARY_SIX',
  'BOUNDARY_FOUR',
  'REVIEW',
  'DRINKS',
  'INNINGS_BREAK',
]);

/** @type {Map<string, number>} */
const freezeStartedAt = new Map();

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

function freezeKey(state, event) {
  const matchId = state?.matchId || state?.id || 'unknown';
  const version = state?.stateVersion ?? state?.ballsCompleted ?? state?.liveDetails?.overs ?? '';
  return `${matchId}:${event}:${version}`;
}

/**
 * Suspend delivery / next-over props immediately after a shock event (short TTL).
 */
export function applyEventFreeze(markets = [], state, nowMs = Date.now()) {
  const event = detectEvent(state);
  if (!event) return markets;

  const key = freezeKey(state, event);
  if (!freezeStartedAt.has(key)) freezeStartedAt.set(key, nowMs);
  const started = freezeStartedAt.get(key);
  if (nowMs - started > EVENT_FREEZE_TTL_MS) return markets;

  // Drop stale keys for other matches/events (bounded memory)
  if (freezeStartedAt.size > 500) {
    for (const [k, ts] of freezeStartedAt) {
      if (nowMs - ts > EVENT_FREEZE_TTL_MS * 2) freezeStartedAt.delete(k);
    }
  }

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

/** @internal test helper */
export function _resetEventFreezeForTests() {
  freezeStartedAt.clear();
}
