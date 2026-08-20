import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { canSubscribeToChannel, isPublicLiveChannel } from '../../lib/websocketEngine.mjs';

describe('Sprint 4 public live channels', () => {
  it('treats scores and match odds as public', () => {
    expect(isPublicLiveChannel('scores:live')).toBe(true);
    expect(isPublicLiveChannel('scores:match:abc')).toBe(true);
    expect(isPublicLiveChannel('odds:match:abc')).toBe(true);
    expect(isPublicLiveChannel('support:conversation:abc')).toBe(false);
  });

  it('lets anonymous sockets subscribe to scores/odds but not support', async () => {
    const anon = { anonymousOddsOnly: true, role: 'anonymous', userId: null };
    expect(await canSubscribeToChannel(anon, 'scores:live')).toBe(true);
    expect(await canSubscribeToChannel(anon, 'odds:match:m1')).toBe(true);
    expect(await canSubscribeToChannel(anon, 'scores:match:m1')).toBe(true);
    expect(await canSubscribeToChannel(anon, 'support:conversation:c1')).toBe(false);
  });
});

describe('Sprint 4 aggregator and proxy wiring', () => {
  it('publishes aggregator ticks onto live WS channels', () => {
    const aggregator = fs.readFileSync(path.resolve(process.cwd(), 'lib/aggregator.mjs'), 'utf8');
    expect(aggregator).toContain('publishAggregatorTick');
    const broadcast = fs.readFileSync(path.resolve(process.cwd(), 'lib/liveFeedBroadcast.mjs'), 'utf8');
    expect(broadcast).toContain("broadcastScoresLive");
    expect(broadcast).toContain("odds:match:");
  });

  it('nginx upgrades /ws', () => {
    const nginx = fs.readFileSync(path.resolve(process.cwd(), 'nginx/nginx.conf'), 'utf8');
    expect(nginx).toContain('location /ws');
    expect(nginx).toContain('proxy_set_header Upgrade $http_upgrade');
    expect(nginx).toContain('Connection "Upgrade"');
  });

  it('frontend prefers the shared live socket over ad-hoc WebSockets', () => {
    const ctx = fs.readFileSync(path.resolve(process.cwd(), 'src/context/LiveSportsContext.jsx'), 'utf8');
    expect(ctx).toContain("subscribeLiveChannel('scores:live'");
    expect(ctx).toContain('LIVE_SCORES_WS_FALLBACK_POLL_MS');

    const sports = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/Sports/Sports.jsx'), 'utf8');
    expect(sports).toContain('subscribeLiveChannel(`odds:match:${matchId}`');
    expect(sports.includes('new WebSocket')).toBe(false);

    const modal = fs.readFileSync(path.resolve(process.cwd(), 'src/components/MatchDetailModal/MatchDetailModal.jsx'), 'utf8');
    expect(modal).toContain('subscribeLiveChannel(`odds:match:${matchId}`');
  });
});
