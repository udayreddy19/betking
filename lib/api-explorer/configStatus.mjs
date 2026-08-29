/**
 * Report whether configuration exists WITHOUT returning values.
 */

export const CONFIG = {
  CONFIGURED: 'CONFIGURED',
  MISSING: 'MISSING',
  TEST_MODE: 'TEST_MODE',
  DEVELOPMENT: 'DEVELOPMENT',
};

export function envPresent(name) {
  const v = process.env[name];
  return v != null && String(v).trim() !== '';
}

export function anyEnvPresent(names = []) {
  return names.some((n) => envPresent(n));
}

export function allEnvPresent(names = []) {
  if (!names.length) return true;
  return names.every((n) => envPresent(n));
}

export function fieldStatus(label, envNames) {
  const names = Array.isArray(envNames) ? envNames : [envNames];
  const filtered = names.filter(Boolean);
  const present = names.length > 1 ? anyEnvPresent(filtered) : allEnvPresent(filtered);
  return {
    label,
    status: present ? CONFIG.CONFIGURED : CONFIG.MISSING,
  };
}

export function buildConfigView(fields = [], { mode = null } = {}) {
  const items = fields.map((f) => fieldStatus(f.label, f.env));
  const missing = items.some((i) => i.status === CONFIG.MISSING);
  let status = missing ? CONFIG.MISSING : CONFIG.CONFIGURED;
  if (mode === 'TEST' && !missing) status = CONFIG.TEST_MODE;
  if (mode === 'DEVELOPMENT') status = CONFIG.DEVELOPMENT;
  return {
    status,
    mode: mode || null,
    fields: items,
  };
}

export function razorpayKeyMode() {
  const id = String(process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || '');
  if (id.startsWith('rzp_test_')) return 'TEST';
  if (id.startsWith('rzp_live_')) return 'LIVE';
  if (id) return 'UNKNOWN';
  return null;
}
