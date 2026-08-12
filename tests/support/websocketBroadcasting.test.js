import { describe, it, expect } from 'vitest';
import { broadcastWsMessage, getWsEngineStatus } from '../../lib/websocketEngine.mjs';

describe('Phase 8 WebSocket Broadcasting Engine Tests', () => {
  it('should format event structure correctly and maintain queue buffer', async () => {
    const res = await broadcastWsMessage('support.message.created', {
      conversationId: 'conv_ws_test',
      text: 'Hello realtime world',
    });

    expect(res.event.eventType).toBe('support.message.created');
    expect(res.event.payload.conversationId).toBe('conv_ws_test');
    expect(res.event.eventId).toBeDefined();

    const status = getWsEngineStatus();
    expect(status.queuedEvents).toBeGreaterThan(0);
  });
});
