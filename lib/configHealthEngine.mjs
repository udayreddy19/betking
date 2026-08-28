/**
 * Production Configuration Health — safe metadata only (never returns secret values).
 */

function present(env, key) {
  const v = env[key];
  return v !== undefined && v !== null && String(v).length > 0;
}

function isTruthy(v) {
  return v === '1' || v === 'true' || v === true;
}

/**
 * @returns {{ overall: 'OK'|'WARNING'|'CRITICAL', checks: Array }}
 */
export function getConfigurationHealth(env = process.env) {
  const isProd = env.NODE_ENV === 'production';
  const checks = [];

  const push = (id, status, message, meta = {}) => {
    checks.push({ id, status, message, ...meta });
  };

  // DEMO
  const demoOn = isTruthy(env.DEMO_MODE) || isTruthy(env.VITE_DEMO_MODE);
  if (isProd && demoOn) {
    push('demo_mode', 'CRITICAL', 'DEMO_MODE or VITE_DEMO_MODE is enabled in production');
  } else if (demoOn) {
    push('demo_mode', 'WARNING', 'DEMO_MODE enabled (non-production)');
  } else {
    push('demo_mode', 'OK', 'Demo mode off');
  }

  if (isProd && isTruthy(env.E2E_HARNESS)) {
    push('e2e_harness', 'CRITICAL', 'E2E_HARNESS must not be enabled in production');
  } else {
    push('e2e_harness', 'OK', 'E2E harness not enabled for production path');
  }

  // Required secrets — presence only
  for (const key of ['DATABASE_URL', 'JWT_SECRET']) {
    if (!present(env, key)) {
      push(`secret_${key}`, 'CRITICAL', `${key} missing`, { configured: false });
    } else {
      const len = String(env[key]).length;
      push(`secret_${key}`, len >= 8 ? 'OK' : 'WARNING', `${key} configured`, {
        configured: true,
        lengthBucket: len < 16 ? 'short' : len < 32 ? 'medium' : 'long',
      });
    }
  }

  if (isProd) {
    for (const key of [
      'FRONTEND_URL',
      'CORS_ORIGIN',
      'SMTP_HOST',
      'REDIS_URL',
    ]) {
      if (!present(env, key)) {
        push(`env_${key}`, key === 'REDIS_URL' ? 'WARNING' : 'CRITICAL', `${key} missing`, {
          configured: false,
        });
      } else {
        push(`env_${key}`, 'OK', `${key} configured`, { configured: true });
      }
    }
  }

  // Cookie / CORS hygiene (metadata)
  const cookieSecure = isTruthy(env.COOKIE_SECURE) || isProd;
  if (isProd && !cookieSecure && env.COOKIE_SECURE === '0') {
    push('cookie_secure', 'CRITICAL', 'COOKIE_SECURE explicitly disabled in production');
  } else {
    push('cookie_secure', 'OK', isProd ? 'Production expects secure cookies' : 'Non-prod cookie policy');
  }

  const cors = String(env.CORS_ORIGIN || '');
  if (isProd && (cors === '*' || cors.includes('*'))) {
    push('cors_origin', 'CRITICAL', 'CORS_ORIGIN must not be wildcard in production');
  } else if (!cors && isProd) {
    push('cors_origin', 'WARNING', 'CORS_ORIGIN empty');
  } else {
    push('cors_origin', 'OK', 'CORS origin configured (value redacted)', {
      originCount: cors ? cors.split(',').length : 0,
    });
  }

  const jwt = String(env.JWT_SECRET || '');
  if (jwt.includes('CHANGE_ME') || jwt.includes('oddsyra_jwt_secret_dev_key_2026')) {
    push('jwt_unsafe', isProd ? 'CRITICAL' : 'WARNING', 'JWT_SECRET looks like a known default');
  }

  let overall = 'OK';
  if (checks.some((c) => c.status === 'CRITICAL')) overall = 'CRITICAL';
  else if (checks.some((c) => c.status === 'WARNING')) overall = 'WARNING';

  return {
    success: true,
    overall,
    environment: env.NODE_ENV || 'development',
    isProduction: isProd,
    checks,
    generatedAt: new Date().toISOString(),
    note: 'Secret values are never returned — only presence and safe metadata.',
  };
}
