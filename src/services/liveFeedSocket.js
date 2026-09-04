import { getAccessToken } from '../utils/apiClient';

const handlers = new Map();
let socket = null;
let reconnectTimer = null;
/** @type {string|null} */
let authenticatedUserId = null;
let authPending = false;

function wsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/support`;
}

function dispatch(msg) {
  const channels = [];
  if (msg.eventType === 'odds.updated' && msg.matchId) {
    channels.push(`odds:match:${msg.matchId}`);
  }
  if (msg.eventType === 'scores.updated') {
    if (msg.matchId) {
      channels.push(`scores:match:${msg.matchId}`);
    } else {
      channels.push('scores:live');
    }
  }
  if (msg.eventType === 'BET_SETTLED' && msg.payload?.userId) {
    channels.push(`user:${msg.payload.userId}`);
  }
  if (msg.eventType === 'WALLET_BALANCE_UPDATED' && msg.payload?.userId) {
    channels.push(`user:${msg.payload.userId}`);
  }
  if (msg.eventType === 'BET_CASHED_OUT' && msg.payload?.userId) {
    channels.push(`user:${msg.payload.userId}`);
  }
  if (msg.eventType === 'user.notification.created' && (msg.payload?.userId || msg.userId)) {
    channels.push(`user:${msg.payload?.userId || msg.userId}`);
  }
  if (msg.eventType === 'admin.alert.created' || msg.channel === 'admin:ops') {
    channels.push('admin:ops');
  }
  if (msg.channel) channels.push(msg.channel);

  const seen = new Set();
  for (const channel of channels) {
    if (seen.has(channel)) continue;
    seen.add(channel);
    const set = handlers.get(channel);
    if (!set) continue;
    for (const fn of set) {
      try { fn(msg); } catch { /* ignore handler errors */ }
    }
  }
}

function sendSubscribe(channel) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'subscribe', channel }));
  }
}

function isPrivateUserChannel(channel) {
  return typeof channel === 'string' && channel.startsWith('user:');
}

function canSubscribeNow(channel) {
  if (!isPrivateUserChannel(channel)) return true;
  if (!authenticatedUserId) return false;
  return channel === `user:${authenticatedUserId}`;
}

function subscribeEligibleChannels() {
  for (const channel of handlers.keys()) {
    if (canSubscribeNow(channel)) sendSubscribe(channel);
  }
}

function emitReconnectToUserHandlers() {
  for (const [channel, set] of handlers.entries()) {
    if (!channel.startsWith('user:')) continue;
    for (const fn of set) {
      try { fn({ eventType: 'WS_RECONNECTED', channel, payload: {} }); } catch { /* ignore */ }
    }
  }
}

function ensureSocket() {
  if (typeof window === 'undefined') return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  try {
    socket = new WebSocket(wsUrl());
  } catch {
    return;
  }
  socket.addEventListener('open', () => {
    authenticatedUserId = null;
    authPending = false;
    const token = getAccessToken();
    if (token) {
      authPending = true;
      socket.send(JSON.stringify({ type: 'auth', token }));
    }
    // Public channels only until authenticated (user:* requires session.userId).
    for (const channel of handlers.keys()) {
      if (!isPrivateUserChannel(channel)) sendSubscribe(channel);
    }
    if (!token) {
      // No auth — still notify reconnect for any public handlers only.
      emitReconnectToUserHandlers();
    }
  });
  socket.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg?.type === 'authenticated' && msg.userId) {
        authenticatedUserId = String(msg.userId);
        authPending = false;
        subscribeEligibleChannels();
        emitReconnectToUserHandlers();
        return;
      }
      dispatch(msg);
    } catch {
      // ignore
    }
  });
  socket.addEventListener('close', () => {
    socket = null;
    authenticatedUserId = null;
    authPending = false;
    if (handlers.size === 0) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(ensureSocket, 1500);
  });
}

function sendUnsubscribe(channel) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'unsubscribe', channel }));
  }
}

export function isLiveFeedSocketOpen() {
  return Boolean(socket && socket.readyState === WebSocket.OPEN);
}

/** @internal test helper */
export function __liveFeedSocketTestState() {
  return { authenticatedUserId, authPending, handlerChannels: [...handlers.keys()] };
}

export function subscribeLiveChannel(channel, handler) {
  if (!channel || typeof handler !== 'function') return () => {};
  if (!handlers.has(channel)) handlers.set(channel, new Set());
  handlers.get(channel).add(handler);
  ensureSocket();
  if (canSubscribeNow(channel)) sendSubscribe(channel);
  return () => {
    const set = handlers.get(channel);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      handlers.delete(channel);
      sendUnsubscribe(channel);
    }
  };
}
