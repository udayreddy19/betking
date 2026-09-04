/**
 * Honest actionable counts for Admin sidebar badges.
 * Each count MUST match the rows the operator sees when they open that panel.
 * Silent SQL failures → 0 (never invent numbers).
 *
 * Mapping (badge key → panel source of truth):
 *   support:ticket-queue     → open tickets needing admin reply (unread_admin_count)
 *   support:chat-console     → waiting/unassigned live chats
 *   support:sla-alerts       → open tickets past sla_due_at
 *   customers:kyc-queue      → kyc_cases in review
 *   finance:cash-money       → pending withdrawals (same statuses as listPendingWithdrawals)
 *   finance:pending-approvals→ maker_checker pending
 *   betting:settlement-engine→ open/pending/accepted bets (Pending Desk / pendingOnly=1)
 *   betting:bets-registry    → PENDING bets on COMPLETED matches
 *   operations:ops-queues    → settlement jobs shown on Ops Settlement queue
 *                              (pending+failed statuses from settlementQueue.mjs)
 *   communications:*         → failed webhook deliveries + recent failed outbox
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

const OPEN_SUPPORT = `('OPEN','ASSIGNED','IN_PROGRESS','ESCALATED','REOPENED','PENDING','PENDING_INTERNAL','WAITING','ACTIVE')`;

/** Statuses returned by getPendingSettlementJobs + getFailedSettlementJobs */
const SETTLEMENT_JOB_ACTIVE = `('PENDING','RETRY','AWAITING_EVIDENCE','PROCESSING','FAILED','DEAD_LETTER')`;

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
    supportWaitingChat,
    supportSlaBreached,
    kycPendingReview,
    pendingWithdrawals,
    pendingMakerChecker,
    pendingDeclareBets,
    stuckBets,
    settlementQueueJobs,
    failedWebhookDeliveries,
    failedOutbox,
  ] = await Promise.all([
    count(
      `SELECT COUNT(*)::int AS c FROM support_conversations
       WHERE COALESCE(unread_admin_count, 0) > 0
         AND UPPER(COALESCE(status, 'OPEN')) IN ${OPEN_SUPPORT}`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM support_conversations
       WHERE ticket_number IS NULL
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
         AND UPPER(COALESCE(status, 'OPEN')) IN ${OPEN_SUPPORT}`,
    ),
    count(
      // Same statuses as GET /kyc/cases?status=PENDING_QUEUE (profile + latest case)
      `SELECT COUNT(*)::int AS c
       FROM user_profiles p
       LEFT JOIN LATERAL (
         SELECT status
         FROM kyc_cases kc
         WHERE kc.user_id = p.user_id
         ORDER BY kc.updated_at DESC NULLS LAST
         LIMIT 1
       ) c ON TRUE
       WHERE UPPER(COALESCE(c.status, p.kyc_status, '')) IN (
         'UNDER_REVIEW', 'PENDING', 'RESUBMISSION_REQUIRED'
       )`,
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
    // Bets → Settlement (Pending Desk): same filter as listBets({ pendingOnly: true })
    count(
      `SELECT COUNT(*)::int AS c FROM bets
       WHERE UPPER(status) IN ('PENDING', 'OPEN', 'ACCEPTED')`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM bets b
       JOIN matches m ON b.match_id = m.match_id
       WHERE UPPER(b.status) = 'PENDING' AND UPPER(m.status) = 'COMPLETED'`,
    ),
    // Ops → Queues / Settlement: same statuses as settlementQueue pending+failed lists
    count(
      `SELECT COUNT(*)::int AS c FROM settlement_jobs
       WHERE UPPER(COALESCE(status, '')) IN ${SETTLEMENT_JOB_ACTIVE}`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM webhook_deliveries
       WHERE UPPER(COALESCE(status, '')) IN ('FAILED', 'DEAD_LETTER', 'DLQ', 'ERROR')`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM outbox_events
       WHERE UPPER(COALESCE(status, '')) IN ('FAILED', 'DEAD_LETTER')
         AND COALESCE(updated_at, created_at) > NOW() - INTERVAL '7 days'`,
    ),
  ]);

  const failedDeliveries = failedWebhookDeliveries + failedOutbox;

  const subModules = {};
  const put = (domainId, subId, n, label) => {
    const e = entry(n, label);
    if (e) subModules[`${domainId}:${subId}`] = e;
  };

  put('support', 'ticket-queue', supportNeedsReply, 'Awaiting reply');
  put('support', 'chat-console', supportWaitingChat, 'Live chats');
  put('support', 'sla-alerts', supportSlaBreached, 'SLA breached');

  put('customers', 'kyc-queue', kycPendingReview, 'KYC review');

  put('finance', 'cash-money', pendingWithdrawals, 'Withdrawals');
  put('finance', 'pending-approvals', pendingMakerChecker, 'Approvals');

  put('betting', 'settlement-engine', pendingDeclareBets, 'Pending declare');
  put('betting', 'bets-registry', stuckBets, 'Stuck bets');

  // Job queue lives under Ops — not under Bets → Settlement (that panel is bet declare)
  put('operations', 'ops-queues', settlementQueueJobs, 'Settlement jobs');
  put('operations', 'settlement-queue', settlementQueueJobs, 'Settlement jobs');

  put('communications', 'mail-inbox', failedDeliveries, 'Failed deliveries');
  put('communications', 'dlq-retry', failedDeliveries, 'Failed deliveries');

  const domains = {};
  const skipDomainSum = new Set([
    'communications:dlq-retry', // alias of mail-inbox
    'operations:settlement-queue', // hub alias of ops-queues
  ]);
  for (const [key, val] of Object.entries(subModules)) {
    if (skipDomainSum.has(key)) continue;
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
