/**
 * Decoupled Business Event Bus Architecture
 * Separates internal domain business events from WebSocket client transport.
 */

class EventBus {
  constructor() {
    this.topics = new Map(); // topicName -> Set<SubscriberFunction>
    this.eventLog = [];
    this.sequences = new Map(); // matchId -> sequenceCount
  }

  /** Subscribe to a domain topic */
  subscribe(topic, handler) {
    if (!this.topics.has(topic)) {
      this.topics.set(topic, new Set());
    }
    this.topics.get(topic).add(handler);

    return () => {
      const set = this.topics.get(topic);
      if (set) set.delete(handler);
    };
  }

  /** Publish event to topic */
  publish(topic, payload = {}, matchId = 'global') {
    const nextSeq = (this.sequences.get(matchId) || 0) + 1;
    this.sequences.set(matchId, nextSeq);

    const event = {
      eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      eventType: topic,
      matchId,
      sequence: nextSeq,
      timestamp: new Date().toISOString(),
      source: payload.source || 'application',
      version: payload.version || 1,
      payload,
    };

    this.eventLog.push(event);
    if (this.eventLog.length > 1000) this.eventLog.shift();

    const handlers = this.topics.get(topic);
    if (handlers) {
      for (const fn of handlers) {
        try {
          fn(event);
        } catch (err) {
          console.error(`[EVENT_BUS] Subscriber error for topic '${topic}':`, err);
        }
      }
    }

    return event;
  }

  getEventHistory(matchId = null) {
    if (matchId) {
      return this.eventLog.filter((e) => e.matchId === matchId);
    }
    return this.eventLog.slice(-100);
  }

  clear() {
    this.topics.clear();
    this.eventLog = [];
    this.sequences.clear();
  }
}

export const eventBus = new EventBus();
