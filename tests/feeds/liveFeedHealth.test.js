import { describe, it, expect } from 'vitest';
import { classifyLiveFeedHealth } from '../../lib/liveFeedHealth.mjs';

describe('classifyLiveFeedHealth', () => {
  it('returns ALL_PROVIDERS_FAILED only when every real provider is error', () => {
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
    expect(err.message).toMatch(/unavailable/i);
  });

  it('does not treat a quiet-but-healthy provider as a total outage', () => {
    expect(classifyLiveFeedHealth({
      tencric: 'ok',
      crex: 'error',
      cricbuzz: 'error',
      fancode: 'error',
      espn: 'error',
      flashscore: 'error',
      cricketguru: 'error',
      cricketliveline: 'error',
    })).toBeNull();
  });
});
