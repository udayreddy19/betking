import { describe, expect, it } from 'vitest';
import {
  LEGACY_PRODUCT_CACHE_KEYS,
  PRODUCT_CACHE_KEY,
  isAllProductsOffSnapshot,
  isPlatformGateExemptPath,
  isProductApiFailure,
  normalizeProductConfig,
  platformGateDecision,
  shouldCacheProductSnapshot,
} from '../../src/utils/productConfigLogic.js';

describe('normalizeProductConfig', () => {
  it('accepts walletEnabled/bettingEnabled booleans', () => {
    expect(normalizeProductConfig({ walletEnabled: true, bettingEnabled: false })).toEqual({
      walletEnabled: true,
      bettingEnabled: false,
      updatedAt: null,
    });
  });

  it('accepts legacy wallet/betting keys and truthy encodings', () => {
    const cfg = normalizeProductConfig({ wallet: 'true', betting: 1, updatedAt: 'x' });
    expect(cfg).toEqual({ walletEnabled: true, bettingEnabled: true, updatedAt: 'x' });
    expect(normalizeProductConfig({ wallet: '1', betting: '0' })).toMatchObject({
      walletEnabled: true,
      bettingEnabled: false,
    });
  });

  it('fails closed on empty / garbage payloads', () => {
    for (const bad of [null, undefined, {}, 'nope', { walletEnabled: 'yes' }]) {
      expect(normalizeProductConfig(bad)).toMatchObject({ walletEnabled: false, bettingEnabled: false });
    }
  });
});

describe('isAllProductsOffSnapshot', () => {
  it('is true only when both products are off', () => {
    expect(isAllProductsOffSnapshot({ walletEnabled: false, bettingEnabled: false })).toBe(true);
    expect(isAllProductsOffSnapshot({ walletEnabled: true, bettingEnabled: false })).toBe(false);
    expect(isAllProductsOffSnapshot({ walletEnabled: false, bettingEnabled: true })).toBe(false);
    expect(isAllProductsOffSnapshot({ walletEnabled: true, bettingEnabled: true })).toBe(false);
  });

  it('treats non-objects as "not a snapshot"', () => {
    expect(isAllProductsOffSnapshot(null)).toBe(false);
    expect(isAllProductsOffSnapshot(undefined)).toBe(false);
    expect(isAllProductsOffSnapshot('x')).toBe(false);
  });
});

describe('cache policy', () => {
  it('uses the v6 key and purges every older key', () => {
    expect(PRODUCT_CACHE_KEY).toBe('oddsyra_product_config_v6');
    expect(LEGACY_PRODUCT_CACHE_KEYS).toContain('oddsyra_product_config_v1');
    expect(LEGACY_PRODUCT_CACHE_KEYS).toContain('oddsyra_product_config_v5');
    expect(LEGACY_PRODUCT_CACHE_KEYS).not.toContain(PRODUCT_CACHE_KEY);
  });

  it('never caches all-off or failed snapshots', () => {
    expect(shouldCacheProductSnapshot({ walletEnabled: false, bettingEnabled: false })).toBe(false);
    expect(shouldCacheProductSnapshot({ walletEnabled: false, bettingEnabled: false, note: 'unavailable' })).toBe(false);
    expect(shouldCacheProductSnapshot({ walletEnabled: true, bettingEnabled: false })).toBe(true);
    expect(shouldCacheProductSnapshot({ walletEnabled: false, bettingEnabled: true })).toBe(true);
  });

  it('flags non-2xx and note:unavailable responses as API failures', () => {
    expect(isProductApiFailure({ walletEnabled: true, bettingEnabled: true }, true)).toBe(false);
    expect(isProductApiFailure({ walletEnabled: true, bettingEnabled: true }, false)).toBe(true);
    expect(isProductApiFailure({ note: 'unavailable' }, true)).toBe(true);
    expect(isProductApiFailure(null, true)).toBe(true);
  });
});

describe('PlatformGate matrix', () => {
  const base = { ready: true, loadError: false, isExempt: false };

  it.each([
    // wallet, betting, expected
    [true, true, 'allow'],
    [true, false, 'allow'], // wallet-only home
    [false, true, 'allow'], // betting-only
    [false, false, 'unavailable'],
  ])('wallet=%s betting=%s -> %s', (walletEnabled, bettingEnabled, expected) => {
    expect(platformGateDecision({ ...base, walletEnabled, bettingEnabled })).toBe(expected);
  });

  it('shows loading until ready', () => {
    expect(platformGateDecision({ ...base, ready: false, walletEnabled: true, bettingEnabled: true })).toBe('loading');
  });

  it('shows a retry state (not "disabled") when the API failed and nothing is trusted', () => {
    expect(platformGateDecision({ ...base, walletEnabled: false, bettingEnabled: false, loadError: true })).toBe('retry');
  });

  it('does not show retry when a trusted product is on', () => {
    expect(platformGateDecision({ ...base, walletEnabled: true, bettingEnabled: false, loadError: true })).toBe('allow');
  });

  it('exempt routes (admin etc.) are always allowed once ready', () => {
    expect(platformGateDecision({ ...base, walletEnabled: false, bettingEnabled: false, isExempt: true })).toBe('allow');
    expect(isPlatformGateExemptPath('/admin/products')).toBe(true);
    expect(isPlatformGateExemptPath('/terms')).toBe(true);
    expect(isPlatformGateExemptPath('/wallet')).toBe(false);
    expect(isPlatformGateExemptPath('/')).toBe(false);
  });
});

describe('VPS modes (PG review / Software Platform)', () => {
  it('PG review mode is never an "all off" snapshot and is always allowed by the gate', () => {
    const pg = { walletEnabled: true, bettingEnabled: false, pgReviewMode: true };
    expect(isAllProductsOffSnapshot({ walletEnabled: false, bettingEnabled: false, pgReviewMode: true })).toBe(false);
    expect(shouldCacheProductSnapshot(pg)).toBe(true);
    expect(platformGateDecision({
      ready: true, walletEnabled: false, bettingEnabled: false, pgReviewMode: true,
    })).toBe('allow');
  });

  it('Software Platform snapshots are cacheable even when wallet/betting are off', () => {
    expect(isAllProductsOffSnapshot({ walletEnabled: false, bettingEnabled: false, softwarePlatformEnabled: true })).toBe(false);
    expect(shouldCacheProductSnapshot({ walletEnabled: true, bettingEnabled: false, softwarePlatformEnabled: true })).toBe(true);
  });

  it('plain all-off (no PG / software) is still poisoned and never cached', () => {
    expect(shouldCacheProductSnapshot({ walletEnabled: false, bettingEnabled: false, pgReviewMode: false, softwarePlatformEnabled: false })).toBe(false);
  });

  it('company / documents / desk routes are gate-exempt like the live VPS gate', () => {
    expect(isPlatformGateExemptPath('/company/about')).toBe(true);
    expect(isPlatformGateExemptPath('/documents')).toBe(true);
    expect(isPlatformGateExemptPath('/desk')).toBe(true);
  });
});
