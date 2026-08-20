import crypto from 'crypto';
import { timingSafeEqualStrings } from './cryptoUtils.mjs';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(byteLength = 20) {
  return toBase32(crypto.randomBytes(byteLength));
}

function toBase32(buf) {
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function fromBase32(str) {
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const c of clean) {
    const idx = BASE32.indexOf(c);
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secret, counter, digits = 6) {
  const key = fromBase32(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24)
    | (hmac[offset + 1] << 16)
    | (hmac[offset + 2] << 8)
    | hmac[offset + 3];
  return String(bin % (10 ** digits)).padStart(digits, '0');
}

export function generateTotp(secret, { step = 30, digits = 6, at = Date.now() } = {}) {
  const counter = Math.floor(at / 1000 / step);
  return hotp(secret, counter, digits);
}

export function verifyTotp(secret, code, { window = 1, step = 30, digits = 6, at = Date.now() } = {}) {
  const expected = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(expected) || !secret) return false;
  for (let w = -window; w <= window; w += 1) {
    const candidate = generateTotp(secret, { step, digits, at: at + w * step * 1000 });
    if (timingSafeEqualStrings(candidate, expected)) return true;
  }
  return false;
}

export function totpOtpauthUrl({ secret, account, issuer = 'OddsYra Admin' }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    digits: '6',
    period: '30',
    algorithm: 'SHA1',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
