/**
 * Actionable queue counts for Admin sidebar badges.
 * Only counts items that need an operator response / review — not historical dumps.
 */

import { query } from '../db/pg.js';

async function count(sql, params = []) {
  try {
    const res = await query(sql, params);
    return Number(res.rows?.[0]?.c ?? 0);
  } catch {
    return 0;
  }
}

function entry(n, label) {
  const countVal = Math.max(0, Number(n) || 0);
  if (countVal <= 0) return null;
  return { count: countVal, label: label || null };
}

/**
 * @returns {Promise<{
 *   domains: Record<string, { count: number, label?: string }>,
 *   subModules: Record<string, { count: number, label?: string }>,
 *   updatedAt: string
 * }>}
 */
export async function buildAdminNavAttention() {
  const [
    supportNeedsReply,
    supportOpenTickets,
    supportWaitingChat,
    supportSlaBreached,
    kycPendingReview,
    pendingWithdrawals,
    pendingMakerChecker,
    settlementPending,
    stuckBets,
    suspendedMarkets,
    promoAbuseOpen,
    openIncidents,
    openRecon,
    openAdminNotifs,
    feedErrors,
  ] = await Promise.all([
    // Help — player messaged, admin has unread
    count(
      `SELECT COUNT(*)::int AS c FROM support_conversations
       WHERE UPPER(COALESCE(support_type, 'TICKET')) IN ('TICKET', 'SUPPORT_TICKET')
         AND UPPER(COALESCE(status, 'OPEN')) IN (
           'OPEN','ASSIGNED','IN_PROGRESS','ESCALATED','REOPENED','PENDING','PENDING_INTERNAL'
         )
         AND COALESCE(unread_admin_count, 0) > 0`,
    ),
    // Open tickets still in agent queue (not waiting on user / closed)
    count(
      `SELECT COUNT(*)::int AS c FROM support_conversations
       WHERE UPPER(COALESCE(support_type, 'TICKET')) IN ('TICKET', 'SUPPORT_TICKET')
         AND UPPER(COALESCE(status, 'OPEN')) IN (
           'OPEN','ASSIGNED','IN_PROGRESS','ESCALATED','REOPENED','PENDING','PENDING_INTERNAL'
         )`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM support_conversations
       WHERE UPPER(COALESCE(support_type, '')) = 'LIVE_CHAT'
         AND UPPER(COALESCE(status, '')) IN ('WAITING', 'ACTIVE')
         AND (
           COALESCE(unread_admin_count, 0) > 0
           OR assigned_agent_id IS NULL
           OR UPPER(COALESCE(status, '')) = 'WAITING'
         )`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM support_conversations
       WHERE sla_due_at IS NOT NULL
         AND sla_due_at < NOW()
         AND UPPER(COALESCE(status, 'OPEN')) IN (
           'OPEN','ASSIGNED','IN_PROGRESS','ESCALATED','REOPENED','PENDING','PENDING_INTERNAL','WAITING','ACTIVE'
         )`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM kyc_cases
       WHERE UPPER(COALESCE(status, '')) IN ('UNDER_REVIEW', 'PENDING', 'RESUBMISSION_REQUIRED')`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM withdrawals
       WHERE UPPER(status) IN (
         'REQUESTED','PENDING','PENDING_APPROVAL','PENDING_REVIEW','UNDER_REVIEW','HOLD','PENDING_CHECKER'
       )`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM maker_checker_requests
       WHERE UPPER(COALESCE(status, '')) IN ('PENDING', 'PENDING_APPROVAL', 'SUBMITTED', 'AWAITING_CHECKER')`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM settlement_jobs
       WHERE UPPER(COALESCE(status, '')) IN ('PENDING', 'OPEN', 'QUEUED', 'PROCESSING', 'FAILED')`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM bets b
       JOIN matches m ON b.match_id = m.match_id
       WHERE b.status = 'PENDING' AND m.status = 'COMPLETED'`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM markets
       WHERE UPPER(COALESCE(status, '')) = 'SUSPENDED'`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM promo_abuse_alerts
       WHERE UPPER(COALESCE(status, '')) = 'OPEN'`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM incidents
       WHERE UPPER(status) NOT IN ('RESOLVED', 'CLOSED', 'POSTMORTEM')
         AND COALESCE(updated_at, created_at) > NOW() - INTERVAL '14 days'`,
    ),
    // Only high-severity / recent recon — avoid flooding from stale OPEN rows
    count(
      `SELECT COUNT(*)::int AS c FROM reconciliation_cases
       WHERE UPPER(COALESCE(status, '')) = 'OPEN'
         AND (
           UPPER(COALESCE(severity, '')) IN ('HIGH', 'CRITICAL')
           OR COALESCE(updated_at, created_at) > NOW() - INTERVAL '7 days'
         )`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM admin_notifications
       WHERE UPPER(COALESCE(status, 'OPEN')) = 'OPEN'
         AND COALESCE(created_at, NOW()) > NOW() - INTERVAL '7 days'
         AND UPPER(COALESCE(severity, priority, 'HIGH')) IN ('HIGH', 'CRITICAL', 'URGENT')`,
    ),
    (async () => {
      try {
        const { getCachedAggregatedLiveScores } = await import('./aggregator.mjs');
        const snap = getCachedAggregatedLiveScores();
        const sources = snap?.sources || {};
        return Object.values(sources).filter((s) => s === 'error').length;
      } catch {
        return 0;
      }
    })(),
  ]);

  const subModules = {};
  const put = (domainId, subId, n, label) => {
    const e = entry(n, label);
    if (e) subModules[`${domainId}:${subId}`] = e;
  };

  const ticketBadge = supportNeedsReply > 0 ? supportNeedsReply : supportOpenTickets;
  put('support', 'ticket-queue', ticketBadge, supportNeedsReply > 0 ? 'Awaiting reply' : 'Open tickets');
  put('support', 'chat-console', supportWaitingChat, 'Live chats');
  put('support', 'sla-alerts', supportSlaBreached, 'SLA breached');

  put('customers', 'kyc-queue', kycPendingReview, 'KYC review');

  put('finance', 'cash-money', pendingWithdrawals, 'Withdrawals');
  put('finance', 'investigation', pendingMakerChecker, 'Maker-checker');

  put('betting', 'settlement-engine', settlementPending, 'Settlement');
  put('betting', 'bets-registry', stuckBets, 'Stuck bets');

  put('trading-risk', 'suspension', suspendedMarkets, 'Suspended markets');
  put('trading-risk', 'odds-health', feedErrors, 'Feed errors');

  put('sports', 'providers', feedErrors, 'Feed errors');

  put('growth', 'promo-abuse', promoAbuseOpen, 'Promo abuse');

  put('communications', 'mail-inbox', openAdminNotifs, 'Open alerts');

  put('control-tower', 'incidents', openIncidents, 'Incidents');

  put('analytics', 'turnover-ggr', openRecon, 'Open recon');
  put('operations', 'ops-queues', settlementPending + pendingMakerChecker, 'Queues');

  const domains = {};
  for (const [key, val] of Object.entries(subModules)) {
    const domainId = key.split(':')[0];
    if (!domains[domainId]) domains[domainId] = { count: 0, label: val.label };
    domains[domainId].count += val.count;
  }

  return {
    domains,
    subModules,
    updatedAt: new Date().toISOString(),
  };
}
