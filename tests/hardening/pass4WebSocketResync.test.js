/**
 * Pass 4 — WebSocket reconnect / ordering / heartbeat certification.
 * Classified: UNIT (in-process protocol helpers — not LIVE socket to production).
 */

import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Minimal client-side resync buffer used by live feeds.
 * Models: sequence tracking, duplicate drop, out-of-order buffer, heartbeat timeout.
 */
export function createLiveFeedResyncState({ heartbeatTimeoutMs = 5000 } = {}) {
  let lastSeq = -1;
  const buffered = new Map();
  let lastHeartbeatAt = Date.now();
  let needsResync = false;
  const applied = [];

  function noteHeartbeat(now = Date.now()) {
    lastHeartbeatAt = now;
  }

  function isHeartbeatTimedOut(now = Date.now()) {
    return now - lastHeartbeatAt > heartbeatTimeoutMs;
  }

  function onConnectionDrop() {
    needsResync = true;
    buffered.clear();
  }

  function onReconnect({ snapshotSeq = null, snapshotPayload = null } = {}) {
    if (snapshotSeq != null && Number.isFinite(Number(snapshotSeq))) {
      lastSeq = Number(snapshotSeq);
      if (snapshotPayload != null) applied.push({ seq: lastSeq, payload: snapshotPayload, source: 'SNAPSHOT' });
    }
    needsResync = false;
    buffered.clear();
    noteHeartbeat();
  }

  function ingest({ seq, payload, now = Date.now() }) {
    noteHeartbeat(now);
    const s = Number(seq);
    if (!Number.isFinite(s)) return { action: 'REJECT_BAD_SEQ' };
    if (s <= lastSeq) return { action: 'DROP_DUPLICATE_OR_STALE', lastSeq };
    if (s === lastSeq + 1) {
      lastSeq = s;
      applied.push({ seq: s, payload, source: 'LIVE' });
      // drain buffer
      while (buffered.has(lastSeq + 1)) {
        const next = buffered.get(lastSeq + 1);
        buffered.delete(lastSeq + 1);
        lastSeq += 1;
        applied.push({ seq: lastSeq, payload: next, source: 'BUFFER' });
      }
      return { action: 'APPLY', lastSeq };
    }
    // gap — buffer and request resync if gap large
    buffered.set(s, payload);
    if (s > lastSeq + 5) needsResync = true;
    return { action: 'BUFFER_OUT_OF_ORDER', lastSeq, buffered: buffered.size, needsResync };
  }

  return {
    getLastSeq: () => lastSeq,
    getApplied: () => [...applied],
    needsResync: () => needsResync,
    isHeartbeatTimedOut,
    onConnectionDrop,
    onReconnect,
    ingest,
    noteHeartbeat,
  };
}

describe('Pass-4 WebSocket resync certification', () => {
  let state;

  beforeEach(() => {
    state = createLiveFeedResyncState({ heartbeatTimeoutMs: 1000 });
    state.onReconnect({ snapshotSeq: 0, snapshotPayload: { score: '0-0' } });
  });

  it('applies in-order events', () => {
    expect(state.ingest({ seq: 1, payload: { score: '1-0' } }).action).toBe('APPLY');
    expect(state.ingest({ seq: 2, payload: { score: '2-0' } }).action).toBe('APPLY');
    expect(state.getLastSeq()).toBe(2);
  });

  it('drops duplicates', () => {
    state.ingest({ seq: 1, payload: { a: 1 } });
    expect(state.ingest({ seq: 1, payload: { a: 1 } }).action).toBe('DROP_DUPLICATE_OR_STALE');
    expect(state.getApplied().filter((x) => x.seq === 1).length).toBe(1);
  });

  it('buffers out-of-order then drains', () => {
    expect(state.ingest({ seq: 2, payload: { n: 2 } }).action).toBe('BUFFER_OUT_OF_ORDER');
    expect(state.ingest({ seq: 1, payload: { n: 1 } }).action).toBe('APPLY');
    expect(state.getLastSeq()).toBe(2);
    expect(state.getApplied().map((x) => x.seq).filter((s) => s > 0)).toEqual([1, 2]);
  });

  it('flags resync on large gap / connection drop', () => {
    state.ingest({ seq: 1, payload: {} });
    const r = state.ingest({ seq: 10, payload: {} });
    expect(r.needsResync).toBe(true);
    state.onConnectionDrop();
    expect(state.needsResync()).toBe(true);
    state.onReconnect({ snapshotSeq: 10, snapshotPayload: { resynced: true } });
    expect(state.needsResync()).toBe(false);
    expect(state.getLastSeq()).toBe(10);
    expect(state.getApplied().at(-1).source).toBe('SNAPSHOT');
  });

  it('detects heartbeat timeout and requires resync after reconnect', () => {
    const t0 = Date.now();
    state.noteHeartbeat(t0);
    expect(state.isHeartbeatTimedOut(t0 + 500)).toBe(false);
    expect(state.isHeartbeatTimedOut(t0 + 1500)).toBe(true);
    state.onConnectionDrop();
    state.onReconnect({ snapshotSeq: state.getLastSeq() });
    expect(state.isHeartbeatTimedOut(Date.now())).toBe(false);
  });

  it('after reconnect, stale pre-drop sequences are ignored', () => {
    state.ingest({ seq: 1, payload: { v: 1 } });
    state.ingest({ seq: 2, payload: { v: 2 } });
    state.onConnectionDrop();
    state.onReconnect({ snapshotSeq: 5, snapshotPayload: { v: 5 } });
    expect(state.ingest({ seq: 3, payload: { v: 3 } }).action).toBe('DROP_DUPLICATE_OR_STALE');
    expect(state.ingest({ seq: 6, payload: { v: 6 } }).action).toBe('APPLY');
  });
});
