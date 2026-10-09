/**
 * Product access guard — server-side enforcement of Wallet / Betting toggles.
 * Admin routes must NOT use this middleware.
 */

import {
  assertProductEnabled,
  getProductConfiguration,
} from '../../lib/productConfig.mjs';

/**
 * @param {'wallet'|'betting'} product
 */
export function requireProduct(product) {
  return async function requireProductMiddleware(req, res, next) {
    try {
      await assertProductEnabled(product);
      return next();
    } catch (err) {
      if (err?.code === 'PRODUCT_DISABLED') {
        return res.status(err.status || 403).json({
          success: false,
          code: 'PRODUCT_DISABLED',
          product: err.product || product,
          message: err.message || 'This product is currently unavailable.',
        });
      }
      return next(err);
    }
  };
}

/** Attach product config to req for handlers that need it (non-blocking). */
export async function attachProductConfig(req, _res, next) {
  try {
    req.productConfig = await getProductConfiguration();
  } catch {
    req.productConfig = { walletEnabled: true, bettingEnabled: true };
  }
  next();
}
