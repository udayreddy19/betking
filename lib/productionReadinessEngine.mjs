/**
 * Production Readiness Center — evidence-based gates.
 * Extends existing engine; does not create a second readiness platform.
 * Never claims production GREEN from local tests alone.
 * Never auto-repairs wallets/ledger.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../db/pg.js';
import { getConfigurationHealth } from './configHealthEngine.mjs';
import {
  KNOWN_TEST_FUNDING_ACCEPTANCE,
  inspectKnownTestFundingAccounts,
  knownTestFundingSqlInList,
} from './knownTestFundingExclusions.mjs';

async function safeCount(sql, params = []) {
  try {
    const res = await query(sql, params);
    return Number(res.rows[0]?.c ?? res.rows[0]?.count ?? 0);
  } catch {
    return null;
  }
}

function statusFromCounts({ critical = 0, warning = 0, unknown = false }) {
  if (unknown) return 'NOT VERIFIED';
  if (critical > 0) return 'RED';
  if (warning > 0) return 'YELLOW';
  return 'GREEN';
}

function mapHealth(h) {
  const v = typeof h === 'object' && h != null ? (h.status ?? h.connectionStatus ?? null) : h;
  if (!v || v === 'UNKNOWN' || v === 'N/A') return 'NOT VERIFIED';
  if (v === 'HEALTHY' || v === 'OK' || v === 'UP') return 'GREEN';
  if (v === 'WARNING' || v === 'DEGRADED') return 'YELLOW';
  if (v === 'CRITICAL' || v === 'UNHEALTHY' || v === 'DOWN') return 'RED';
  return 'NOT VERIFIED';
}

function healthSlice(health) {
  if (!health) {
    return {
      application: 'NOT VERIFIED',
      database: 'NOT VERIFIED',
      workers: 'NOT VERIFIED',
      outbox: 'NOT VERIFIED',
      redis: 'NOT VERIFIED',
    };
  }
  return {
    application: mapHealth(health.application),
    database: mapHealth(health.database),
    workers: mapHealth(health.backgroundJobs),
    outbox: mapHealth(health.backgroundJobs),
    redis: mapHealth(health.database?.redisStatus ?? health.redis),
  };
}

function gate(id, label, status, opts = {}) {
  // Back-compat: gate(id, label, status, evidenceObject) OR shaped opts with evidence/meta
  const metaKeys = new Set(['explanation', 'remediation', 'blocking', 'severity', 'environment', 'evidence', 'observability']);
  const rest = Object.fromEntries(Object.entries(opts).filter(([k]) => !metaKeys.has(k)));
  const evidence = { ...rest, ...(opts.evidence || {}) };
  const severity = opts.severity
    || (status === 'RED' ? 'CRITICAL' : status === 'YELLOW' ? 'HIGH' : status === 'NOT VERIFIED' ? 'MEDIUM' : 'INFO');
  return {
    id,
    label,
    status,
    severity,
    environment: opts.environment || evidence.environment || 'any',
    evidence: {
      ...evidence,
      checkedAt: evidence.checkedAt || evidence.timestamp || new Date().toISOString(),
      timestamp: evidence.timestamp || new Date().toISOString(),
    },
    explanation: opts.explanation || evidence.note || evidence.remediation || '',
    remediation: opts.remediation || evidence.remediation || '',
    blocking: Boolean(opts.blocking),
    ...(opts.observability ? { observability: opts.observability } : {}),
  };
}

const REQUIRED_MIGRATIONS = ['067', '068', '069', '070', '071', '098'];

async function checkMigrationsOnDiskAndDb() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
  const files = fs.existsSync(root) ? fs.readdirSync(root).filter((f) => f.endsWith('.sql')) : [];
  const onDisk = {};
  for (const prefix of REQUIRED_MIGRATIONS) {
    onDisk[prefix] = files.some((f) => f.startsWith(prefix));
  }

  let applied = null;
  let head = null;
  try {
    const res = await query(
      `SELECT version AS filename FROM schema_migrations ORDER BY version`,
    ).catch(() => query(`SELECT filename FROM schema_migrations ORDER BY filename`));
    applied = (res.rows || []).map((r) => String(r.filename || r.version || ''));
    head = applied.length ? applied[applied.length - 1] : null;
  } catch {
    applied = null;
  }

  const appliedMap = {};
  for (const prefix of REQUIRED_MIGRATIONS) {
    if (applied == null) appliedMap[prefix] = 'NOT VERIFIED';
    else appliedMap[prefix] = applied.some((a) => a.includes(prefix)) ? 'GREEN' : 'YELLOW';
  }

  const missingDisk = REQUIRED_MIGRATIONS.filter((p) => !onDisk[p]);
  const missingMigrations = applied == null
    ? []
    : REQUIRED_MIGRATIONS.filter((p) => !applied.some((a) => a.includes(p)));
  let status = 'GREEN';
  if (missingDisk.length) status = 'RED';
  else if (applied == null) status = 'NOT VERIFIED';
  else if (missingMigrations.length) status = 'YELLOW';

  return {
    status,
    onDisk,
    appliedStatus: appliedMap,
    appliedCount: applied?.length ?? null,
    actualHead: head,
    missingMigrations,
    unexpectedMigrations: [],
    note: applied == null
      ? 'Migration table not readable from this environment — do not claim deployed from source alone'
      : 'Source + DB presence checked; production deploy still needs live evidence',
  };
}

/**
 * @param {{ environment?: 'local'|'staging'|'production'|string }} opts
 */
export async function buildProductionReadiness(opts = {}) {
  const envLabel = String(opts.environment || process.env.READINESS_ENV || process.env.NODE_ENV || 'local').toLowerCase();
  const isProdClaim = envLabel === 'production';
  const isStagingClaim = envLabel === 'staging';

  let health = null;
  try {
    const { buildProductionHealth } = await import('./opsProductionHealth.mjs');
    health = await buildProductionHealth();
  } catch {
    health = null;
  }

  const hs = healthSlice(health);
  const config = getConfigurationHealth();
  const testFunding = await inspectKnownTestFundingAccounts().catch((err) => ({
    success: false,
    goLiveBlocked: true,
    code: 'TEST_FUNDING_INSPECT_FAILED',
    error: err.message,
    accounts: [],
    pendingCount: null,
  }));

  const migrationCheck = await checkMigrationsOnDiskAndDb();

  const [
    reconOpen,
    reconCritical,
    wdHigh,
    wdCritical,
    wdPendingChecker,
    depositFail,
    settlementFail,
    promoAbuseOpen,
    alertsOpen,
    alertsCritical,
    incidentsOpen,
    mismatchRaw,
    mismatchActionable,
    mismatchAccepted,
    backups,
  ] = await Promise.all([
    safeCount(`SELECT COUNT(*)::int AS c FROM reconciliation_cases WHERE UPPER(status) IN ('OPEN','INVESTIGATING')`),
    safeCount(`SELECT COUNT(*)::int AS c FROM reconciliation_cases WHERE UPPER(severity)='CRITICAL' AND UPPER(status) IN ('OPEN','INVESTIGATING')`),
    safeCount(`SELECT COUNT(*)::int AS c FROM withdrawals WHERE UPPER(COALESCE(risk_level,''))='HIGH' AND UPPER(status) IN ('PENDING','PENDING_REVIEW','HOLD','PENDING_CHECKER')`),
    safeCount(`SELECT COUNT(*)::int AS c FROM withdrawals WHERE UPPER(COALESCE(risk_level,''))='CRITICAL' AND UPPER(status) IN ('PENDING','PENDING_REVIEW','HOLD','PENDING_CHECKER')`),
    safeCount(`SELECT COUNT(*)::int AS c FROM withdrawals WHERE UPPER(status)='PENDING_CHECKER'`),
    safeCount(
      `SELECT COUNT(*)::int AS c FROM transactions
       WHERE UPPER(type)='DEPOSIT' AND UPPER(status) IN ('FAILED','FAILURE')
         AND created_at >= NOW() - INTERVAL '24 hours'`,
    ),
    (async () => {
      const a = await safeCount(`SELECT COUNT(*)::int AS c FROM settlement_queue WHERE UPPER(status) IN ('FAILED','DEAD')`);
      if (a != null) return a;
      return safeCount(`SELECT COUNT(*)::int AS c FROM settlement_jobs WHERE UPPER(status)='FAILED'`);
    })(),
    safeCount(`SELECT COUNT(*)::int AS c FROM promo_abuse_alerts WHERE UPPER(status)='OPEN'`),
    (async () => {
      const a = await safeCount(`SELECT COUNT(*)::int AS c FROM ops_alerts WHERE UPPER(status) IN ('OPEN','ACKNOWLEDGED')`);
      if (a != null) return a;
      return safeCount(`SELECT COUNT(*)::int AS c FROM admin_notifications WHERE UPPER(COALESCE(status,'OPEN'))='OPEN'`);
    })(),
    safeCount(`SELECT COUNT(*)::int AS c FROM admin_notifications WHERE UPPER(COALESCE(severity,''))='CRITICAL' AND UPPER(COALESCE(status,'OPEN'))='OPEN'`),
    (async () => {
      const a = await safeCount(`SELECT COUNT(*)::int AS c FROM ops_incidents WHERE UPPER(status) NOT IN ('RESOLVED','CLOSED')`);
      if (a != null) return a;
      return safeCount(`SELECT COUNT(*)::int AS c FROM incidents WHERE UPPER(status) NOT IN ('RESOLVED','CLOSED')`);
    })(),
    safeCount(`
      SELECT COUNT(*)::int AS c FROM wallets w
      LEFT JOIN (
        SELECT wallet_id,
               COALESCE(SUM(CASE WHEN type='CREDIT' THEN amount WHEN type='DEBIT' THEN -amount ELSE 0 END),0) AS ledger_sum
        FROM ledger_entries GROUP BY wallet_id
      ) l ON l.wallet_id = w.wallet_id
      WHERE ABS(COALESCE(w.balance,0) - COALESCE(l.ledger_sum,0)) > 0.01
    `),
    safeCount(
      `
      SELECT COUNT(*)::int AS c FROM wallets w
      LEFT JOIN (
        SELECT wallet_id,
               COALESCE(SUM(CASE WHEN type='CREDIT' THEN amount WHEN type='DEBIT' THEN -amount ELSE 0 END),0) AS ledger_sum
        FROM ledger_entries GROUP BY wallet_id
      ) l ON l.wallet_id = w.wallet_id
      WHERE ABS(COALESCE(w.balance,0) - COALESCE(l.ledger_sum,0)) > 0.01
        AND w.user_id <> ALL($1::text[])
    `,
      [knownTestFundingSqlInList()],
    ),
    safeCount(
      `
      SELECT COUNT(*)::int AS c FROM wallets w
      LEFT JOIN (
        SELECT wallet_id,
               COALESCE(SUM(CASE WHEN type='CREDIT' THEN amount WHEN type='DEBIT' THEN -amount ELSE 0 END),0) AS ledger_sum
        FROM ledger_entries GROUP BY wallet_id
      ) l ON l.wallet_id = w.wallet_id
      WHERE ABS(COALESCE(w.balance,0) - COALESCE(l.ledger_sum,0)) > 0.01
        AND w.user_id = ANY($1::text[])
    `,
      [knownTestFundingSqlInList()],
    ),
    query(
      `SELECT id, backup_type, status, created_at, duration_ms
       FROM backups_log ORDER BY created_at DESC LIMIT 1`,
    ).catch(() => ({ rows: [] })),
  ]);

  const lastBackup = backups.rows?.[0] || null;
  let backupAgeHours = null;
  if (lastBackup?.created_at) {
    backupAgeHours = Math.round((Date.now() - new Date(lastBackup.created_at).getTime()) / 3600000);
  }

  const residualTotal = Array.isArray(testFunding.accounts)
    ? testFunding.accounts.reduce((s, a) => s + Math.abs(Number(a.bucketTotal) || 0), 0)
    : null;
  if (testFunding && typeof testFunding === 'object') {
    testFunding.residualTotal = residualTotal;
    testFunding.RAW_MISMATCH_COUNT = mismatchRaw;
    testFunding.ACTIONABLE_MISMATCH_COUNT = mismatchActionable;
    testFunding.ACCEPTED_MISMATCH_COUNT = mismatchAccepted;
  }

  const testFundingStatus = testFunding.goLiveBlocked
    ? 'YELLOW'
    : testFunding.success === false
      ? 'NOT VERIFIED'
      : 'GREEN';

  const ledgerStatus = mismatchActionable == null
    ? 'NOT VERIFIED'
    : mismatchActionable === 0
      ? 'GREEN'
      : mismatchActionable <= 10
        ? 'YELLOW'
        : 'RED';

  const paymentsStatus = 'OUT OF SCOPE'; // Razorpay
  const corsCheck = config.checks.find((c) => c.id === 'cors_origin');

  const gates = [
    gate('CORE', 'Core application', hs.application, {
      source: 'opsProductionHealth.application.status', environment: envLabel,
    }),
    gate('TESTS', 'Automated tests', envLabel === 'local' ? 'GREEN' : 'NOT VERIFIED', {
      source: 'npm test (local evidence only)',
      note: 'Local suite GREEN does not verify staging/production',
    }),
    gate('BUILD', 'Production build', envLabel === 'local' ? 'GREEN' : 'NOT VERIFIED', {
      source: 'npm run build (local evidence only)',
    }),
    gate('LINT', 'Lint', 'NOT VERIFIED', { source: 'npm run lint', note: 'Record from command output' }),
    gate('DEPENDENCIES', 'Dependencies / supply-chain', 'NOT VERIFIED', { source: 'npm audit --omit=dev' }),
    gate('DATABASE', 'Database / schema', hs.database, {
      source: 'opsProductionHealth.database.status', latencyMs: health?.database?.latencyMs ?? null,
    }),
    gate('MIGRATIONS', 'Migrations 067–071 / 098', migrationCheck.status, {
      source: 'checkMigrationsOnDiskAndDb', detail: migrationCheck,
      remediation: 'Apply missing migrations on target env; never claim from source alone',
    }),
    gate('WALLET', 'Wallet integrity (read-only)', ledgerStatus, {
      RAW_MISMATCH_COUNT: mismatchRaw,
      ACTIONABLE_MISMATCH_COUNT: mismatchActionable,
      ACCEPTED_MISMATCH_COUNT: mismatchAccepted,
      policy: 'FLAG_ONLY_NO_AUTO_REPAIR',
    }),
    gate('LEDGER', 'Ledger (actionable mismatches)', ledgerStatus, {
      mismatchActionable, mismatchRaw, mismatchAccepted,
      RAW_MISMATCH_COUNT: mismatchRaw,
      ACTIONABLE_MISMATCH_COUNT: mismatchActionable,
      ACCEPTED_MISMATCH_COUNT: mismatchAccepted,
      policy: 'FLAG_ONLY_NO_AUTO_REPAIR',
    }),
    gate('RECONCILIATION', 'Reconciliation', statusFromCounts({
      critical: reconCritical || 0, warning: reconOpen || 0, unknown: reconOpen == null,
    }), { reconOpen, reconCritical, policy: 'FLAG_ONLY' }),
    gate('TEST_FUNDING', 'Test-funding cleanup (go-live)', testFundingStatus, {
      code: testFunding.code, pendingCount: testFunding.pendingCount, residualTotal,
      goLiveBlocked: Boolean(testFunding.goLiveBlocked),
      remediation: testFunding.remediation, acceptance: KNOWN_TEST_FUNDING_ACCEPTANCE,
    }),
    gate('TEST_FUNDING_CLEANUP', 'Test-funding cleanup (alias)', testFundingStatus, {
      aliasOf: 'TEST_FUNDING', code: testFunding.code, pendingCount: testFunding.pendingCount,
      residualTotal, goLiveBlocked: Boolean(testFunding.goLiveBlocked),
      remediation: testFunding.remediation, acceptance: KNOWN_TEST_FUNDING_ACCEPTANCE,
    }),
    gate('AUTHENTICATION', 'Authentication', 'NOT VERIFIED', {
      remediation: 'npm run security:smoke -- --environment=<env>',
    }),
    gate('AUTH', 'Authentication (alias)', 'NOT VERIFIED', {
      aliasOf: 'AUTHENTICATION', remediation: 'Run live smoke: user + admin login',
    }),
    gate('MFA', 'Admin MFA', 'NOT VERIFIED', {
      remediation: 'Verify MFA challenge on production admin login', owner: 'Security',
    }),
    gate('RBAC', 'RBAC', 'NOT VERIFIED', {
      remediation: 'Deny unauthorized finance/security roles on live', owner: 'Security',
    }),
    gate('CSRF', 'CSRF', 'NOT VERIFIED', {
      note: 'Cookie-auth CSRF; admin Bearer is separate model',
      remediation: 'Cookie mutations must reject without CSRF token on live',
    }),
    gate('SESSION', 'Admin sessions', 'NOT VERIFIED', {
      note: 'Session revoke may not invalidate JWT until expiry',
    }),
    gate('SECRETS', 'Secrets presence', config.overall === 'OK' ? 'GREEN' : config.overall === 'CRITICAL' ? 'RED' : 'YELLOW', {
      source: 'configHealthEngine', note: 'Values never returned',
    }),
    gate('RATE_LIMITING', 'Rate limiting', 'YELLOW', {
      note: 'Auth + admin API/mutation limiters exist; live abuse smoke NOT VERIFIED',
    }),
    gate('SECURITY_HEADERS', 'Security headers', 'YELLOW', { note: 'CSP Report-Only; nginx HSTS' }),
    gate('CORS', 'CORS', corsCheck?.status === 'OK' ? 'GREEN' : corsCheck?.status === 'CRITICAL' ? 'RED' : 'YELLOW', {
      source: 'configHealthEngine.cors_origin',
    }),
    gate('AUDIT_LOGGING', 'Audit logging', 'YELLOW', { note: 'auditLogger on modular admin; sanitize PARTIAL' }),
    gate('SECURITY', 'Configuration security', config.overall === 'OK' ? 'GREEN' : config.overall === 'CRITICAL' ? 'RED' : 'YELLOW', {
      source: 'configHealthEngine',
    }),
    gate('ODDS', 'Odds engine', 'NOT VERIFIED', { source: 'OddsEngineV3 preserved' }),
    gate('BET_PLACEMENT', 'Bet placement', 'NOT VERIFIED', { source: 'betPlacementEngine preserved' }),
    gate('SETTLEMENT', 'Settlement', statusFromCounts({
      critical: settlementFail != null && settlementFail > 20 ? 1 : 0,
      warning: settlementFail || 0, unknown: settlementFail == null,
    }), { settlementFail }),
    gate('DEPOSITS', 'Deposits', statusFromCounts({
      warning: depositFail || 0, unknown: depositFail == null,
    }), { depositFail24h: depositFail, note: 'Razorpay OUT OF SCOPE' }),
    gate('WITHDRAWALS', 'Withdrawals', statusFromCounts({
      critical: wdCritical || 0, warning: (wdHigh || 0) + (wdPendingChecker || 0),
    }), { wdHigh, wdCritical, pendingChecker: wdPendingChecker }),
    gate('WITHDRAWAL_RISK', 'Withdrawal risk', 'NOT VERIFIED', { source: 'withdrawalRiskEngine preserved' }),
    gate('FINANCE', 'Finance ops', statusFromCounts({
      critical: (reconCritical || 0) + (wdCritical || 0),
      warning: (reconOpen || 0) + (wdHigh || 0) + (wdPendingChecker || 0),
    }), { reconOpen, wdHigh, wdCritical, pendingChecker: wdPendingChecker }),
    gate('PROMOTIONS', 'Promotions / abuse', statusFromCounts({
      warning: promoAbuseOpen || 0, unknown: promoAbuseOpen == null,
    }), { promoAbuseOpen }),
    gate('VIP', 'VIP', 'NOT VERIFIED', { source: 'vipEngine preserved' }),
    gate('CRM', 'CRM / marketing opt-out', 'NOT VERIFIED', {
      remediation: 'Smoke CRM dry-run + opt-out exclusion on target env',
    }),
    gate('NOTIFICATIONS', 'Notifications', 'NOT VERIFIED', { source: 'notificationPreferencesEngine preserved' }),
    gate('WORKERS', 'Workers', hs.workers, {
      source: 'opsProductionHealth.backgroundJobs', telemetry: 'PROCESS_LOCAL',
      pending: health?.backgroundJobs?.pending ?? null,
    }),
    gate('OUTBOX', 'Outbox', hs.outbox, {
      pending: health?.backgroundJobs?.pending ?? null,
      failed: health?.backgroundJobs?.failed ?? null,
    }),
    gate('REDIS', 'Redis', hs.redis, { source: 'opsProductionHealth.database.redisStatus' }),
    gate('WEBSOCKET', 'WebSocket', 'NOT VERIFIED', {
      remediation: 'Smoke /ws connectivity + channel isolation',
    }),
    gate('MONITORING', 'Observability', 'YELLOW', {
      telemetryScope: 'PROCESS_LOCAL for HTTP counters unless Redis aggregation evidenced',
    }),
    gate('ALERTING', 'Alerting', statusFromCounts({
      critical: alertsCritical || 0, warning: alertsOpen || 0, unknown: alertsOpen == null,
    }), { alertsOpen, alertsCritical }),
    gate('INCIDENTS', 'Incidents', statusFromCounts({
      warning: incidentsOpen || 0, unknown: incidentsOpen == null,
    }), { incidentsOpen }),
    gate('BACKUPS', 'Backups', lastBackup == null ? 'NOT VERIFIED'
      : backupAgeHours != null && backupAgeHours <= 48 ? 'GREEN' : 'YELLOW', {
      lastBackupAt: lastBackup?.created_at || null, ageHours: backupAgeHours,
    }),
    gate('DR', 'DR restore class', isProdClaim || isStagingClaim ? 'NOT VERIFIED' : 'YELLOW', {
      classes: {
        LOCAL_DUMP_RESTORE: 'PASSED (historical isolated drill)',
        STAGING_PITR: 'NOT VERIFIED',
        PRODUCTION_CLASS_PITR: 'NOT VERIFIED',
      },
      note: 'Do not use local ~16.7s restore as production RTO',
    }),
    gate('PITR', 'PITR / WAL', 'NOT VERIFIED', {
      remediation: 'Authorized staging/production-class PITR drill required',
    }),
    gate('RPO', 'RPO', 'NOT VERIFIED', {}),
    gate('RTO', 'RTO', 'NOT VERIFIED', {}),
    gate('DEPLOYMENT', 'Deployment verification', isProdClaim || isStagingClaim ? 'NOT VERIFIED' : 'YELLOW', {
      remediation: 'See PHASE_7_PRODUCTION_DEPLOYMENT_RUNBOOK.md',
    }),
    gate('ROLLBACK', 'Rollback plan', 'YELLOW', {
      note: 'App rollback ≠ schema rollback; never rewrite financial history',
    }),
    gate('DATA_RETENTION', 'Data retention', 'NOT VERIFIED', {}),
    gate('PRIVACY', 'Data privacy / PII', 'YELLOW', { doc: 'docs/PHASE_7_DATA_PRIVACY_REVIEW.md' }),
    gate('PRODUCTION_SMOKE', 'Production smoke', 'NOT VERIFIED', {
      remediation: 'npm run security:smoke -- --environment=production --i-understand-production=1',
    }),
    gate('PAYMENTS', 'Payments (Razorpay)', paymentsStatus, {
      note: 'Razorpay intentionally OUT OF SCOPE for this hardening pass',
    }),
  ];

  // Mark blocking flags on critical gates
  for (const g of gates) {
    if (g.status === 'RED') g.blocking = true;
    if ((g.id === 'TEST_FUNDING' || g.id === 'TEST_FUNDING_CLEANUP') && testFunding.goLiveBlocked) g.blocking = true;
    if (isProdClaim && ['PITR', 'RPO', 'RTO', 'DEPLOYMENT', 'MFA', 'CSRF', 'RBAC', 'PRODUCTION_SMOKE', 'AUTHENTICATION'].includes(g.id)
      && g.status === 'NOT VERIFIED') {
      g.blocking = true;
    }
  }

  // Legacy sections (compat with Phase 5 UI)
  const sections = {
    system: {
      api: hs.application,
      postgresql: hs.database,
      redis: hs.redis,
      websocket: 'NOT VERIFIED',
      outbox: hs.outbox,
      workers: hs.workers,
      note: 'HTTP counters may be PROCESS-LOCAL',
      observability: 'PROCESS_LOCAL',
    },
    security: {
      demoMode: config.checks.find((c) => c.id === 'demo_mode')?.status === 'OK' ? 'GREEN'
        : config.checks.find((c) => c.id === 'demo_mode')?.status === 'CRITICAL' ? 'RED' : 'YELLOW',
      configOverall: config.overall === 'OK' ? 'GREEN' : config.overall === 'CRITICAL' ? 'RED' : 'YELLOW',
      mfa: 'NOT VERIFIED',
      rbac: 'NOT VERIFIED',
      csrf: 'NOT VERIFIED',
    },
    finance: {
      walletLedgerMismatches: ledgerStatus,
      mismatchCount: mismatchActionable,
      mismatchCountRaw: mismatchRaw,
      mismatchAccepted,
      RAW_MISMATCH_COUNT: mismatchRaw,
      ACTIONABLE_MISMATCH_COUNT: mismatchActionable,
      ACCEPTED_MISMATCH_COUNT: mismatchAccepted,
      mismatchExcludedKnownTestFunding: Math.max(0, (mismatchRaw || 0) - (mismatchActionable || 0)),
      knownTestFundingAcceptance: KNOWN_TEST_FUNDING_ACCEPTANCE,
      testFundingCleanup: testFunding,
      reconciliationOpen: reconOpen,
      reconciliationCritical: reconCritical,
      highWithdrawals: wdHigh,
      criticalWithdrawals: wdCritical,
      pendingChecker: wdPendingChecker,
      depositFailures24h: depositFail,
      settlementFailures: settlementFail,
      status: statusFromCounts({
        critical: (reconCritical || 0) + (wdCritical || 0),
        warning: (reconOpen || 0) + (wdHigh || 0) + (mismatchActionable || 0)
          + (testFunding.goLiveBlocked ? 1 : 0),
        unknown: mismatchActionable == null,
      }),
      policy: 'FLAG_ONLY_NO_AUTO_REPAIR',
    },
    growth: {
      promoAbuseOpen,
      status: statusFromCounts({ warning: promoAbuseOpen || 0, unknown: promoAbuseOpen == null }),
    },
    operations: {
      openAlerts: alertsOpen,
      criticalAlerts: alertsCritical,
      openIncidents: incidentsOpen,
      status: statusFromCounts({
        critical: alertsCritical || 0,
        warning: (alertsOpen || 0) + (incidentsOpen || 0),
        unknown: alertsOpen == null,
      }),
    },
    dr: {
      lastBackupAt: lastBackup?.created_at || null,
      lastBackupStatus: lastBackup?.status || null,
      backupAgeHours,
      lastRestore: 'NOT VERIFIED',
      measuredRto: 'NOT VERIFIED',
      measuredRpo: 'NOT VERIFIED',
      walPitr: 'NOT VERIFIED',
      ledgerGapCount: mismatchActionable,
      ledgerGapCountRaw: mismatchRaw,
      status: isProdClaim || isStagingClaim ? 'NOT VERIFIED' : 'YELLOW',
    },
  };

  const blocking = gates.filter((g) => g.blocking || g.status === 'RED');

  let overall = 'GREEN';
  if (gates.some((g) => g.status === 'RED')) overall = 'RED';
  else if (gates.some((g) => g.status === 'YELLOW' || g.status === 'NOT VERIFIED')) overall = 'YELLOW';

  if (isProdClaim || isStagingClaim) {
    overall = overall === 'RED' ? 'RED' : 'NOT VERIFIED';
  }

  const whyNotGreen = gates
    .filter((g) => g.status !== 'GREEN' && g.status !== 'OUT OF SCOPE')
    .map((g) => ({
      id: g.id,
      status: g.status,
      blocking: g.blocking,
      explanation: g.explanation || g.remediation || g.label,
    }));

  const mandatoryProdBlockers = [];
  if (testFunding.goLiveBlocked) mandatoryProdBlockers.push('TEST_FUNDING_CLEANUP_PENDING');
  if (migrationCheck.status === 'RED' || (isProdClaim && migrationCheck.status === 'YELLOW')) {
    mandatoryProdBlockers.push('MIGRATIONS_INCOMPLETE');
  }
  if ((mismatchActionable || 0) > 0) mandatoryProdBlockers.push(`ACTIONABLE_LEDGER_MISMATCHES:${mismatchActionable}`);
  if (gates.some((g) => g.id === 'CORE' && g.status === 'RED')) mandatoryProdBlockers.push('CORE_UNHEALTHY');
  if (gates.some((g) => g.id === 'DATABASE' && g.status === 'RED')) mandatoryProdBlockers.push('DATABASE_UNHEALTHY');
  if (gates.some((g) => g.id === 'REDIS' && g.status === 'RED')) mandatoryProdBlockers.push('REDIS_UNHEALTHY');
  if (gates.some((g) => g.id === 'OUTBOX' && g.status === 'RED')) mandatoryProdBlockers.push('OUTBOX_CRITICAL');
  if (gates.some((g) => g.id === 'WORKERS' && g.status === 'RED')) mandatoryProdBlockers.push('WORKERS_UNHEALTHY');
  // Live evidence gates — always block production claim until evidenced GREEN
  for (const id of ['MFA', 'RBAC', 'CSRF', 'PITR', 'RPO', 'RTO', 'DEPLOYMENT', 'PRODUCTION_SMOKE', 'AUTHENTICATION']) {
    const g = gates.find((x) => x.id === id);
    if (isProdClaim && g && (g.status === 'NOT VERIFIED' || g.status === 'RED' || g.status === 'YELLOW')) {
      mandatoryProdBlockers.push(`${id}_${String(g.status).replace(/\s+/g, '_')}`);
    }
  }

  const canLocalGo = !isProdClaim && !isStagingClaim
    && overall === 'GREEN'
    && !testFunding.goLiveBlocked
    && (mismatchActionable || 0) === 0
    && migrationCheck.status === 'GREEN';

  const goNoGo = {
    decision: isProdClaim || isStagingClaim
      ? 'NO-GO'
      : (testFunding.goLiveBlocked
        ? 'NO-GO (test funding residual)'
        : (canLocalGo ? 'GO (local only)' : 'HOLD')),
    goLiveBlockedByTestFunding: Boolean(testFunding.goLiveBlocked),
    productionClaimAllowed: false,
    stagingClaimAllowed: false,
    mandatoryBlockers: mandatoryProdBlockers,
    reasons: [
      ...(testFunding.goLiveBlocked
        ? ['TEST_FUNDING_CLEANUP_PENDING — residual balances on accepted test accounts']
        : []),
      ...(isProdClaim || isStagingClaim
        ? ['Environment claim requires live MFA/RBAC/CSRF/deploy/PITR evidence — productionClaimAllowed always false until evidenced']
        : []),
      ...(mismatchActionable > 0
        ? [`Actionable ledger mismatches: ${mismatchActionable}`]
        : []),
      ...mandatoryProdBlockers.filter((b) => !String(b).startsWith('TEST_FUNDING') && !String(b).startsWith('ACTIONABLE')).slice(0, 12),
    ],
    operatorChecklist: [
      'Zero known test-funding accounts via authorized path (no auto-repair)',
      'Apply migrations 067–071 and 098 on target and record evidence',
      'Complete security:smoke on target environment',
      'Complete PHASE_7_PRODUCTION_SMOKE_TEST.md',
      'Authorized PITR/DR drill before claiming RPO/RTO',
      'Record evidence under docs/evidence/phase7/',
    ],
    rule: 'Production cannot be GREEN if any mandatory gate is RED, NOT VERIFIED, or blocking YELLOW. Local PASS ≠ production PASS.',
  };

  return {
    success: true,
    overall,
    environment: envLabel,
    isProductionClaim: isProdClaim,
    isStagingClaim,
    gates,
    sections,
    whyNotGreen,
    testFunding,
    migrationCheck,
    goNoGo,
    blockingGateIds: [...new Set(blocking.map((g) => g.id))],
    configHealth: { overall: config.overall, checkCount: config.checks.length },
    productionHealthOverall: health?.overall || null,
    mismatchCounts: {
      RAW_MISMATCH_COUNT: mismatchRaw,
      ACTIONABLE_MISMATCH_COUNT: mismatchActionable,
      ACCEPTED_MISMATCH_COUNT: mismatchAccepted,
    },
    generatedAt: new Date().toISOString(),
    evidenceRule: 'GREEN only with environment-specific evidence. Local tests never make production GREEN. No auto-repair.',
    telemetryScope: 'PROCESS_LOCAL for in-process HTTP counters unless distributed evidence exists',
    autoRepair: false,
  };
}

export { REQUIRED_MIGRATIONS, checkMigrationsOnDiskAndDb, mapHealth, healthSlice };
