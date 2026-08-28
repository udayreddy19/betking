import { describe, it, expect } from 'vitest';
import { verifyCrashMultiplier, verifyDiceRoll } from '../../src/utils/provablyFairCalculator';

describe('Provably Fair Cryptographic Calculator', () => {
  it('computes deterministic crash multipliers', async () => {
    const serverSeed = 'sample_server_seed_12345';
    const clientSeed = 'user_client_seed_abc';
    const res = await verifyCrashMultiplier(serverSeed, clientSeed, 1);

    expect(res.multiplier).toBeGreaterThanOrEqual(1.00);
    expect(typeof res.hash).toBe('string');
    expect(res.hash.length).toBe(64);
  });

  it('computes deterministic dice rolls between 0.00 and 99.99', async () => {
    const serverSeed = 'sample_server_seed_12345';
    const clientSeed = 'user_client_seed_abc';
    const res = await verifyDiceRoll(serverSeed, clientSeed, 5);

    expect(res.roll).toBeGreaterThanOrEqual(0.00);
    expect(res.roll).toBeLessThanOrEqual(99.99);
  });
});
