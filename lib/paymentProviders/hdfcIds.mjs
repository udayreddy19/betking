import crypto from 'crypto';

/** HDFC SmartGateway merchant order_id: < 21 chars, alphanumeric, no specials, non-sequential. */
export const HDFC_ORDER_ID_MAX = 20;

export function hdfcOrderId() {
  return crypto.randomBytes(10).toString('hex').toUpperCase();
}

export function isValidHdfcOrderId(id) {
  const s = String(id || '');
  return s.length > 0 && s.length <= HDFC_ORDER_ID_MAX && /^[A-Z0-9]+$/.test(s);
}

/** Stable unique customer_id per buyer. Not reused across customers. */
export function hdfcCustomerId(userKey) {
  const digest = crypto.createHash('sha256').update(`vexqora:${userKey || ''}`).digest('hex').toUpperCase();
  return `C${digest.slice(0, 19)}`;
}
