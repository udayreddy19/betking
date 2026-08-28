import { describe, it, expect } from 'vitest';
import { LIMIT_INCREASE_COOLDOWN_HOURS } from '../../lib/responsibleGamingEngine.mjs';

describe('Compliance — Responsible Gaming & Player Safety', () => {
  it('enforces 24-hour cooldown constant on limit increases', () => {
    expect(LIMIT_INCREASE_COOLDOWN_HOURS).toBe(24);
  });
});
