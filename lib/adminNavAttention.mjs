/**
 * Honest actionable counts for Admin sidebar badges.
 * Only queues that match what the operator sees when they open that panel.
 * Silent SQL failures → 0 (never invent numbers).
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
    kycPendingReview,
    pendingWithdrawals,
    pendingMakerChecker,
    settlementFailedOrQueued,
    stuckSettlementProcessing,
    stuckBets,
    failedWebhookDeliveries,
    failedOutbox,
  ] = await Promise.all([
    // Help → Tickets: open conversations with unread admin messages
    count(
      `SELECT COUNT(*)::int AS c FROM support_conversations
       WHERE COALESCE(unread_admin_count, 0) > 0
         AND UPPER(COALESCE(status, 'OPEN')) IN ${OPEN_SUPPORT}`,
    ),
    // Help → Chat: waiting / unassigned live chats (no ticket_number)
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
    // Real settlement work — not every forever-PROCESSING row
    count(
      `SELECT COUNT(*)::int AS c FROM settlement_jobs
       WHERE UPPER(COALESCE(status, '')) IN ('PENDING', 'OPEN', 'QUEUED', 'FAILED')`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM settlement_jobs
       WHERE UPPER(COALESCE(status, '')) = 'PROCESSING'
         AND COALESCE(updated_at, created_at) < NOW() - INTERVAL '2 hours'`,
    ),
    count(
      `SELECT COUNT(*)::int AS c FROM bets b
       JOIN matches m ON b.match_id = m.match_id
       WHERE b.status = 'PENDING' AND m.status = 'COMPLETED'`,
    ),
    // Mail → Delivery: only failed webhook deliveries that need retry
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

  const settlementNeedsAttention = settlementFailedOrQueued + stuckSettlementProcessing;

  const subModules = {};
  const put = (domainId, subId, n, label) => {
    const e = entry(n, label);
    if (e) subModules[`${domainId}:${subId}`] = e;
  };

  put('support', 'ticket-queue', supportNeedsReply, 'Awaiting reply');
  put('support', 'chat-console', supportWaitingChat, 'Live chats');

  put('customers', 'kyc-queue', kycPendingReview, 'KYC review');

  put('finance', 'maker-checker', pendingWithdrawals, 'Withdrawals');
  put('finance', 'pending-approvals', pendingMakerChecker, 'Approvals');

  put('betting', 'settlement-engine', settlementNeedsAttention, 'Settlement');
  put('betting', 'bets-registry', stuckBets, 'Stuck bets');

  put('communications', 'dlq-retry', failedWebhookDeliveries + failedOutbox, 'Failed deliveries');

  put('operations', 'ops-queues', settlementNeedsAttention + failedOutbox, 'Queues');

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
