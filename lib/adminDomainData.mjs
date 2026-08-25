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
    if (typeof pgQuery !== 'function') {
      const mod = await import('../db/pg.js');
      pgQuery = mod.queryRead || mod.query;
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

export async function listCustomers({
  limit = 100,
  kycFilter = null,
  q: search = null,
} = {}) {
  const clauses = [];
  const params = [];
  let idx = 1;

  const cooldownHours = Math.max(
    1,
    parseInt(process.env.KYC_REMINDER_COOLDOWN_HOURS || '24', 10) || 24,
  );
  // Trusted integer from env — safe to interpolate into INTERVAL literals
  const cooldownInterval = `${cooldownHours} hours`;

  const filter = String(kycFilter || '').trim().toUpperCase();
  if (filter === 'NEEDS_KYC' || filter === 'NEEDS_KYC_ELIGIBLE') {
    clauses.push(`UPPER(COALESCE(p.kyc_status, 'NOT_STARTED')) NOT IN ('VERIFIED', 'APPROVED')`);
  } else if (filter === 'COMPLETED' || filter === 'VERIFIED') {
    clauses.push(`UPPER(COALESCE(p.kyc_status, 'NOT_STARTED')) IN ('VERIFIED', 'APPROVED')`);
  } else if (filter && filter !== 'ALL') {
    clauses.push(`UPPER(COALESCE(p.kyc_status, 'NOT_STARTED')) = $${idx}`);
    params.push(filter);
    idx += 1;
  }

  if (filter === 'NEEDS_KYC_ELIGIBLE') {
    clauses.push(`NOT EXISTS (
      SELECT 1 FROM kyc_reminder_log kr
      WHERE kr.user_id = u.user_id
        AND kr.delivery_status IN ('QUEUED', 'SENT')
        AND kr.created_at > NOW() - INTERVAL '${cooldownInterval}'
    )`);
  }

  if (search) {
    clauses.push(`(
      u.user_id ILIKE $${idx}
      OR COALESCE(u.email, '') ILIKE $${idx}
      OR COALESCE(u.phone, '') ILIKE $${idx}
      OR COALESCE(u.first_name, '') ILIKE $${idx}
      OR COALESCE(u.last_name, '') ILIKE $${idx}
      OR COALESCE(p.display_name, '') ILIKE $${idx}
    )`);
    params.push(`%${String(search).trim()}%`);
    idx += 1;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(Math.min(Math.max(Number(limit) || 100, 1), 500));

  const res = await q(
    `SELECT u.user_id AS id,
            COALESCE(
              NULLIF(TRIM(p.display_name), ''),
              NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
              split_part(u.email, '@', 1),
              u.user_id
            ) AS name,
            u.email,
            u.phone,
            COALESCE(w.balance, 0) AS balance,
            COALESCE(p.kyc_status, 'NOT_STARTED') AS kyc,
            COALESCE(p.account_status, 'ACTIVE') AS status,
            COALESCE(p.risk_tier, 'LOW') AS risk,
            to_char(u.created_at, 'YYYY-MM-DD') AS "regDate",
            rem.reminder_count AS "reminderCount",
            rem.last_sent_at AS "lastReminderAt",
            rem.last_delivery_status AS "lastReminderStatus",
            rem.cooldown_until AS "cooldownUntil"
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.user_id
     LEFT JOIN wallets w ON w.user_id = u.user_id
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) FILTER (WHERE delivery_status = 'SENT')::int AS reminder_count,
         MAX(sent_at) FILTER (WHERE delivery_status = 'SENT') AS last_sent_at,
         (
           SELECT delivery_status
           FROM kyc_reminder_log k2
           WHERE k2.user_id = u.user_id
           ORDER BY k2.created_at DESC
           LIMIT 1
         ) AS last_delivery_status,
         (
           SELECT k3.created_at + INTERVAL '${cooldownInterval}'
           FROM kyc_reminder_log k3
           WHERE k3.user_id = u.user_id
             AND k3.delivery_status IN ('QUEUED', 'SENT')
             AND k3.created_at > NOW() - INTERVAL '${cooldownInterval}'
           ORDER BY k3.created_at DESC
           LIMIT 1
         ) AS cooldown_until
       FROM kyc_reminder_log k1
       WHERE k1.user_id = u.user_id
     ) rem ON TRUE
     ${where}
     ORDER BY u.created_at DESC
     LIMIT $${idx}`,
    params,
  );

  let nextEligibleAt = null;
  if (filter === 'NEEDS_KYC_ELIGIBLE' || filter === 'NEEDS_KYC') {
    const nextRes = await q(
      `SELECT MIN(kr.created_at + INTERVAL '${cooldownInterval}') AS next_at
       FROM kyc_reminder_log kr
       INNER JOIN users u ON u.user_id = kr.user_id
       LEFT JOIN user_profiles p ON p.user_id = u.user_id
       WHERE kr.delivery_status IN ('QUEUED', 'SENT')
         AND kr.created_at > NOW() - INTERVAL '${cooldownInterval}'
         AND UPPER(COALESCE(p.kyc_status, 'NOT_STARTED')) NOT IN ('VERIFIED', 'APPROVED')`,
    );
    nextEligibleAt = nextRes.rows?.[0]?.next_at || null;
  }

  return {
    users: (res.rows || []).map((r) => ({
      ...r,
      balance: money(r.balance),
      kyc: String(r.kyc || 'NOT_STARTED').toUpperCase(),
      status: String(r.status || 'ACTIVE').toUpperCase(),
      risk: String(r.risk || 'LOW').toUpperCase().replace('_RISK', ''),
      reminderCount: Number(r.reminderCount || 0),
      lastReminderAt: r.lastReminderAt || null,
      lastReminderStatus: r.lastReminderStatus || null,
      cooldownUntil: r.cooldownUntil || null,
      needsKycReminder: !['VERIFIED', 'APPROVED'].includes(String(r.kyc || 'NOT_STARTED').toUpperCase()),
      reminderEligible: !r.cooldownUntil,
    })),
    cooldownHours,
    nextEligibleAt,
    source: res.error ? 'error' : 'database',
    note: schemaNote(res.error),
  };
}

export async function listBets({
  limit = 100,
  status = null,
  betType = null,
  q: search = null,
  pendingOnly = false,
} = {}) {
  const clauses = [];
  const params = [];
  let idx = 1;

  if (pendingOnly) {
    clauses.push(`UPPER(b.status) IN ('PENDING', 'OPEN', 'ACCEPTED')`);
  } else if (status) {
    const statuses = String(status)
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (statuses.length === 1) {
      clauses.push(`UPPER(b.status) = $${idx}`);
      params.push(statuses[0]);
      idx += 1;
    } else if (statuses.length > 1) {
      clauses.push(`UPPER(b.status) = ANY($${idx}::text[])`);
      params.push(statuses);
      idx += 1;
    }
  }

  if (betType) {
    clauses.push(`UPPER(COALESCE(b.bet_type, 'SINGLE')) = $${idx}`);
    params.push(String(betType).trim().toUpperCase());
    idx += 1;
  }

  if (search) {
    clauses.push(`(
      b.bet_id ILIKE $${idx}
      OR b.user_id ILIKE $${idx}
      OR COALESCE(u.first_name, '') ILIKE $${idx}
      OR COALESCE(u.last_name, '') ILIKE $${idx}
      OR COALESCE(p.display_name, '') ILIKE $${idx}
      OR COALESCE(u.email, '') ILIKE $${idx}
      OR COALESCE(b.match_id, '') ILIKE $${idx}
      OR COALESCE(b.placement_snapshot #>> '{legs,0,matchName}', '') ILIKE $${idx}
      OR COALESCE(b.placement_snapshot #>> '{legs,0,team1Name}', '') ILIKE $${idx}
      OR COALESCE(b.placement_snapshot #>> '{legs,0,team2Name}', '') ILIKE $${idx}
      OR COALESCE(b.market_id, '') ILIKE $${idx}
      OR COALESCE(b.selection_id, '') ILIKE $${idx}
    )`);
    params.push(`%${String(search).trim()}%`);
    idx += 1;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(Math.min(Math.max(Number(limit) || 100, 1), 500));

  const res = await q(
    `SELECT b.bet_id AS id,
            b.user_id AS "userId",
            COALESCE(
              NULLIF(TRIM(p.display_name), ''),
              NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
              split_part(u.email, '@', 1),
              b.user_id
            ) AS "userName",
            COALESCE(
              CASE
                WHEN NULLIF(TRIM(b.placement_snapshot #>> '{legs,0,matchName}'), '') IS NOT NULL
                 AND LOWER(TRIM(b.placement_snapshot #>> '{legs,0,matchName}')) <> 'live match'
                THEN TRIM(b.placement_snapshot #>> '{legs,0,matchName}')
                ELSE NULL
              END,
              CASE
                WHEN NULLIF(TRIM(b.placement_snapshot #>> '{legs,0,team1Name}'), '') IS NOT NULL
                 AND NULLIF(TRIM(b.placement_snapshot #>> '{legs,0,team2Name}'), '') IS NOT NULL
                THEN TRIM(b.placement_snapshot #>> '{legs,0,team1Name}')
                  || ' vs '
                  || TRIM(b.placement_snapshot #>> '{legs,0,team2Name}')
                ELSE NULL
              END,
              b.match_id,
              'n/a'
            ) AS match,
            COALESCE(b.market_id, 'n/a') AS market,
            COALESCE(b.bet_type, 'SINGLE') AS "betType",
            COALESCE(
              (SELECT bs.selection_name FROM bet_selections bs
               WHERE bs.bet_id = b.bet_id ORDER BY bs.created_at ASC LIMIT 1),
              b.selection_id,
              'n/a'
            ) AS selection,
            COALESCE(b.selection_id, 'n/a') AS "selectionId",
            b.stake,
            COALESCE(b.accepted_odds, b.odds) AS odds,
            b.potential_payout AS payout,
            UPPER(b.status) AS status,
            b.settlement_reason AS "settlementReason",
            to_char(b.created_at, 'YYYY-MM-DD HH24:MI') AS date,
            to_char(b.settled_at, 'YYYY-MM-DD HH24:MI') AS "settledAt"
     FROM bets b
     LEFT JOIN users u ON u.user_id = b.user_id
     LEFT JOIN user_profiles p ON p.user_id = b.user_id
     ${where}
     ORDER BY b.created_at DESC
     LIMIT $${idx}`,
    params,
  );
  return {
    bets: (res.rows || []).map((r) => ({
      ...r,
      stake: money(r.stake),
      odds: Number(r.odds) || null,
      payout: money(r.payout),
      status: String(r.status || 'PENDING'),
      betType: String(r.betType || 'SINGLE').toUpperCase(),
      market: r.market || 'n/a',
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
    `SELECT c.conversation_id AS id,
            c.user_id AS "userId",
            COALESCE(
              NULLIF(TRIM(p.display_name), ''),
              NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
              split_part(u.email, '@', 1),
              c.user_id
            ) AS "userName",
            COALESCE(NULLIF(c.subject, ''), c.category, 'Support request') AS subject,
            COALESCE(c.category, 'Other') AS category,
            COALESCE(c.priority, 'MEDIUM') AS priority,
            UPPER(COALESCE(c.status, 'OPEN')) AS status,
            COALESCE(
              NULLIF(c.assigned_agent_name, ''),
              NULLIF(c.assigned_agent, ''),
              NULLIF(c.assigned_agent_id, ''),
              'Unassigned'
            ) AS agent,
            to_char(c.created_at, 'YYYY-MM-DD HH24:MI') AS "createdAt",
            CASE
              WHEN c.resolution_due_at IS NOT NULL
                   AND c.resolution_due_at < NOW()
                   AND UPPER(COALESCE(c.status, 'OPEN')) NOT IN ('RESOLVED', 'CLOSED')
                THEN 'BREACHED'
              WHEN c.first_response_due_at IS NOT NULL
                   AND c.first_response_due_at < NOW()
                   AND c.first_response_at IS NULL
                   AND UPPER(COALESCE(c.status, 'OPEN')) NOT IN ('RESOLVED', 'CLOSED')
                THEN 'BREACHED'
              ELSE 'WITHIN_SLA'
            END AS sla
     FROM support_conversations c
     LEFT JOIN users u ON u.user_id = c.user_id
     LEFT JOIN user_profiles p ON p.user_id = c.user_id
     ORDER BY CASE UPPER(COALESCE(c.priority, 'MEDIUM'))
                WHEN 'URGENT' THEN 0
                WHEN 'HIGH' THEN 1
                WHEN 'MEDIUM' THEN 2
                ELSE 3
              END,
              c.created_at ASC
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
  const { getFeedHealthSnapshot } = await import('./feedHealthEngine.mjs');
  const feedHealth = getFeedHealthSnapshot();
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
    feedHealth,
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
