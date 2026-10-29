import { query } from '../../db/pg.js';
import { UPI_VPA_RE } from '../beneficiaryKycNameMatch.mjs';

export function normalizeCollectVpa(value) {
  return String(value || '').trim().toLowerCase();
}

export function isValidCollectVpa(vpa) {
  return UPI_VPA_RE.test(normalizeCollectVpa(vpa));
}

export function normalizePayeeName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 50);
  return name || 'OddsYra';
}

export function buildUpiPayUri({
  vpa,
  payeeName = 'OddsYra',
  amountInr = null,
  note = '',
} = {}) {
  const pa = normalizeCollectVpa(vpa);
  if (!pa) return '';
  const params = new URLSearchParams();
  params.set('pa', pa);
  params.set('pn', normalizePayeeName(payeeName));
  params.set('cu', 'INR');
  const am = Number(amountInr);
  if (Number.isFinite(am) && am > 0) {
    params.set('am', am.toFixed(2));
  }
  const tn = String(note || '').trim();
  if (tn) params.set('tn', tn.slice(0, 80));
  return `upi://pay?${params.toString()}`;
}

export function buildUpiAppUri(appId, upiUri) {
  if (!upiUri) return '';
  const q = upiUri.replace(/^upi:\/\/pay\?/, '');
  switch (String(appId || '').toLowerCase()) {
    case 'gpay':
      return `gpay://upi/pay?${q}`;
    case 'phonepe':
      return `phonepe://pay?${q}`;
    case 'paytm':
      return `paytmmp://pay?${q}`;
    default:
      return upiUri;
  }
}

export function parseGatewaySettings(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

export async function loadUpiCollectSettings() {
  const res = await query(
    `SELECT enabled, settings
       FROM payment_gateway_configs
      WHERE provider = 'UPI'
      LIMIT 1`,
  );
  const row = res.rows[0] || {};
  const settings = parseGatewaySettings(row.settings);
  return {
    vpa: normalizeCollectVpa(settings.vpa),
    payeeName: normalizePayeeName(settings.payeeName),
    enabled: Boolean(row.enabled),
  };
}

export async function upiUriToQrDataUrl(upiUri, { width = 280, margin = 2 } = {}) {
  if (!upiUri) return '';
  const QRCode = (await import('qrcode')).default;
  return QRCode.toDataURL(upiUri, {
    errorCorrectionLevel: 'M',
    margin,
    width,
    color: { dark: '#0b0e12', light: '#ffffff' },
  });
}

export function normalizeUtr(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

export function isValidUtr(value) {
  const utr = normalizeUtr(value);
  return /^[A-Z0-9]{6,22}$/.test(utr);
}
