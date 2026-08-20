/**
 * Enterprise WebSocket Event Manager — OddsYra Sportsbook (lib/websocketEngine.mjs)
 * Native WebSocket server attached to HTTP server in server/index.js.
 * Handles authenticated socket connections, channel authorization (`support:conversation:{id}`),
 * post-commit event broadcasting, reconnection recovery, and socket cleanup.
 */

import { logger } from './logger.mjs';
import { WebSocketServer } from 'ws';

const WS_CLIENT_SESSIONS = new Set();
const CHANNEL_SUBSCRIBERS = new Map(); // channelId -> Set of sockets
const EVENT_QUEUE_BUFFER = [];
let wssInstance = null;

const ADMIN_WS_ROLES = new Set([
  'admin',
  'super_admin',
  'operations_admin',
  'finance_admin',
  'trading_admin',
  'risk_analyst',
  'support_agent',
  'supervisor',
]);

export async function canSubscribeToChannel(session, channel) {
  if (!channel || typeof channel !== 'string') return false;

  if (isPublicLiveChannel(channel)) return true;

  if (session.anonymousOddsOnly) {
    return false;
  }

  if (channel.startsWith('support:conversation:')) {
    const convId = channel.slice('support:conversation:'.length);
    const role = String(session.role || 'user').toLowerCase();
    if (ADMIN_WS_ROLES.has(role)) return true;
    try {
      const { supportEngine } = await import('./supportEngine.mjs');
      const conv = await supportEngine.getConversationById(convId, 'user');
      return Boolean(conv && conv.userId === session.userId);
    } catch {
      return false;
    }
  }

  return false;
}

export function isPublicLiveChannel(channel) {
  if (!channel || typeof channel !== 'string') return false;
  return channel === 'scores:live'
    || channel.startsWith('scores:match:')
    || channel.startsWith('odds:match:');
}

export function wsUrlHasAuthQuery(reqUrl) {
  try {
    const url = new URL(reqUrl || '/', 'http://localhost');
    return url.searchParams.has('token') || url.searchParams.has('access_token');
  } catch {
    return false;
  }
}

async function authenticateWsToken(token) {
  if (!token) return null;
  try {
    const { verifyAccessToken } = await import('../server/auth/tokenService.js');
    const decoded = verifyAccessToken(token);
    if (decoded?.sub) {
      return {
        userId: decoded.sub,
        role: String(decoded.role || 'user').toLowerCase(),
      };
    }
  } catch {
    // not a user access token
  }
  try {
    const { verifyAdminToken } = await import('../server/middleware/adminAuth.js');
    const decoded = verifyAdminToken(token);
    if (decoded?.sub && decoded.type === 'admin') {
      return {
        userId: decoded.sub,
        role: String(decoded.role || 'admin').toLowerCase(),
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function initWebSocketServer(httpServer) {
  if (wssInstance) return wssInstance;

  wssInstance = new WebSocketServer({ server: httpServer, path: '/ws/support' });

  wssInstance.on('connection', async (ws, req) => {
    if (wsUrlHasAuthQuery(req.url)) {
      ws.close(4401, 'Query token not allowed');
      return;
    }

    const session = {
      sessionId: `ws_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      socket: ws,
      userId: null,
      role: 'anonymous',
      anonymousOddsOnly: true,
      token: null,
      channels: new Set(),
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
    };

    WS_CLIENT_SESSIONS.add(session);

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        session.lastHeartbeat = Date.now();

        if (msg.type === 'auth') {
          const identity = await authenticateWsToken(msg.token);
          if (!identity) {
            ws.send(JSON.stringify({ type: 'error', code: 'AUTH_FAILED' }));
            return;
          }
          session.userId = identity.userId;
          session.role = identity.role;
          session.anonymousOddsOnly = false;
          session.token = null;
          ws.send(JSON.stringify({ type: 'authenticated', userId: session.userId }));
          return;
        }

        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        } else if (msg.type === 'subscribe') {
          const channel = msg.channel;
          if (!channel) return;

          const allowed = await canSubscribeToChannel(session, channel);
          if (!allowed) {
            ws.send(JSON.stringify({ type: 'error', code: 'FORBIDDEN_CHANNEL', channel }));
            return;
          }

          session.channels.add(channel);
          if (!CHANNEL_SUBSCRIBERS.has(channel)) {
            CHANNEL_SUBSCRIBERS.set(channel, new Set());
          }
          CHANNEL_SUBSCRIBERS.get(channel).add(session);
          ws.send(JSON.stringify({ type: 'subscribed', channel }));
        } else if (msg.type === 'unsubscribe') {
          const channel = msg.channel;
          if (!channel) return;
          session.channels.delete(channel);
          const subs = CHANNEL_SUBSCRIBERS.get(channel);
          if (subs) {
            subs.delete(session);
            if (subs.size === 0) CHANNEL_SUBSCRIBERS.delete(channel);
          }
          ws.send(JSON.stringify({ type: 'unsubscribed', channel }));
        }
      } catch (err) {
        logger.error('websocket_message_error', { error: err.message });
      }
    });

    ws.on('close', () => {
      WS_CLIENT_SESSIONS.delete(session);
      for (const channel of session.channels) {
        const subs = CHANNEL_SUBSCRIBERS.get(channel);
        if (subs) {
          subs.delete(session);
          if (subs.size === 0) CHANNEL_SUBSCRIBERS.delete(channel);
        }
      }
    });

    ws.on('error', (err) => {
      logger.error('websocket_session_error', { error: err.message });
    });

    ws.send(JSON.stringify({ type: 'connected', sessionId: session.sessionId, userId: null }));
  });

  logger.info('websocket_listening', { path: '/ws/support' });
  return wssInstance;
}

export function registerWsClient(clientSocket = {}) {
  const sessionId = `ws_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const session = {
    sessionId,
    socket: clientSocket,
    connectedAt: Date.now(),
    lastHeartbeat: Date.now(),
  };

  WS_CLIENT_SESSIONS.add(session);
  return session;
}

export function broadcastWsMessage(eventType, payload = {}) {
  const event = {
    eventId: `evt_${Date.now()}`,
    eventType,
    payload,
    timestamp: Date.now(),
  };

  EVENT_QUEUE_BUFFER.push(event);
  if (EVENT_QUEUE_BUFFER.length > 200) EVENT_QUEUE_BUFFER.shift();

  let activeCount = 0;

  // Broadcast to global sessions
  for (const session of WS_CLIENT_SESSIONS) {
    if (session.socket && session.socket.readyState === 1) { // 1 = OPEN
      try {
        session.socket.send(JSON.stringify(event));
        activeCount++;
      } catch (ignored) {}
    }
  }

  // Broadcast to channel subscribers if conversation event
  if (payload.conversationId) {
    const channelId = `support:conversation:${payload.conversationId}`;
    const channelSubs = CHANNEL_SUBSCRIBERS.get(channelId);
    if (channelSubs) {
      for (const session of channelSubs) {
        if (session.socket && session.socket.readyState === 1) {
          try {
            session.socket.send(JSON.stringify(event));
          } catch (ignored) {}
        }
      }
    }
  }

  return { broadcastedCount: activeCount, totalClients: WS_CLIENT_SESSIONS.size, event };
}

export function broadcastOddsSnapshot(matchId, snapshot) {
  if (!matchId || !snapshot) return { broadcastedCount: 0 };
  return sendJsonToChannel(`odds:match:${matchId}`, {
    eventId: `evt_odds_${Date.now()}`,
    eventType: 'odds.updated',
    matchId,
    payload: snapshot,
    timestamp: Date.now(),
  });
}

export function broadcastScoresLive(payload) {
  return sendJsonToChannel('scores:live', {
    eventId: `evt_scores_${Date.now()}`,
    eventType: 'scores.updated',
    payload,
    timestamp: Date.now(),
  });
}

export function broadcastScoreMatch(matchId, match) {
  if (!matchId || !match) return { broadcastedCount: 0 };
  return sendJsonToChannel(`scores:match:${matchId}`, {
    eventId: `evt_scores_${matchId}_${Date.now()}`,
    eventType: 'scores.updated',
    matchId,
    payload: { match },
    timestamp: Date.now(),
  });
}

export function listSubscribedChannelIds(prefix) {
  const ids = [];
  for (const [channel, subs] of CHANNEL_SUBSCRIBERS.entries()) {
    if (!channel.startsWith(prefix)) continue;
    if (subs && subs.size > 0) ids.push(channel);
  }
  return ids;
}

function sendJsonToChannel(channelId, event) {
  const channelSubs = CHANNEL_SUBSCRIBERS.get(channelId);
  if (!channelSubs || channelSubs.size === 0) return { broadcastedCount: 0, totalClients: 0, event };
  const msg = JSON.stringify(event);
  let activeCount = 0;
  for (const session of channelSubs) {
    if (session.socket && session.socket.readyState === 1) {
      try {
        session.socket.send(msg);
        activeCount += 1;
      } catch {
        // drop
      }
    }
  }
  return { broadcastedCount: activeCount, totalClients: channelSubs.size, event };
}

export function getWsEngineStatus() {
  return {
    activeConnections: WS_CLIENT_SESSIONS.size,
    queuedEvents: EVENT_QUEUE_BUFFER.length,
    timestamp: Date.now(),
  };
}
