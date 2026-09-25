import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import {
  tryConsumeAdminMfaPendingToken,
  isAdminMfaPendingConsumed,
  isMultiInstanceMode,
  MfaInfraUnavailableError,
  _resetAdminMfaPendingConsumedForTests,
  _resetAdminMfaPendingRedisForTests,
} from '../../lib/adminMfaPendingOnce.mjs';

describe('Pass 8 multi-instance MFA fail-safe', () => {
  const prev = process.env.MULTI_INSTANCE;

  afterEach(() => {
    if (prev === undefined) delete process.env.MULTI_INSTANCE;
    else process.env.MULTI_INSTANCE = prev;
    _resetAdminMfaPendingConsumedForTests();
  });

  it('detects MULTI_INSTANCE=true', () => {
    process.env.MULTI_INSTANCE = 'true';
    assert.equal(isMultiInstanceMode(), true);
  });

  it('allows redis-backed consume when multi-instance and redis healthy', async () => {
    process.env.MULTI_INSTANCE = 'true';
    const token = `p8.ok.${Date.now()}`;
    await _resetAdminMfaPendingRedisForTests(token);
    assert.equal(await tryConsumeAdminMfaPendingToken(token), true);
    assert.equal(await tryConsumeAdminMfaPendingToken(token), false);
  });

  it('concurrent consume still exactly one under MULTI_INSTANCE', async () => {
    process.env.MULTI_INSTANCE = 'true';
    const token = `p8.race.${Date.now()}`;
    await _resetAdminMfaPendingRedisForTests(token);
    _resetAdminMfaPendingConsumedForTests();
    const results = await Promise.all([
      tryConsumeAdminMfaPendingToken(token),
      tryConsumeAdminMfaPendingToken(token),
      tryConsumeAdminMfaPendingToken(token),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
  });
});
