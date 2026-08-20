import { getAccessToken } from '../utils/apiClient';

const handlers = new Map();
let socket = null;
let reconnectTimer = null;

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
  for (const channel of channels) {
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
    const token = getAccessToken();
    if (token) socket.send(JSON.stringify({ type: 'auth', token }));
    for (const channel of handlers.keys()) sendSubscribe(channel);
  });
  socket.addEventListener('message', (ev) => {
    try {
      dispatch(JSON.parse(ev.data));
    } catch {
      // ignore
    }
  });
  socket.addEventListener('close', () => {
    socket = null;
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

export function subscribeLiveChannel(channel, handler) {
  if (!channel || typeof handler !== 'function') return () => {};
  if (!handlers.has(channel)) handlers.set(channel, new Set());
  handlers.get(channel).add(handler);
  ensureSocket();
  sendSubscribe(channel);
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
