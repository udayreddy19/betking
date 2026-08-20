import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { logger } from '../../lib/logger.mjs';
import { consumeRateLimitSlot } from '../../server/middleware/rateLimiter.js';

describe('Sprint 3 ops', () => {
  it('emits JSON logs with optional correlationId', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('deposit_order_created', { correlationId: 'corr-test', userId: 'usr_1' });
    const line = spy.mock.calls[0][0];
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('deposit_order_created');
    expect(parsed.correlationId).toBe('corr-test');
    expect(parsed.userId).toBe('usr_1');
    spy.mockRestore();
  });

  it('websocket engine and HTTP bootstrap use the JSON logger', () => {
    const ws = fs.readFileSync(path.resolve(process.cwd(), 'lib/websocketEngine.mjs'), 'utf8');
    const index = fs.readFileSync(path.resolve(process.cwd(), 'server/index.js'), 'utf8');
    expect(ws).toContain("from './logger.mjs'");
    expect(index).toContain("from '../lib/logger.mjs'");
    expect(ws.includes("console.log('⚡")).toBe(false);
  });

  it('developer API rate limit uses Redis sliding-window helper, not an in-process Map', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'lib/developerPlatformEngine.mjs'), 'utf8');
    expect(src).toContain('consumeRateLimitSlot');
    expect(src).toContain("prefix: 'rl:devapi'");
    expect(src.includes('rateLimitMap')).toBe(false);
  });

  it('consumeRateLimitSlot rejects after the window fills', async () => {
    const prefix = `rl:unit_${Date.now()}_${Math.random()}`;
    const key = 'k1';
    const a = await consumeRateLimitSlot({ key, prefix, maxRequests: 2, windowSeconds: 60 });
    const b = await consumeRateLimitSlot({ key, prefix, maxRequests: 2, windowSeconds: 60 });
    const c = await consumeRateLimitSlot({ key, prefix, maxRequests: 2, windowSeconds: 60 });
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    expect(c.allowed).toBe(false);
    expect(c.remaining).toBe(0);
  });

  it('CI coverage and gated deploy are wired in production.yml', () => {
    const yml = fs.readFileSync(path.resolve(process.cwd(), '.github/workflows/production.yml'), 'utf8');
    expect(yml).toContain('npm run test:coverage');
    expect(yml).toContain('coverage-lcov');
    expect(yml).toContain('git pull --ff-only');
    expect(yml).not.toContain('--force');
    expect(yml).toContain('vars.ENABLE_VPS_DEPLOY');
    expect(yml).toContain('vars.ENABLE_E2E');
    expect(yml).toContain('npm run test:e2e');
  });
});
