/**
 * Enterprise Match Replay Engine — BetKing Enterprise Platform (lib/replayEngine.mjs)
 * Replays key match highlights (Goals, Wickets, Cards, Boundaries) and synchronized time-series events.
 */

const MATCH_REPLAY_LOGS = new Map();

export function recordHighlightEvent(matchId, event = {}) {
  let highlights = MATCH_REPLAY_LOGS.get(matchId) || [];
  highlights.push({
    id: `hl_${Date.now()}`,
    matchId,
    type: event.type || 'HIGHLIGHT',
    timestamp: Date.now(),
    videoClipUrl: event.videoClipUrl || null,
  });
  MATCH_REPLAY_LOGS.set(matchId, highlights);
  return highlights;
}

export function getMatchHighlights(matchId) {
  return MATCH_REPLAY_LOGS.get(matchId) || [];
}
