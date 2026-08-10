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

  for (const v of requiredVars) {
    if (!process.env[v]) {
      errors.push(`Missing required environment variable: ${v}`);
    } else if (isProd && (process.env[v].includes('CHANGE_ME') || process.env[v].includes('betking_dev_pass'))) {
      errors.push(`Unsafe development default detected in production for: ${v}`);
    }
  }

  if (errors.length > 0) {
    console.error('❌ CRITICAL PRODUCTION CONFIGURATION ERROR:');
    errors.forEach(e => console.error(`   - ${e}`));
    if (isProd) {
      throw new Error(`PRODUCTION_CONFIG_FAIL: ${errors.join('; ')}`);
    }
  }

  return { isValid: errors.length === 0, errors };
}
