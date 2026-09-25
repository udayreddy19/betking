import { describe, it, beforeEach } from 'vitest';
import assert from 'node:assert/strict';
import {
  consumeAdminMfaPendingToken,
  isAdminMfaPendingConsumed,
  _resetAdminMfaPendingConsumedForTests,
} from '../../lib/adminMfaPendingOnce.mjs';

describe('admin MFA pending one-time use', () => {
  beforeEach(() => {
    _resetAdminMfaPendingConsumedForTests();
  });

  it('marks a pending MFA token consumed after success', () => {
    const token = 'pending.mfa.token.example';
    assert.equal(isAdminMfaPendingConsumed(token), false);
    consumeAdminMfaPendingToken(token);
    assert.equal(isAdminMfaPendingConsumed(token), true);
  });

  it('does not treat a different token as consumed', () => {
    consumeAdminMfaPendingToken('token-a');
    assert.equal(isAdminMfaPendingConsumed('token-b'), false);
  });
});
