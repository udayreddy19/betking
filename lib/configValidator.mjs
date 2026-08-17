/**
 * Production Environment Configuration Validator
 * Enforces strict fail-fast validation before application startup.
 */
export function validateProductionConfig() {
  const isProd = process.env.NODE_ENV === 'production';
  const errors = [];

  const requiredVars = [
    'DATABASE_URL',
    'JWT_SECRET',
  ];

  const prodOnlyVars = [
    'FRONTEND_URL',
    'CORS_ORIGIN',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_WEBHOOK_SECRET',
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASSWORD',
  ];

  for (const v of requiredVars) {
    if (!process.env[v]) {
      errors.push(`Missing required environment variable: ${v}`);
    } else if (isProd && (process.env[v].includes('CHANGE_ME') || process.env[v].includes('oddsyra_dev_pass'))) {
      errors.push(`Unsafe development default detected in production for: ${v}`);
    }
  }

  if (isProd) {
    for (const v of prodOnlyVars) {
      if (!process.env[v]) {
        errors.push(`Missing production environment variable: ${v}`);
      }
    }
    const jwt = process.env.JWT_SECRET || '';
    if (jwt.includes('oddsyra_jwt_secret_dev_key_2026')) {
      errors.push('Unsafe JWT_SECRET default detected in production');
    }
    const wh = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    if (wh.includes('oddsyra_wh_secret_2026')) {
      errors.push('Unsafe RAZORPAY_WEBHOOK_SECRET default detected in production');
    }
  }

  if (errors.length > 0) {
    console.error('❌ CRITICAL PRODUCTION CONFIGURATION ERROR:');
    errors.forEach((e) => console.error(`   - ${e}`));
    if (isProd) {
      throw new Error(`PRODUCTION_CONFIG_FAIL: ${errors.join('; ')}`);
    }
  }

  return { isValid: errors.length === 0, errors };
}

/** Alias used by devopsEngine and server boot. */
export function validateProductionEnvironment(env = process.env) {
  const prev = { ...process.env };
  Object.assign(process.env, env);
  try {
    return validateProductionConfig();
  } finally {
    Object.assign(process.env, prev);
  }
}
