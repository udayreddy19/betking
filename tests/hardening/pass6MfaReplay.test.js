import { describe, it, beforeEach } from 'vitest';
import assert from 'node:assert/strict';
import {
  tryConsumeAdminMfaPendingToken,
  isAdminMfaPendingConsumed,
  _resetAdminMfaPendingConsumedForTests,
  _resetAdminMfaPendingRedisForTests,
} from '../../lib/adminMfaPendingOnce.mjs';

describe('admin MFA pending one-time use (multi-instance)', () => {
  beforeEach(() => {
    _resetAdminMfaPendingConsumedForTests();
  });

  it('marks a pending MFA token consumed after success', async () => {
    const token = `pending.mfa.token.${Date.now()}`;
    await _resetAdminMfaPendingRedisForTests(token);
    assert.equal(await isAdminMfaPendingConsumed(token), false);
    assert.equal(await tryConsumeAdminMfaPendingToken(token), true);
    assert.equal(await isAdminMfaPendingConsumed(token), true);
  });

  it('does not treat a different token as consumed', async () => {
    const a = `token-a.${Date.now()}`;
    const b = `token-b.${Date.now()}`;
    await _resetAdminMfaPendingRedisForTests(a);
    await _resetAdminMfaPendingRedisForTests(b);
    await tryConsumeAdminMfaPendingToken(a);
    assert.equal(await isAdminMfaPendingConsumed(b), false);
  });

  it('concurrent consume allows exactly one winner', async () => {
    const token = `concurrent.mfa.${Date.now()}`;
    await _resetAdminMfaPendingRedisForTests(token);
    _resetAdminMfaPendingConsumedForTests();
    const results = await Promise.all([
      tryConsumeAdminMfaPendingToken(token),
      tryConsumeAdminMfaPendingToken(token),
      tryConsumeAdminMfaPendingToken(token),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(results.filter((v) => !v).length, 2);
  });
});
