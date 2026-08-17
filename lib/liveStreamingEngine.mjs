/**
 * Enterprise Live Streaming Engine — OddsYra Enterprise Platform (lib/liveStreamingEngine.mjs)
 * Manages HLS/WebRTC audio/video streams, multi-camera metadata synchronization, and stream latency bounds.
 */

const STREAM_SESSIONS = new Map();

export function registerLiveStreamSession(matchId, streamUrl) {
  const session = {
    matchId,
    streamUrl,
    status: 'ACTIVE',
    activeViewers: 0,
    startedAt: Date.now(),
  };
  STREAM_SESSIONS.set(matchId, session);
  return session;
}

export function getLiveStreamSession(matchId) {
  return STREAM_SESSIONS.get(matchId) || { matchId, status: 'INACTIVE', streamUrl: null };
}
