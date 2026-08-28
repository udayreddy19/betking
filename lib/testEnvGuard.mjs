/**
 * Refuse destructive / funding test paths against production-like DB targets.
 * Never prints connection secrets.
 */

const PROD_HOST_HINTS = [
  '200.234.38.230',
  'oddsyra.com',
  'oddsyra-prod',
  'prod-db',
  'production',
];

function parseDbHost(url) {
  try {
    const u = new URL(String(url || '').replace(/^postgres(ql)?:/i, 'http:'));
    return (u.hostname || '').toLowerCase();
  } catch {
    return '';
  }
}

export function classifyDatabaseTarget(databaseUrl = process.env.DATABASE_URL) {
  const host = parseDbHost(databaseUrl);
  const dbName = (() => {
    try {
      const u = new URL(String(databaseUrl || '').replace(/^postgres(ql)?:/i, 'http:'));
      return (u.pathname || '').replace(/^\//, '').toLowerCase();
    } catch {
      return '';
    }
  })();

  const looksProdHost = PROD_HOST_HINTS.some((h) => host.includes(h));
  const looksLocal = !host || host === 'localhost' || host === '127.0.0.1' || host === 'postgres';
  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();

  return {
    hostPresent: Boolean(host),
    hostClass: looksLocal ? 'local' : looksProdHost ? 'production_like' : 'unknown',
    dbNamePresent: Boolean(dbName),
    nodeEnv,
    looksProductionLike: looksProdHost || nodeEnv === 'production',
  };
}

/**
 * Call before any test that mutates money or restores DBs.
 * @param {{ requireTestEnv?: boolean }} opts
 */
export function assertSafeTestDatabase(opts = {}) {
  const { requireTestEnv = false } = opts;
  if (requireTestEnv && process.env.TEST_ENV !== 'true' && process.env.VITEST !== 'true') {
    throw new Error('TEST_ENV_REQUIRED: set TEST_ENV=true for destructive test suites');
  }
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('TEST_DB_FORBIDDEN: NODE_ENV=production');
  }
  const cls = classifyDatabaseTarget();
  if (cls.looksProductionLike && process.env.ALLOW_PROD_LIKE_TEST !== '1') {
    throw new Error('TEST_DB_FORBIDDEN: DATABASE_URL looks production-like');
  }
  return cls;
}

export function assertAutoRepairDisabled(argv = process.argv) {
  const bad = argv.some((a) => /^--auto-?repair(=|$)/i.test(a) || /^--repair(=|$)/i.test(a));
  if (bad) {
    throw new Error('AUTO_REPAIR_FORBIDDEN: wallet/ledger auto-repair is not allowed');
  }
  return true;
}
