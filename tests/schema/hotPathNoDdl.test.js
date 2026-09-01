import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readLib(name) {
  return readFileSync(join(root, 'lib', name), 'utf8');
}

function sliceFn(src, name) {
  const start = src.indexOf(`export async function ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = src.indexOf('\nexport ', start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

describe('money-path schema safety', () => {
  it('does not ALTER promotions inside the deposit-freebet grant transaction', () => {
    const fn = sliceFn(readLib('depositFreebetEngine.mjs'), 'tryGrantDepositFreebet');
    expect(fn).not.toMatch(/ALTER TABLE/);
  });

  it('does not expire spin grants from GET /me', () => {
    const src = readFileSync(join(root, 'server/auth/authService.js'), 'utf8');
    const fn = sliceFn(src, 'getMe');
    expect(fn).not.toMatch(/refreshSpinGrantsForUser/);
    expect(fn).not.toMatch(/expireSpinGrants/);
  });

  it('does not run schema ensure on the bet placement critical path', () => {
    const src = readLib('betPlacementEngine.mjs');
    expect(src).not.toMatch(/ensureDiscreteRewardSchema/);
    expect(src).not.toMatch(/ensureVipPointsSchema/);
    expect(src).not.toMatch(/ensureSpinGrantSchema/);
  });

  it('getActiveSpinGrantSummary is a read', () => {
    const fn = sliceFn(readLib('spinGrantEngine.mjs'), 'getActiveSpinGrantSummary');
    expect(fn).not.toMatch(/expireSpinGrants/);
    expect(fn).not.toMatch(/ensureSpinGrantSchema/);
    expect(fn).not.toMatch(/FOR UPDATE/);
  });
});
