/**
 * Real domain payloads for Admin Control Center sections.
 * Prefer PostgreSQL / engines; return empty arrays when tables are empty — never invent demo users/bets.
 */

import { getCachedAggregatedLiveScores, aggregateLiveScores } from './aggregator.mjs';
import { getMatchState } from './matchState.mjs';
import { getAdminConfigSummary } from './adminConfig.mjs';
import { getAuditLogs as getInMemorySecurityLogs } from './securityAudit.mjs';
import { enterpriseAuditEngine } from './enterpriseAuditEngine.mjs';

let pgQuery = null;
async function q(text, params = []) {
  try {
    if (!pgQuery) {
      const mod = await import('../db/pg.js');
      pgQuery = mod.query;
    }
    return await pgQuery(text, params);
  } catch (err) {
    return { rows: [], error: err.message };
  }
}

async function liveSnapshot() {
  return getCachedAggregatedLiveScores() || aggregateLiveScores({ force: false });
}

function money(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

/** Never surface raw Postgres schema errors in the admin UI. */
function schemaNote(err) {
  if (!err) return undefined;
  const msg = String(err);
  if (/column .* does not exist/i.test(msg) || /relation .* does not exist/i.test(msg)) {
    return 'This section has no matching records for the current database schema.';
  }
  return msg;
}

export async function listCustomers({ limit = 100 } = {}) {
  const res = await q(
    `SELECT u.user_id AS id,
            COALESCE(p.display_name, split_part(u.email, '@', 1), u.user_id) AS name,
            u.email,
            u.phone,
            COALESCE(w.balance, 0) AS balance,
            COALESCE(p.kyc_status, 'NOT_STARTED') AS kyc,
            COALESCE(p.account_status, 'ACTIVE') AS status,
            COALESCE(p.risk_tier, 'LOW') AS risk,
            to_char(u.created_at, 'YYYY-MM-DD') AS "regDate"
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.user_id
     LEFT JOIN wallets w ON w.user_id = u.user_id
     ORDER BY u.created_at DESC
     LIMIT $1`,
    [limit],
  );
  return {
    users: (res.rows || []).map((r) => ({
      ...r,
      balance: money(r.balance),
      kyc: String(r.kyc || 'NOT_STARTED').toUpperCase(),
      status: String(r.status || 'ACTIVE').toUpperCase(),
      risk: String(r.risk || 'LOW').toUpperCase().replace('_RISK', ''),
    })),
    source: res.error ? 'error' : 'database',
    note: schemaNote(res.error),
  };
}

export async function listBets({ limit = 100 } = {}) {
  const res = await q(
    `SELECT b.bet_id AS id,
            b.user_id AS "userId",
            COALESCE(b.match_id, 'n/a') AS match,
            COALESCE(b.selection_id, 'n/a') AS selection,
            b.stake,
            b.odds,
            b.potential_payout AS payout,
            UPPER(b.status) AS status,
            to_char(b.created_at, 'YYYY-MM-DD HH24:MI') AS date
     FROM bets b
     ORDER BY b.created_at DESC
     LIMIT $1`,
    [limit],
  );
  return {
    bets: (res.rows || []).map((r) => ({
      ...r,
      stake: money(r.stake),
      odds: Number(r.odds) || null,
      payout: money(r.payout),
      status: String(r.status || 'PENDING'),
    })),
    source: res.error ? 'error' : 'database',
    note: schemaNote(res.error),
  };
}

export async function listPendingWithdrawals({ limit = 100 } = {}) {
  const res = await q(
    `SELECT w.withdrawal_id AS id,
            w.user_id AS "userId",
            COALESCE(p.display_name, u.email, w.user_id) AS "userName",
            w.amount,
            COALESCE(w.bank_details->>'method', w.currency, 'BANK') AS method,
            UPPER(w.status) AS status,
            to_char(w.created_at, 'YYYY-MM-DD HH24:MI') AS "requestedAt",
            COALESCE(w.payout_id, w.bank_details->>'utr', '—') AS utr
     FROM withdrawals w
     LEFT JOIN users u ON u.user_id = w.user_id
     LEFT JOIN user_profiles p ON p.user_id = w.user_id
     WHERE UPPER(w.status) IN ('REQUESTED', 'PENDING', 'PENDING_APPROVAL', 'PENDING_REVIEW', 'UNDER_REVIEW', 'HOLD')
     ORDER BY CASE
                WHEN COALESCE(w.bank_details->>'vipPriority', 'false') IN ('true', 't', '1') THEN 0
                ELSE 1
              END,
              w.created_at ASC
     LIMIT $1`,
    [limit],
  );
  return {
    requests: (res.rows || []).map((r) => ({
      ...r,
      amount: money(r.amount),
      status: r.status || 'PENDING_APPROVAL',
    })),
    source: res.error ? 'error' : 'database',
    note: schemaNote(res.error),
  };
}

export async function listSupportTickets({ limit = 100 } = {}) {
  const res = await q(
    `SELECT conversation_id AS id,
            user_id AS "userId",
            COALESCE(NULLIF(subject, ''), category, 'Support request') AS subject,
            COALESCE(category, 'Other') AS category,
            COALESCE(priority, 'MEDIUM') AS priority,
            UPPER(COALESCE(status, 'OPEN')) AS status,
            COALESCE(
              NULLIF(assigned_agent_name, ''),
              NULLIF(assigned_agent, ''),
              NULLIF(assigned_agent_id, ''),
              'Unassigned'
            ) AS agent,
            to_char(created_at, 'YYYY-MM-DD HH24:MI') AS "createdAt",
            CASE
              WHEN resolution_due_at IS NOT NULL
                   AND resolution_due_at < NOW()
                   AND UPPER(COALESCE(status, 'OPEN')) NOT IN ('RESOLVED', 'CLOSED')
                THEN 'BREACHED'
              WHEN first_response_due_at IS NOT NULL
                   AND first_response_due_at < NOW()
                   AND first_response_at IS NULL
                   AND UPPER(COALESCE(status, 'OPEN')) NOT IN ('RESOLVED', 'CLOSED')
                THEN 'BREACHED'
              ELSE 'WITHIN_SLA'
            END AS sla
     FROM support_conversations
     ORDER BY CASE UPPER(COALESCE(priority, 'MEDIUM'))
                WHEN 'URGENT' THEN 0
                WHEN 'HIGH' THEN 1
                WHEN 'MEDIUM' THEN 2
                ELSE 3
              END,
              created_at ASC
     LIMIT $1`,
    [limit],
  );

  // Older installs may lack SLA / agent_name columns — retry with core fields only.
  const finalRes = res.error
    ? await q(
      `SELECT conversation_id AS id,
              user_id AS "userId",
              COALESCE(NULLIF(subject, ''), category, 'Support request') AS subject,
              COALESCE(category, 'Other') AS category,
              COALESCE(priority, 'MEDIUM') AS priority,
              UPPER(COALESCE(status, 'OPEN')) AS status,
              COALESCE(NULLIF(assigned_agent, ''), 'Unassigned') AS agent,
              to_char(created_at, 'YYYY-MM-DD HH24:MI') AS "createdAt",
              'WITHIN_SLA' AS sla
       FROM support_conversations
       ORDER BY CASE UPPER(COALESCE(priority, 'MEDIUM'))
                  WHEN 'URGENT' THEN 0
                  WHEN 'HIGH' THEN 1
                  WHEN 'MEDIUM' THEN 2
                  ELSE 3
                END,
                created_at ASC
       LIMIT $1`,
      [limit],
    )
    : res;

  const tickets = (finalRes.rows || []).map((r) => ({
    ...r,
    userName: r.userName,
    priority: String(r.priority || 'MEDIUM').toUpperCase(),
    status: String(r.status || 'OPEN').toUpperCase(),
  }));

  return {
    tickets,
    source: finalRes.error ? 'error' : 'database',
    note: schemaNote(finalRes.error),
  };
}

export async function listPromotions({ limit = 100 } = {}) {
  const res = await q(
    `SELECT id,
            name,
            code,
            COALESCE(used_budget, 0) AS claims_proxy,
            COALESCE(max_reward, 0) AS "maxBonus",
            UPPER(status) AS status,
            type
     FROM promotions
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );

  // claims column may not exist — count user_bonuses when possible
  const claimRes = await q(
    `SELECT promotion_id, COUNT(*)::int AS claims
     FROM user_bonuses
     GROUP BY promotion_id`,
  );
  const claimMap = new Map((claimRes.rows || []).map((r) => [r.promotion_id, r.claims]));

  return {
    promotions: (res.rows || []).map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      bonusPct: null,
      maxBonus: money(r.maxBonus),
      claims: claimMap.get(r.id) ?? money(r.claims_proxy),
      status: r.status || 'ACTIVE',
      type: r.type || null,
    })),
    source: res.error ? 'error' : 'database',
    note: schemaNote(res.error),
  };
}

export async function listCommunicationLogs({ limit = 100 } = {}) {
  const res = await q(
    `SELECT id,
            'WEBHOOK' AS channel,
            COALESCE(event_type, 'event') AS template,
            UPPER(status) AS status,
            COALESCE(event_id, id) AS recipient,
            'webhook_engine' AS provider,
            to_char(created_at, 'YYYY-MM-DD HH24:MI') AS "sentAt"
     FROM webhook_deliveries
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  return {
    logs: res.rows || [],
    source: res.error ? 'error' : 'database',
    note: res.error
      ? schemaNote(res.error) || 'No communication delivery table available yet'
      : ((res.rows || []).length ? undefined : 'No notification deliveries recorded yet'),
  };
}

export async function listAnalyticsReports() {
  const snap = await liveSnapshot();
  const matches = snap?.matches || [];
  const live = matches.filter((m) => getMatchState(m) === 'in').length;
  const users = await q('SELECT COUNT(*)::int AS c FROM users');
  const bets = await q(`SELECT COUNT(*)::int AS c FROM bets WHERE UPPER(status) IN ('PENDING','OPEN')`);
  const turnover = await q(`SELECT COALESCE(SUM(stake),0)::float AS c FROM bets`);
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');

  return {
    reports: [
      {
        id: 'rep-live-feeds',
        name: 'Live Match Feed Snapshot',
        frequency: 'REALTIME',
        format: 'JSON',
        lastGenerated: now,
        status: 'READY',
        value: live,
        detail: `${live} live / ${matches.length} total matches`,
      },
      {
        id: 'rep-users',
        name: 'Registered Users Count',
        frequency: 'ON_DEMAND',
        format: 'JSON',
        lastGenerated: now,
        status: users.error ? 'UNAVAILABLE' : 'READY',
        value: users.rows?.[0]?.c ?? null,
        detail: users.error || `${users.rows?.[0]?.c ?? 0} users`,
      },
      {
        id: 'rep-open-bets',
        name: 'Open / Pending Bets',
        frequency: 'ON_DEMAND',
        format: 'JSON',
        lastGenerated: now,
        status: bets.error ? 'UNAVAILABLE' : 'READY',
        value: bets.rows?.[0]?.c ?? null,
        detail: bets.error || `${bets.rows?.[0]?.c ?? 0} open bets`,
      },
      {
        id: 'rep-turnover',
        name: 'Gross Stake Turnover (all-time)',
        frequency: 'ON_DEMAND',
        format: 'JSON',
        lastGenerated: now,
        status: turnover.error ? 'UNAVAILABLE' : 'READY',
        value: turnover.rows?.[0]?.c ?? null,
        detail: turnover.error || `₹${Number(turnover.rows?.[0]?.c || 0).toLocaleString()}`,
      },
    ],
    source: 'live+database',
  };
}

export async function listApiKeys({ limit = 50 } = {}) {
  const res = await q(
    `SELECT id,
            COALESCE(environment, 'PRODUCTION') AS name,
            key_prefix AS prefix,
            array_to_string(scopes, ',') AS scope,
            to_char(created_at, 'YYYY-MM-DD') AS "createdAt",
            UPPER(status) AS status
     FROM api_keys
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  return {
    keys: (res.rows || []).map((r) => ({
      ...r,
      name: r.name || 'API Key',
      scope: r.scope || '—',
    })),
    source: res.error ? 'error' : 'database',
    note: schemaNote(res.error),
  };
}

export async function listFeatureFlags() {
  const cfg = getAdminConfigSummary();
  const sports = Object.entries(cfg.enabledSports || {}).map(([sport, enabled]) => ({
    key: `SPORT_ENABLED_${String(sport).toUpperCase().replace(/-/g, '_')}`,
    description: `Enable ${sport} on sportsbook`,
    enabled: !!enabled,
  }));
  return {
    flags: [
      {
        key: 'GLOBAL_MARGIN_PCT',
        description: `Global pricing margin (${cfg.globalMarginPct}%)`,
        enabled: true,
        value: cfg.globalMarginPct,
      },
      ...sports,
    ],
  };
}

export async function buildOperationsHealth() {
  const pg = await q('SELECT 1 AS ok');
  const snap = await liveSnapshot();
  const sources = snap?.sources || {};
  const sourceRows = Object.entries(sources).map(([name, status]) => ({
    service: `Feed · ${name}`,
    status: status === 'ok' ? 'HEALTHY' : status === 'error' ? 'DEGRADED' : String(status || 'UNKNOWN').toUpperCase(),
    latency: snap?.cached ? 'cache' : 'fresh',
    uptime: status === 'ok' ? 'OK' : 'CHECK',
  }));

  return {
    services: [
      {
        service: 'PostgreSQL Database',
        status: pg.error ? 'DOWN' : 'HEALTHY',
        latency: pg.error ? 'n/a' : 'ok',
        uptime: pg.error ? pg.error : 'connected',
      },
      {
        service: 'Admin API Process',
        status: 'HEALTHY',
        latency: 'local',
        uptime: process.uptime ? `${Math.round(process.uptime())}s` : 'up',
      },
      {
        service: 'Live Scores Aggregator',
        status: (snap?.matches || []).length ? 'HEALTHY' : 'IDLE',
        latency: snap?.stale ? 'stale-cache' : (snap?.cached ? 'cache' : 'fresh'),
        uptime: `${(snap?.matches || []).length} matches`,
      },
      ...sourceRows,
    ],
    postgres: pg.error ? 'DOWN' : 'HEALTHY',
    redis: 'UNKNOWN',
    websocket: 'HEALTHY',
    cricbuzzFeed: sources.cricbuzz === 'ok' ? 'HEALTHY' : (sources.cricbuzz === 'error' ? 'DEGRADED' : 'UNKNOWN'),
    razorpayGateway: 'UNKNOWN',
    outboxQueue: 'UNKNOWN',
    timestamp: new Date().toISOString(),
  };
}

export async function listAuditLogs({ limit = 100 } = {}) {
  const db = await q(
    `SELECT event_id::text AS id,
            actor_id AS actor,
            action,
            COALESCE(target_id, '—') AS entity,
            COALESCE(details->>'ip', '—') AS ip,
            to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS timestamp,
            COALESCE(details->>'tenant', 'oddsyra_in') AS tenant
     FROM audit_events
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );

  const memory = [
    ...getInMemorySecurityLogs({}).map((l) => ({
      id: l.id,
      actor: l.userId,
      action: l.action,
      entity: l.resource,
      ip: l.ipAddress,
      timestamp: l.isoTime,
      tenant: 'oddsyra_in',
    })),
    ...enterpriseAuditEngine.getLogs({ limit: 50 }).map((e) => ({
      id: e.auditId || `ent_${Date.now()}`,
      actor: e.who || 'SYSTEM',
      action: e.what || 'EVENT',
      entity: e.referenceId || '—',
      ip: '—',
      timestamp: e.when || new Date().toISOString(),
      tenant: 'oddsyra_in',
    })),
  ];

  const logs = (db.rows && db.rows.length) ? db.rows : memory.slice(-limit).reverse();
  return {
    logs,
    source: (db.rows && db.rows.length) ? 'database' : 'memory',
    note: schemaNote(db.error),
  };
}

export async function enrichControlTowerFinancials(base = {}) {
  const users = await q('SELECT COUNT(*)::int AS c FROM users');
  const openBets = await q(`SELECT COUNT(*)::int AS c FROM bets WHERE UPPER(status) IN ('PENDING','OPEN')`);
  const pendingWd = await q(
    `SELECT COUNT(*)::int AS c FROM withdrawals
     WHERE UPPER(status) IN ('REQUESTED','PENDING','PENDING_APPROVAL','UNDER_REVIEW','HOLD')`,
  );
  const tickets = await q(
    `SELECT COUNT(*)::int AS c FROM support_conversations
     WHERE UPPER(COALESCE(status,'OPEN')) NOT IN ('RESOLVED','CLOSED','RESOLVED_CLOSED')`,
  );
  const turnoverToday = await q(
    `SELECT COALESCE(SUM(stake),0)::float AS c FROM bets
     WHERE created_at >= date_trunc('day', NOW())`,
  );
  const turnoverAll = await q(`SELECT COALESCE(SUM(stake),0)::float AS c FROM bets`);
  const ggrApprox = await q(
    `SELECT COALESCE(SUM(
        CASE
          WHEN UPPER(status) IN ('LOST') THEN stake
          WHEN UPPER(status) IN ('WON') THEN stake - COALESCE(potential_payout, 0)
          ELSE 0
        END
      ), 0)::float AS c
     FROM bets
     WHERE UPPER(status) IN ('WON','LOST')`,
  );

  const registeredUsers = users.rows?.[0]?.c ?? null;
  const todayTurnover = turnoverToday.error
    ? (turnoverAll.rows?.[0]?.c ?? null)
    : (turnoverToday.rows?.[0]?.c ?? null);

  return {
    ...base,
    registeredUsers,
    activeUsers: registeredUsers,
    openBets: openBets.rows?.[0]?.c ?? base.openBets ?? null,
    pendingWithdrawals: pendingWd.rows?.[0]?.c ?? base.pendingWithdrawals ?? null,
    openTickets: tickets.rows?.[0]?.c ?? base.openTickets ?? null,
    todayTurnover,
    stakeTurnoverAllTime: turnoverAll.rows?.[0]?.c ?? null,
    ggr: ggrApprox.rows?.[0]?.c ?? base.ggr ?? null,
    ggrNote: ggrApprox.error ? undefined : 'Settled stake − payouts (approx)',
    turnoverScope: turnoverToday.error ? 'all-time' : 'today',
    note: 'Live feeds from aggregator · financial KPIs from Postgres',
  };
}

export async function listLedgerEntries({ limit = 100 } = {}) {
  const res = await q(
    `SELECT entry_id AS id,
            wallet_id AS "walletId",
            transaction_id AS "transactionId",
            UPPER(type) AS type,
            amount,
            balance_after AS "balanceAfter",
            COALESCE(description, '—') AS description,
            to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS "createdAt"
     FROM ledger_entries
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  return {
    entries: (res.rows || []).map((r) => ({
      ...r,
      amount: money(r.amount),
      balanceAfter: money(r.balanceAfter),
    })),
    source: res.error ? 'error' : 'database',
    note: schemaNote(res.error),
  };
}

export function listPaymentGatewayStatus() {
  const razorpayConfigured = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  const webhookConfigured = !!process.env.RAZORPAY_WEBHOOK_SECRET
    && process.env.RAZORPAY_WEBHOOK_SECRET !== 'whsec_test_placeholder';
  const phonepeConfigured = !!(process.env.PHONEPE_MERCHANT_ID && process.env.PHONEPE_SALT_KEY);

  return {
    gateways: [
      {
        id: 'razorpay',
        name: 'Razorpay (UPI / Cards)',
        status: razorpayConfigured ? (webhookConfigured ? 'CONFIGURED' : 'PARTIAL') : 'NOT_CONFIGURED',
        webhook: webhookConfigured ? 'VERIFIED' : 'MISSING',
        methods: 'UPI, Cards, NetBanking',
        detail: razorpayConfigured
          ? (webhookConfigured ? 'Credentials and webhook secret present' : 'Keys set — webhook secret missing or placeholder')
          : 'RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set',
      },
      {
        id: 'phonepe',
        name: 'PhonePe (UPI failover)',
        status: phonepeConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED',
        webhook: phonepeConfigured ? 'CONFIGURED' : 'N/A',
        methods: 'UPI',
        detail: phonepeConfigured ? 'Merchant credentials present' : 'PHONEPE_MERCHANT_ID / PHONEPE_SALT_KEY not set',
      },
      {
        id: 'bank-transfer',
        name: 'Manual Bank Transfer',
        status: 'ACTIVE',
        webhook: 'N/A',
        methods: 'IMPS / NEFT',
        detail: 'Manual reconciliation via finance admin review',
      },
    ],
    source: 'environment',
  };
}

export async function listVipTierCatalog() {
  const { getVipBenefitsCatalog, VIP_TIER_POINTS } = await import('./vipBenefits.mjs');
  const catalog = getVipBenefitsCatalog();
  const tiers = (catalog.tiers || []).map((tier) => {
    const benefits = catalog.benefits[tier] || {};
    return {
      tier,
      label: benefits.label || tier,
      pointsRequired: VIP_TIER_POINTS[tier] ?? 0,
      pointsPer100: benefits.pointsPer100,
      cashbackPct: benefits.cashbackPct,
      maxWithdraw: benefits.maxWithdraw,
      cashoutPayoutPct: benefits.cashoutPayoutPct != null ? `${Math.round(benefits.cashoutPayoutPct * 100)}%` : '—',
      oddsBoostPct: benefits.oddsBoostPct,
      spinMultiplier: benefits.spinMultiplier,
      supportSlaMinutes: benefits.supportSlaMinutes,
      withdrawReviewHours: benefits.withdrawReviewHours,
      priorityWithdraw: benefits.priorityWithdraw ? 'Yes' : 'No',
      prioritySupport: benefits.prioritySupport ? 'Yes' : 'No',
      dedicatedManager: benefits.dedicatedManager ? 'Yes' : 'No',
    };
  });
  return { tiers, source: 'catalog', minDeposit: catalog.minDeposit, minWithdraw: catalog.minWithdraw };
}

export async function listOutboxQueueEvents({ limit = 50 } = {}) {
  const res = await q(
    `SELECT id,
            event_type AS "eventType",
            aggregate_type AS "aggregateType",
            aggregate_id AS "aggregateId",
            UPPER(status) AS status,
            to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS "createdAt"
     FROM outbox_events
     WHERE UPPER(status) IN ('PENDING', 'PROCESSING', 'FAILED', 'DEAD_LETTER')
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  return {
    events: res.rows || [],
    source: res.error ? 'error' : 'database',
    note: schemaNote(res.error),
  };
}
