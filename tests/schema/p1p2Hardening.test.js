import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('P1/P2 hardening source contracts', () => {
  it('admin support client stays on /api/admin/* aliases', () => {
    const src = readFileSync(join(root, 'src/pages/Admin/domains/SupportDomainView.jsx'), 'utf8');
    expect(src).not.toMatch('/v1/admin/support');
    expect(src).toMatch("get('/support/tickets/metrics')");
    expect(src).toMatch('/support/live-chats');
  });

  it('does not insert synthetic @oddsyra.local users', () => {
    const src = readFileSync(join(root, 'lib/supportEngine.mjs'), 'utf8');
    expect(src).not.toMatch(/INSERT INTO users[\s\S]{0,200}@oddsyra\.local/);
  });

  it('does not pin the global viewport to maximum-scale=1', () => {
    const src = readFileSync(join(root, 'index.html'), 'utf8');
    expect(src).not.toMatch(/maximum-scale\s*=\s*1/);
  });

  it('does not block first paint on Razorpay checkout.js', () => {
    const src = readFileSync(join(root, 'index.html'), 'utf8');
    expect(src).not.toMatch(/<script[^>]+checkout\.razorpay\.com/);
  });

  it('uses Redis-backed consumeRateLimitSlot for support tickets', () => {
    const src = readFileSync(join(root, 'server/routes/support.js'), 'utf8');
    expect(src).toMatch('consumeRateLimitSlot');
    expect(src).not.toMatch('const rateLimitMap = new Map');
  });
});
