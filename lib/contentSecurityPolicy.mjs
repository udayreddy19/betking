export function cdnAssetOrigin() {
  const raw = process.env.CDN_ASSET_ORIGIN || process.env.VITE_CDN_ASSET_ORIGIN || '';
  if (!raw || raw === '/') return '';
  return raw.replace(/\/$/, '');
}

function withCdn(directive) {
  const cdn = cdnAssetOrigin();
  return cdn ? `${directive} ${cdn}` : directive;
}

/** Enforced CSP policy for production (Priority 28). */
export const CSP_ENFORCED = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  withCdn("script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://sdk.cashfree.com"),
  withCdn("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com"),
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  withCdn("connect-src 'self' ws: wss: https://api.razorpay.com https://lumberjack.razorpay.com https://checkout.razorpay.com https://api.cashfree.com https://sandbox.cashfree.com"),
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://api.cashfree.com https://sandbox.cashfree.com",
  "frame-ancestors 'self'",
  "form-action 'self' https://api.razorpay.com https://checkout.razorpay.com https://api.cashfree.com https://sandbox.cashfree.com",
].join('; ');

/** Report-Only legacy alias. */
export const CSP_REPORT_ONLY = CSP_ENFORCED;

