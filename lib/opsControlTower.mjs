/**
 * Ops Control Tower — aggregates real KPIs from existing tables/engines.
 * Observational only; never invents zeros when a source fails (null / unavailable).
 */

import { query } from '../db/pg.js';
import { buildControlTowerMetrics } from './adminLiveOps.mjs';
import { enrichControlTowerFinancials, buildOperationsHealth } from './adminDomainData.mjs';

async function count(sql, params = []) {
  try {
    const res = await query(sql, params);
    return Number(res.rows?.[0]?.c ?? 0);
  } catch {
    return null;
  }
}

function na(v) {
  return v == null ? null : v;
}

export async function buildOpsControlTower() {
  const base = await enrichControlTowerFinancials(await buildControlTowerMetrics());
  const health = await buildOperationsHealth().catch(() => null);

  const [
    depositsToday,
    depositFailuresToday,
    pendingWithdrawals,
    wdApprovalsToday,
    wdRejectionsToday,
    wdHold,
    wdHigh,
    wdCritical,
    pendingChecker,
    openRecon,
    reconDiscrepancies,
    betsToday,
    betsRejectedToday,
    settlementPending,
    settlementFailed,
    freebetsIssued,
    freebetsClaimed,
    promoAbuseOpen,
    promoAbuseBlocksToday,
    referralsToday,
    campaignsActive,
    registrationsToday,
    kycPending,
    kycVerified,
    openIncidents,
    criticalAlerts,
    highAlerts,
    failedJobs,
  ] = await Promise.all([
    count(
      `SELECT COUNT(*)::int AS c FROM transactions
       WHERE UPPER(type) IN ('DEPOSIT','CREDIT') AND UPPER(status) IN ('SUCCESS','COMPLETED')
         AND created_at >= date_trunc('day', NOW())`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM transactions
       WHERE UPPER(type) IN ('DEPOSIT','CREDIT') AND UPPER(status) IN ('FAILED','FAILURE')
         AND created_at >= date_trunc('day', NOW())`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM withdrawals
       WHERE UPPER(status) IN ('REQUESTED','PENDING','PENDING_APPROVAL','PENDING_REVIEW','UNDER_REVIEW','HOLD','PENDING_CHECKER')`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM withdrawals
       WHERE UPPER(status) IN ('APPROVED','COMPLETED','PAID')
         AND COALESCE(updated_at, created_at) >= date_trunc('day', NOW())`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM withdrawals
       WHERE UPPER(status) IN ('REJECTED','CANCELLED')
         AND COALESCE(updated_at, created_at) >= date_trunc('day', NOW())`,
    ),
    count(`SELECT COUNT(*)::int AS c FROM withdrawals WHERE UPPER(status)='HOLD'`),
    count(
      `SELECT COUNT(*)::int AS c FROM withdrawals
       WHERE UPPER(COALESCE(risk_level,''))='HIGH'
         AND UPPER(status) IN ('PENDING_REVIEW','HOLD','PENDING_CHECKER')`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM withdrawals
       WHERE UPPER(COALESCE(risk_level,''))='CRITICAL'
         AND UPPER(status) IN ('PENDING_REVIEW','HOLD','PENDING_CHECKER')`,
    ),
    count(`SELECT COUNT(*)::int AS c FROM withdrawals WHERE UPPER(status)='PENDING_CHECKER'`),
    count(`SELECT COUNT(*)::int AS c FROM reconciliation_cases WHERE UPPER(status)='OPEN'`),
    count(
      `SELECT COUNT(*)::int AS c FROM reconciliation_cases
       WHERE UPPER(status)='OPEN'
         AND (UPPER(COALESCE(severity,'')) IN ('HIGH','CRITICAL')
              OR UPPER(COALESCE(case_type,'')) LIKE '%DISCREP%')`,
    ),
    count(`SELECT COUNT(*)::int AS c FROM bets WHERE created_at >= date_trunc('day', NOW())`),
    count(
      `SELECT COUNT(*)::int AS c FROM bets
       WHERE UPPER(status) IN ('REJECTED','FAILED','DECLINED')
         AND created_at >= date_trunc('day', NOW())`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM settlement_jobs
       WHERE UPPER(COALESCE(status,'')) IN ('PENDING','OPEN','QUEUED','PROCESSING')`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM settlement_jobs
       WHERE UPPER(COALESCE(status,'')) IN ('FAILED','DEAD','DEAD_LETTER')`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM free_bets
       WHERE created_at >= date_trunc('day', NOW())`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM free_bets
       WHERE UPPER(COALESCE(status,'')) IN ('CLAIMED','USED','REDEEMED')
         AND COALESCE(claimed_at, updated_at, created_at) >= date_trunc('day', NOW())`,
    ),
    count(`SELECT COUNT(*)::int AS c FROM promo_abuse_alerts WHERE UPPER(status)='OPEN'`),
    count(
      `SELECT COUNT(*)::int AS c FROM promo_abuse_alerts
       WHERE created_at >= date_trunc('day', NOW())`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM referral_events
       WHERE created_at >= date_trunc('day', NOW())`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM crm_campaigns
       WHERE UPPER(COALESCE(status,'')) IN ('ACTIVE','RUNNING','SCHEDULED')`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM users WHERE created_at >= date_trunc('day', NOW())`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM user_profiles
       WHERE UPPER(COALESCE(kyc_status,'NOT_STARTED')) IN ('PENDING','SUBMITTED','IN_REVIEW','NOT_STARTED')`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM user_profiles
       WHERE UPPER(COALESCE(kyc_status,'')) IN ('VERIFIED','APPROVED')`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM incidents
       WHERE UPPER(status) NOT IN ('RESOLVED','CLOSED','POSTMORTEM')`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM admin_notifications
       WHERE UPPER(COALESCE(status,'OPEN'))='OPEN'
         AND UPPER(COALESCE(severity, priority,''))='CRITICAL'`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM admin_notifications
       WHERE UPPER(COALESCE(status,'OPEN'))='OPEN'
         AND UPPER(COALESCE(severity, priority,''))='HIGH'`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM outbox_events
       WHERE UPPER(status) IN ('FAILED','DEAD_LETTER')`,
    ),
  ]);

  // Freebet fallback if free_bets missing
  let freebetsIssuedFinal = freebetsIssued;
  let freebetsClaimedFinal = freebetsClaimed;
  if (freebetsIssuedFinal == null) {
    freebetsIssuedFinal = await count(
      `SELECT COUNT(*)::int AS c FROM user_freebets WHERE created_at >= date_trunc('day', NOW())`,
    );
  }
  if (freebetsClaimedFinal == null) {
    freebetsClaimedFinal = await count(
      `SELECT COUNT(*)::int AS c FROM user_freebets
       WHERE UPPER(COALESCE(status,'')) IN ('CLAIMED','USED','REDEEMED')
         AND COALESCE(updated_at, created_at) >= date_trunc('day', NOW())`,
    );
  }

  const overallHealth = health?.overall
    || (base.systemStatus === 'DEGRADED' ? 'DEGRADED' : base.systemStatus === 'ERROR' ? 'UNKNOWN' : 'HEALTHY');

  const liveUnavailable = !base.timestamp && !health?.timestamp;

  return {
    success: true,
    liveDataUnavailable: !!liveUnavailable,
    lastUpdated: new Date().toISOString(),
    overallHealth,
    topCards: {
      systemHealth: overallHealth,
      openCriticalAlerts: na(criticalAlerts),
      pendingWithdrawals: na(pendingWithdrawals),
      pendingChecker: na(pendingChecker),
      openReconciliation: na(openRecon),
      openIncidents: na(openIncidents),
      promotionAbuse: na(promoAbuseOpen),
      settlementIssues: na(settlementFailed),
    },
    financial: {
      depositsToday: na(depositsToday),
      depositFailures: na(depositFailuresToday),
      pendingWithdrawals: na(pendingWithdrawals),
      withdrawalApprovals: na(wdApprovalsToday),
      withdrawalRejections: na(wdRejectionsToday),
      withdrawalHold: na(wdHold),
      highRiskWithdrawals: na(wdHigh),
      criticalRiskWithdrawals: na(wdCritical),
      pendingCheckerApprovals: na(pendingChecker),
      openReconciliationCases: na(openRecon),
      financeDiscrepancies: na(reconDiscrepancies),
      lockedDepositsTotal: base.lockedDepositsTotal ?? null,
      reservedFundsTotal: base.reservedFundsTotal ?? null,
    },
    betting: {
      liveMatches: base.liveMatches ?? null,
      matchesWithOdds: base.matchesWithOdds ?? null,
      openBets: base.openBets ?? null,
      betsPlacedToday: na(betsToday),
      betsRejectedToday: na(betsRejectedToday),
      settlementPending: na(settlementPending),
      settlementFailures: na(settlementFailed),
      suspendedMarkets: base.suspendedMarkets ?? null,
      oddsFreshnessProblems: base.riskAlerts ?? null,
      providerSources: base.providerSources || null,
      openLiability: base.openLiability ?? base.openExposure ?? null,
    },
    promotions: {
      activeCampaigns: na(campaignsActive),
      freebetsIssuedToday: na(freebetsIssuedFinal),
      freebetsClaimedToday: na(freebetsClaimedFinal),
      freebetFailures: null,
      promotionAbuseBlocksToday: na(promoAbuseBlocksToday),
      openPromotionAbuseAlerts: na(promoAbuseOpen),
      referralActivityToday: na(referralsToday),
    },
    usersKyc: {
      newRegistrationsToday: na(registrationsToday),
      kycPending: na(kycPending) ?? base.pendingKyc ?? null,
      kycVerified: na(kycVerified),
      kycFailures: null,
      registeredUsers: base.registeredUsers ?? null,
    },
    systemHealth: {
      overall: overallHealth,
      postgres: health?.postgres ?? null,
      redis: health?.redis ?? null,
      outboxQueue: health?.outboxQueue ?? null,
      outbox: health?.outbox ?? null,
      websocket: health?.websocket ?? null,
      uptimeSeconds: typeof process.uptime === 'function' ? Math.round(process.uptime()) : null,
      services: health?.services || [],
    },
    workQueue: [
      { id: 'withdrawal-review', label: 'Withdrawal review', count: na(pendingWithdrawals), domainId: 'finance', subModuleId: 'deposits-review' },
      { id: 'checker-approval', label: 'Checker approval', count: na(pendingChecker), domainId: 'finance', subModuleId: 'maker-checker' },
      { id: 'reconciliation', label: 'Reconciliation cases', count: na(openRecon), domainId: 'finance', subModuleId: 'finance-health' },
      { id: 'promo-abuse', label: 'Promotion abuse alerts', count: na(promoAbuseOpen), domainId: 'growth', subModuleId: 'promo-abuse' },
      { id: 'incidents', label: 'Open incidents', count: na(openIncidents), domainId: 'operations', subModuleId: 'incidents' },
      { id: 'failed-jobs', label: 'Failed jobs', count: na(failedJobs), domainId: 'operations', subModuleId: 'outbox-queue' },
      { id: 'critical-alerts', label: 'Critical alerts', count: na(criticalAlerts), domainId: 'operations', subModuleId: 'alerts' },
      { id: 'high-alerts', label: 'High alerts', count: na(highAlerts), domainId: 'operations', subModuleId: 'alerts' },
    ],
    legacy: base,
    note: 'Observational KPIs from Postgres + live aggregator. Null = source unavailable (not zero).',
  };
}
