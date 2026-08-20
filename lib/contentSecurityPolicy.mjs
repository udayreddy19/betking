export function cdnAssetOrigin() {
  const raw = process.env.CDN_ASSET_ORIGIN || process.env.VITE_CDN_ASSET_ORIGIN || '';
  if (!raw || raw === '/') return '';
  return raw.replace(/\/$/, '');
}

function withCdn(directive) {
  const cdn = cdnAssetOrigin();
  return cdn ? `${directive} ${cdn}` : directive;
}

/** Report-Only CSP (Sprint 0). Tighten to enforcing after Razorpay/fonts reports are clean. */
export const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  withCdn("script-src 'self' 'unsafe-inline' https://checkout.razorpay.com"),
  withCdn("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com"),
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  withCdn("connect-src 'self' ws: wss: https://api.razorpay.com https://lumberjack.razorpay.com https://checkout.razorpay.com"),
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
  "frame-ancestors 'self'",
  "form-action 'self' https://api.razorpay.com https://checkout.razorpay.com",
].join('; ');
