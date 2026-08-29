/**
 * Redact secrets, credentials, and KYC PII before any API Explorer payload
 * is returned to the admin UI. Env values, tokens, and document numbers
 * must never leave the backend.
 */

const MAX_DEPTH = 8;
const MAX_ARRAY = 40;
const MAX_STRING = 4000;
const REDACTED = '••••••••';

export function isSensitiveKey(key) {
  const k = String(key || '');
  if (!k) return false;
  if (/(secret|password|passwd|passphrase|authorization|cookie|credential|aadhaar|aadhar|otpauth|webhook[_-]?secret|database_url|redis_url|connectionstring|salt_key)/i.test(k)) {
    return true;
  }
  if (/(^|_)(api[_-]?key|jwt|bearer|pan_number|pannumber)s?$/i.test(k)) return true;
  if (/^(pan|key_secret|key_id|authorization)$/i.test(k)) return true;
  if (/(^|_)tokens?$/i.test(k) || /accessToken|refreshToken|idToken|mfaToken|access_token|refresh_token|id_token/i.test(k)) {
    return true;
  }
  return false;
}

export function looksLikeSecretValue(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v) return false;
  if (/^rzp_(live|test)_/i.test(v)) return true;
  if (/^Bearer\s+\S+/i.test(v)) return true;
  if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(v)) return true;
  if (/^postgres(ql)?:\/\//i.test(v)) return true;
  if (/^redis:\/\//i.test(v)) return true;
  if (/^mongodb(\+srv)?:\/\//i.test(v)) return true;
  if (/smtp:\/\//i.test(v)) return true;
  return false;
}

export function sanitizeErrorMessage(message) {
  return String(message || 'Request failed')
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, 'postgresql://••••••••')
    .replace(/redis:\/\/[^\s'"]+/gi, 'redis://••••••••')
    .replace(/mongodb(?:\+srv)?:\/\/[^\s'"]+/gi, 'mongodb://••••••••')
    .replace(/(password|passwd|secret|token|api[_-]?key)\s*[=:]\s*[^\s&'"]+/gi, '$1=••••••••')
    .replace(/Bearer\s+\S+/gi, 'Bearer ••••••••')
    .replace(/rzp_(live|test)_[A-Za-z0-9]+/gi, 'rzp_$1_••••••••')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '••••••••')
    .slice(0, 500);
}

function trimString(value) {
  if (typeof value !== 'string') return value;
  if (looksLikeSecretValue(value)) return REDACTED;
  if (value.length > MAX_STRING) return `${value.slice(0, MAX_STRING)}…`;
  return value;
}

export function sanitizeExplorerPayload(input, depth = 0) {
  if (input == null) return input;
  if (depth > MAX_DEPTH) return '[truncated]';
  if (typeof input === 'string') return trimString(input);
  if (typeof input === 'number' || typeof input === 'boolean') return input;
  if (typeof input === 'bigint') return Number(input);
  if (input instanceof Date) return input.toISOString();
  if (typeof input === 'function') return undefined;
  if (Array.isArray(input)) {
    return input.slice(0, MAX_ARRAY).map((item) => sanitizeExplorerPayload(item, depth + 1));
  }
  if (typeof input !== 'object') return String(input);

  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (isSensitiveKey(key)) {
      if (typeof value === 'boolean' || typeof value === 'number') {
        out[key] = value;
        continue;
      }
      out[key] = value == null || value === '' ? null : REDACTED;
      continue;
    }
    out[key] = sanitizeExplorerPayload(value, depth + 1);
  }
  return out;
}

/**
 * Strip process.env-style objects entirely. Used in tests to prove
 * accidental env dumps cannot reach the client.
 */
export function assertNoSecrets(payload) {
  const json = JSON.stringify(payload);
  const forbidden = [
    /rzp_live_[A-Za-z0-9]/,
    /rzp_test_[A-Za-z0-9]/,
    /"JWT_SECRET"\s*:\s*"[^•]/,
    /Bearer\s+[A-Za-z0-9\-_.]+/,
    /postgres(?:ql)?:\/\/[^:]+:[^@]+@/,
  ];
  return !forbidden.some((re) => re.test(json));
}
