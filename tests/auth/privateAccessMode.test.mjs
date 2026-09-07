import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPrivateAccessMode,
  isRegistrationEnabled,
  isPrivateAccessAllowed,
  isAuthorizedUser,
  isAuthorizedAdmin,
} from '../../lib/privateAccessConfig.mjs';

test('ODDSYRA — PRIVATE ACCESS MODE & ACCESS CONTROL TESTS', async (t) => {
  await t.test('1. Feature flags default to private access mode and registration disabled', () => {
    assert.strictEqual(isPrivateAccessMode(), true, 'isPrivateAccessMode should default to true');
    assert.strictEqual(isRegistrationEnabled(), false, 'isRegistrationEnabled should default to false');
  });

  await t.test('2. Authorized user matching for iudayreddy19@gmail and iudayreddy19@gmail.com', () => {
    assert.strictEqual(isAuthorizedUser('iudayreddy19@gmail.com'), true);
    assert.strictEqual(isAuthorizedUser('iudayreddy19@gmail'), true);
    assert.strictEqual(isAuthorizedUser('IUDAYREDDY19@GMAIL.COM'), true);
    assert.strictEqual(isPrivateAccessAllowed('iudayreddy19@gmail.com'), true);
  });

  await t.test('3. Authorized admin matching for admin@odssyra.com and admin@oddsyra.com', () => {
    assert.strictEqual(isAuthorizedAdmin('admin@odssyra.com'), true);
    assert.strictEqual(isAuthorizedAdmin('admin@oddsyra.com'), true);
    assert.strictEqual(isAuthorizedAdmin('ADMIN@ODDSYRA.COM'), true);
    assert.strictEqual(isPrivateAccessAllowed('admin@oddsyra.com'), true);
  });

  await t.test('4. Non-authorized accounts are rejected under private access mode', () => {
    assert.strictEqual(isAuthorizedUser('mouli5b5@gmail.com'), false);
    assert.strictEqual(isAuthorizedAdmin('mouli5b5@gmail.com'), false);
    assert.strictEqual(isPrivateAccessAllowed('mouli5b5@gmail.com'), false);

    assert.strictEqual(isAuthorizedUser('attacker@test.com'), false);
    assert.strictEqual(isPrivateAccessAllowed('attacker@test.com'), false);

    assert.strictEqual(isAuthorizedUser('randomuser@gmail.com'), false);
    assert.strictEqual(isPrivateAccessAllowed('randomuser@gmail.com'), false);
  });

  await t.test('5. Non-admin accounts attempting admin authorization are rejected', () => {
    assert.strictEqual(isAuthorizedAdmin('iudayreddy19@gmail.com'), false);
  });
});
