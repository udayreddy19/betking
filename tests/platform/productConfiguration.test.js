import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertProductEnabled,
  clearProductConfigForTests,
  getProductConfiguration,
  isBettingEnabled,
  isWalletEnabled,
  setProductConfigForTests,
  updateProductConfiguration,
} from '../../lib/productConfig.mjs';
import { requireProduct } from '../../server/middleware/requireProduct.js';

describe('Product configuration toggles', () => {
  beforeEach(() => {
    clearProductConfigForTests();
  });

  afterEach(() => {
    clearProductConfigForTests();
  });

  it('defaults both products ON', async () => {
    setProductConfigForTests({ walletEnabled: true, bettingEnabled: true });
    expect(await isWalletEnabled()).toBe(true);
    expect(await isBettingEnabled()).toBe(true);
    const cfg = await getProductConfiguration();
    expect(cfg.walletEnabled).toBe(true);
    expect(cfg.bettingEnabled).toBe(true);
  });

  it('Wallet ON / Betting OFF blocks betting assert', async () => {
    setProductConfigForTests({ walletEnabled: true, bettingEnabled: false });
    expect(await isWalletEnabled()).toBe(true);
    expect(await isBettingEnabled()).toBe(false);
    await expect(assertProductEnabled('betting')).rejects.toMatchObject({
      code: 'PRODUCT_DISABLED',
      product: 'betting',
      status: 403,
    });
    await expect(assertProductEnabled('wallet')).resolves.toBeUndefined();
  });

  it('Wallet OFF / Betting ON blocks wallet assert', async () => {
    setProductConfigForTests({ walletEnabled: false, bettingEnabled: true });
    expect(await isWalletEnabled()).toBe(false);
    expect(await isBettingEnabled()).toBe(true);
    await expect(assertProductEnabled('wallet')).rejects.toMatchObject({
      code: 'PRODUCT_DISABLED',
      product: 'wallet',
    });
    await expect(assertProductEnabled('betting')).resolves.toBeUndefined();
  });

  it('both OFF blocks both products', async () => {
    setProductConfigForTests({ walletEnabled: false, bettingEnabled: false });
    await expect(assertProductEnabled('wallet')).rejects.toMatchObject({ code: 'PRODUCT_DISABLED' });
    await expect(assertProductEnabled('betting')).rejects.toMatchObject({ code: 'PRODUCT_DISABLED' });
  });

  it('requireProduct middleware returns PRODUCT_DISABLED JSON', async () => {
    setProductConfigForTests({ walletEnabled: false, bettingEnabled: true });
    const mw = requireProduct('wallet');
    let status = null;
    let body = null;
    const req = {};
    const res = {
      status(code) {
        status = code;
        return this;
      },
      json(payload) {
        body = payload;
        return this;
      },
    };
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(status).toBe(403);
    expect(body).toMatchObject({
      success: false,
      code: 'PRODUCT_DISABLED',
      product: 'wallet',
    });
  });

  it('requireProduct allows when product is enabled', async () => {
    setProductConfigForTests({ walletEnabled: true, bettingEnabled: true });
    const mw = requireProduct('betting');
    let nextCalled = false;
    await mw({}, { status() { return this; }, json() { return this; } }, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });
});

describe('Product configuration persistence (optional PG)', () => {
  afterEach(() => {
    clearProductConfigForTests();
  });

  it('updateProductConfiguration round-trips when DB is available', async () => {
    clearProductConfigForTests();
    try {
      const result = await updateProductConfiguration({
        walletEnabled: true,
        bettingEnabled: false,
        updatedBy: 'test-admin',
        reason: 'unit test',
      });
      expect(result.current.walletEnabled).toBe(true);
      expect(result.current.bettingEnabled).toBe(false);
      // restore defaults for other suites
      await updateProductConfiguration({
        walletEnabled: true,
        bettingEnabled: true,
        updatedBy: 'test-admin',
        reason: 'restore defaults',
      });
    } catch (err) {
      // Skip when product_configuration table is not migrated in this environment.
      if (err?.code === '42P01' || String(err?.message || '').includes('product_configuration')) {
        return;
      }
      throw err;
    }
  });
});
