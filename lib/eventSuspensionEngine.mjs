/**
 * Event-Triggered Market Suspension Engine & Latency Tracker
 * Instantly suspends affected betting markets upon receiving live match events (WICKET, GOAL, RED_CARD, VAR).
 * Measures and records suspension latency against the < 500 ms roadmap SLA.
 */

import { marketSuspensionEngine } from './marketSuspensionEngine.mjs';
import { broadcastWsMessage } from './websocketEngine.mjs';

export class EventSuspensionEngine {
  /**
   * Process a live match event and suspend affected markets
   * Measures precise execution latency in milliseconds
   */
  async handleMatchEvent(canonicalMatchId, eventType, affectedMarketIds = []) {
    const eventReceivedAt = Date.now();
    const suspensionStartedAt = Date.now();

    const causeReason = `EVENT_${String(eventType).toUpperCase()}`;

    // Suspend all target markets
    const suspensionPromises = affectedMarketIds.map(marketId =>
      marketSuspensionEngine.addSuspensionCause(marketId, causeReason, 'EVENT', 'LIVE_FEED')
    );

    await Promise.all(suspensionPromises);

    const suspensionPublishedAt = Date.now();
    const suspensionLatencyMs = suspensionPublishedAt - eventReceivedAt;

    // Broadcast WebSocket notification to clients
    broadcastWsMessage('market.suspended', {
      canonicalMatchId,
      eventType,
      causeReason,
      affectedMarketIds,
      eventReceivedAt: new Date(eventReceivedAt).toISOString(),
      suspensionPublishedAt: new Date(suspensionPublishedAt).toISOString(),
      suspensionLatencyMs,
    });

    return {
      canonicalMatchId,
      eventType,
      causeReason,
      affectedMarketIds,
      eventReceivedAt,
      suspensionStartedAt,
      suspensionPublishedAt,
      suspensionLatencyMs,
      targetMet: suspensionLatencyMs < 500,
    };
  }
}

export const eventSuspensionEngine = new EventSuspensionEngine();
