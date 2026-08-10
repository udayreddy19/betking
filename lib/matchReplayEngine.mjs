/**
 * Match Replay Engine — Reconstructs matches from historical event logs.
 * Supports Play, Pause, Speed Control, and Event-by-Event step progression.
 */

export class MatchReplaySession {
  constructor(matchId, events = []) {
    this.matchId = matchId;
    this.events = events;
    this.currentIndex = 0;
    this.isPlaying = false;
    this.speed = 1.0;
    this.timer = null;
  }

  play(onStep) {
    if (this.isPlaying) return;
    this.isPlaying = true;

    const intervalMs = Math.max(200, 1000 / this.speed);
    this.timer = setInterval(() => {
      if (this.currentIndex >= this.events.length) {
        this.pause();
        return;
      }
      const event = this.events[this.currentIndex];
      this.currentIndex += 1;
      if (typeof onStep === 'function') onStep(event, this.currentIndex, this.events.length);
    }, intervalMs);
  }

  pause() {
    this.isPlaying = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  reset() {
    this.pause();
    this.currentIndex = 0;
  }

  stepForward() {
    if (this.currentIndex < this.events.length) {
      const event = this.events[this.currentIndex];
      this.currentIndex += 1;
      return event;
    }
    return null;
  }
}

class MatchReplayEngine {
  constructor() {
    this.sessions = new Map();
  }

  createSession(matchId, events = []) {
    const session = new MatchReplaySession(matchId, events);
    this.sessions.set(matchId, session);
    return session;
  }

  getSession(matchId) {
    return this.sessions.get(matchId) || null;
  }
}

export const matchReplayEngine = new MatchReplayEngine();
