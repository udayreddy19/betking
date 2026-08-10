/**
 * Authoritative Canonical Match State Engine
 * Enforces match state isolation by matchId, version consistency, and state synchronization.
 * ZERO HARDCODED SPORTS DATA.
 */

import { sportsDataRegistry } from './sportsDataRegistry.mjs';
import { validateMatchStateTransition, sanitizeMatchState } from './matchStateValidator.mjs';

class CanonicalMatchStateEngine {
  constructor() {
    this.states = new Map(); // matchId -> Authoritative Match State Object
    this.listeners = new Set();
  }

  /** Retrieve authoritative match state by matchId */
  getMatchState(matchId) {
    if (!matchId) return null;
    const canonicalId = sportsDataRegistry.resolveMatchId(matchId) || matchId;
    return this.states.get(canonicalId) || this.states.get(matchId) || null;
  }

  /** Update or initialize authoritative match state */
  updateMatchState(matchId, rawMatch, source = 'provider') {
    if (!matchId || !rawMatch) return null;
    const canonicalId = sportsDataRegistry.resolveMatchId(matchId) || matchId;

    const currentState = this.states.get(canonicalId);
    const sanitized = sanitizeMatchState(rawMatch);

    const validation = validateMatchStateTransition(currentState, sanitized);
    if (!validation.isValid) {
      console.warn(`[CANONICAL_MATCH_STATE] State transition warning for ${canonicalId}:`, validation.errors);
      if (validation.errors.some((e) => e.includes('Stale state version update rejected'))) {
        return currentState; // Reject stale update
      }
    }

    const nextVersion = (currentState?.matchVersion || 0) + 1;
    const nextSequence = (currentState?.eventSequence || 0) + 1;

    const authoritativeState = {
      ...currentState,
      ...sanitized,
      id: canonicalId,
      canonicalMatchId: canonicalId,
      matchVersion: nextVersion,
      eventSequence: nextSequence,
      lastUpdatedAt: new Date().toISOString(),
      provenance: {
        source,
        timestamp: new Date().toISOString(),
        confidence: 1.0,
      },
    };

    this.states.set(canonicalId, authoritativeState);
    sportsDataRegistry.registerMatch(authoritativeState, source);

    this.notifyListeners(canonicalId, authoritativeState);
    return authoritativeState;
  }

  /** Subscribe to state changes */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners(matchId, state) {
    for (const listener of this.listeners) {
      try {
        listener(matchId, state);
      } catch (err) {
        console.error('[CANONICAL_MATCH_STATE] Listener error:', err);
      }
    }
  }

  clear() {
    this.states.clear();
    this.listeners.clear();
  }
}

export const canonicalMatchStateEngine = new CanonicalMatchStateEngine();
