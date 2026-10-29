import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  buildUpiPayUri,
  isValidCollectVpa,
  isValidUtr,
  normalizeCollectVpa,
  normalizeUtr,
} from '../../lib/paymentProviders/upiCollect.mjs';

describe('UPI collect destination helpers', () => {
  it('accepts a normal VPA and rejects junk', () => {
    assert.equal(isValidCollectVpa('merchant@okhdfcbank'), true);
    assert.equal(isValidCollectVpa('OddsYra@upi'), true);
    assert.equal(isValidCollectVpa('not-an-id'), false);
    assert.equal(normalizeCollectVpa('  Merchant@OKHDFCBank  '), 'merchant@okhdfcbank');
  });

  it('builds an intent that pays the admin VPA', () => {
    const uri = buildUpiPayUri({
      vpa: 'ops@okaxis',
      payeeName: 'OddsYra',
      amountInr: 100,
      note: 'dep_test',
    });
    assert.match(uri, /^upi:\/\/pay\?/);
    assert.match(uri, /pa=ops%40okaxis/);
    assert.match(uri, /am=100\.00/);
    assert.match(uri, /tn=dep_test/);
  });

  it('normalizes UTR references', () => {
    assert.equal(normalizeUtr('  abc123xyz  '), 'ABC123XYZ');
    assert.equal(isValidUtr('424867290123'), true);
    assert.equal(isValidUtr('xx'), false);
  });
});
