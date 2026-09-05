import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { classifyLiveFeedHealth } from '../../lib/liveFeedHealth.mjs';

describe('provider outage → no fabricated odds', () => {
  it('ALL_PROVIDERS_FAILED when every provider errors', () => {
    const err = classifyLiveFeedHealth({
      tencric: 'error',
      crex: 'error',
      cricbuzz: 'error',
      fancode: 'error',
      espn: 'error',
      flashscore: 'error',
      cricketguru: 'error',
      cricketliveline: 'error',
    });
    expect(err?.code).toBe('ALL_PROVIDERS_FAILED');
  });

  it('partial outage does not declare total failure', () => {
    expect(classifyLiveFeedHealth({
      tencric: 'error',
      crex: 'ok',
      cricbuzz: 'error',
      fancode: 'error',
      espn: 'error',
      flashscore: 'error',
      cricketguru: 'error',
      cricketliveline: 'error',
    })).toBeNull();
  });
});
