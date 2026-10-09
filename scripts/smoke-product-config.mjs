/**
 * Lightweight smoke test for product toggles (no vitest required).
 * Run: node scripts/smoke-product-config.mjs
 */
import {
  assertProductEnabled,
  clearProductConfigForTests,
  isBettingEnabled,
  isWalletEnabled,
  setProductConfigForTests,
} from '../lib/productConfig.mjs';
import { requireProduct } from '../server/middleware/requireProduct.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function run() {
  clearProductConfigForTests();

  setProductConfigForTests({ walletEnabled: true, bettingEnabled: true });
  assert(await isWalletEnabled() === true, 'both on: wallet');
  assert(await isBettingEnabled() === true, 'both on: betting');

  setProductConfigForTests({ walletEnabled: true, bettingEnabled: false });
  assert(await isWalletEnabled() === true, 'wallet on');
  assert(await isBettingEnabled() === false, 'betting off');
  let blocked = false;
  try {
    await assertProductEnabled('betting');
  } catch (e) {
    blocked = e.code === 'PRODUCT_DISABLED';
  }
  assert(blocked, 'betting assert blocked');

  setProductConfigForTests({ walletEnabled: false, bettingEnabled: true });
  blocked = false;
  try {
    await assertProductEnabled('wallet');
  } catch (e) {
    blocked = e.code === 'PRODUCT_DISABLED';
  }
  assert(blocked, 'wallet assert blocked');

  setProductConfigForTests({ walletEnabled: false, bettingEnabled: false });
  const mw = requireProduct('betting');
  let status = 0;
  let body = null;
  await mw({}, {
    status(c) { status = c; return this; },
    json(p) { body = p; return this; },
  }, () => {});
  assert(status === 403 && body?.code === 'PRODUCT_DISABLED', 'middleware blocks');

  clearProductConfigForTests();
  console.log('smoke-product-config: PASS (4 combinations + middleware)');
}

run().catch((err) => {
  console.error('smoke-product-config: FAIL', err);
  process.exit(1);
});
