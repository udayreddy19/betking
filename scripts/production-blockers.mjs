#!/usr/bin/env node
/**
 * Production Blocker Consistency Tool.
 * Directly extracts all mandatory gates from productionCertificationEngine.mjs.
 * Guarantees that reports and summaries never understate mandatory production blockers.
 */

import { MANDATORY_PRODUCTION_GATES } from '../lib/productionCertificationEngine.mjs';

export function getProductionBlockers() {
  const blockerMap = {
    CORE: { reason: 'Requires authorized production smoke verification', action: 'Run npm run production:smoke' },
    TESTS: { reason: 'Requires production regression run', action: 'Execute npm test' },
    BUILD: { reason: 'Requires production build artifact verification', action: 'Execute npm run build' },
    DATABASE: { reason: 'Requires PRODUCTION_DB_ASSERTED=1 under change control', action: 'Set DB assertion in authorized window' },
    MIGRATIONS: { reason: 'Requires live migration readiness verification', action: 'Execute npm run migration:readiness' },
    SECURITY: { reason: 'Requires credentialed security matrix run', action: 'Execute npm run security:certification' },
    AUTHENTICATION: { reason: 'Requires live authentication probe', action: 'Verify JWT and session handlers' },
    MFA: { reason: 'Requires production MFA check', action: 'Verify TOTP admin flows' },
    RBAC: { reason: 'Requires role authorization matrix check', action: 'Verify permission hierarchy' },
    CSRF: { reason: 'Requires CSRF token validation probe', action: 'Verify double-submit cookies' },
    FINANCE: { reason: 'Requires live financial investigation', action: 'Execute npm run finance:investigate' },
    LEDGER: { reason: 'Requires live ledger journal reconciliation', action: 'Verify wallet vs ledger opening gaps' },
    RECONCILIATION: { reason: 'Requires live reconciliation scan', action: 'Verify 6-bucket parity in live DB' },
    TEST_FUNDING: { reason: 'Requires live test funding exclusion check', action: 'Scan wallets for test balances' },
    PROMOTIONS: { reason: 'Requires promotions rollover check', action: 'Verify bonus & freebet rollover engine' },
    CRM: { reason: 'Requires CRM notification integration check', action: 'Verify notification queues' },
    WORKERS: { reason: 'Requires settlement worker telemetry check', action: 'Verify active worker instances' },
    OUTBOX: { reason: 'Requires transactional outbox health check', action: 'Verify outbox dispatch lag' },
    REDIS: { reason: 'Requires production Redis cluster check', action: 'Verify Redis ping & memory' },
    WEBSOCKET: { reason: 'Requires WebSocket broadcast health check', action: 'Verify socket server connectivity' },
    BACKUP: { reason: 'Requires production backup schedule verification', action: 'Inspect automated snapshot schedule' },
    DR: { reason: 'Requires disaster recovery plan verification', action: 'Verify failover standby readiness' },
    PITR: { reason: 'Requires production-class PITR restore drill', action: 'Execute continuous WAL restore exercise' },
    RPO: { reason: 'Requires live RPO benchmark measurement', action: 'Measure WAL replication lag' },
    RTO: { reason: 'Requires live RTO benchmark measurement', action: 'Measure cluster restore duration' },
    MONITORING: { reason: 'Requires distributed monitoring verification', action: 'Verify Datadog/CloudWatch alerts' },
    DEPLOYMENT: { reason: 'Requires production deployment attestation', action: 'Record immutable deployment metadata' },
    PRODUCTION_SMOKE: { reason: 'Gated on maintenance window', action: 'Run production smoke under change control' },
    AUDIT_LOGGING: { reason: 'Requires append-only audit log check', action: 'Verify admin and settlement logs' },
    SECRETS: { reason: 'Requires production secrets management audit', action: 'Verify KMS/Secret Manager integration' },
    CONFIGURATION: { reason: 'Requires production environment variable audit', action: 'Verify all mandatory env vars' },
  };

  return MANDATORY_PRODUCTION_GATES.map((gate) => ({
    gate,
    mandatory: true,
    status: 'NOT_VERIFIED',
    environment: 'production',
    reason: blockerMap[gate]?.reason || 'Mandatory production gate pending verification',
    requiredOperatorAction: blockerMap[gate]?.action || 'Execute authorized verification step',
  }));
}

if (process.argv[1] && process.argv[1].endsWith('production-blockers.mjs')) {
  const blockers = getProductionBlockers();
  console.log(`[PRODUCTION-BLOCKERS] Total Mandatory Gates: ${blockers.length}`);
  blockers.forEach((b, idx) => {
    console.log(`  ${idx + 1}. [${b.gate}] ${b.status} - ${b.reason}`);
  });
}
