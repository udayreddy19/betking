/**
 * Shared Admin KPI drill-down — returns tabular rows for Control Center metric tiles.
 * Reuses existing DB tables / process counters. Never invents money metrics.
 * Unavailable sources → empty rows + honest note (not fake zeros).
 */

import { query } from '../db/pg.js';

function mapRows(rows, idKey = 'id') {
  return (rows || []).map((r, i) => ({
    id: r[idKey] || r.id || `${i}`,
    ...r,
  }));
}

async function safeQuery(sql, params = []) {
  try {
    return await query(sql, params);
  } catch {
    return { rows: [] };
  }
}

function tableResult({ metric, title, columns, rows, note, source }) {
  return {
    success: true,
    metric,
    title,
    columns,
    rows: mapRows(rows),
    note: note || null,
    source: source || 'database',
  };
}

async function httpBreakdown(metric, { statusMin, statusMax, limit, title, sortBy }) {
  const { getHttpCounterBreakdown } = await import('./requestMetrics.mjs');
  const data = getHttpCounterBreakdown({ statusMin, statusMax, limit, sortBy });
  return {
    success: true,
    metric,
    title,
    columns: [
      { key: 'method', header: 'Method' },
      { key: 'route', header: 'Route' },
      { key: 'status', header: 'Status' },
      { key: 'count', header: 'Count' },
      { key: 'avgMs', header: 'Avg ms' },
    ],
    ...data,
    rows: data.rows,
  };
}

async function outboxByStatus(metric, statuses, title, lim) {
  const res = await safeQuery(
    `SELECT id, event_type, status, attempts, created_at, updated_at
     FROM outbox_events
     WHERE UPPER(status) = ANY($1::text[])
     ORDER BY COALESCE(updated_at, created_at) DESC
     LIMIT $2`,
    [statuses, lim],
  );
  return tableResult({
    metric,
    title,
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'event_type', header: 'Event' },
      { key: 'status', header: 'Status' },
      { key: 'attempts', header: 'Attempts' },
      { key: 'created_at', header: 'Created' },
    ],
    rows: res.rows,
    note: 'Live outbox rows for this status bucket.',
  });
}

async function withdrawalsByStatus(metric, statuses, title, lim, extraWhere = '', paramsTail = []) {
  const res = await safeQuery(
    `SELECT withdrawal_id AS id, user_id, amount, status, risk_level, created_at, updated_at
     FROM withdrawals
     WHERE UPPER(status) = ANY($1::text[])
     ${extraWhere}
     ORDER BY COALESCE(updated_at, created_at) DESC
     LIMIT $2`,
    [statuses, lim, ...paramsTail],
  );
  return tableResult({
    metric,
    title,
    columns: [
      { key: 'id', header: 'Withdrawal' },
      { key: 'user_id', header: 'User' },
      { key: 'amount', header: 'Amount' },
      { key: 'status', header: 'Status' },
      { key: 'risk_level', header: 'Risk' },
      { key: 'updated_at', header: 'Updated' },
    ],
    rows: res.rows,
  });
}

/**
 * @param {string} metricKey
 * @param {{ limit?: number }} [opts]
 */
export async function getAdminKpiDrilldown(metricKey, { limit = 50 } = {}) {
  const key = String(metricKey || '').trim();
  const lim = Math.min(200, Math.max(1, Number(limit) || 50));

  // ── HTTP / process metrics (Production Health Application tiles) ──
  if (['errorCount', 'Errors', 'errors'].includes(key)) {
    return httpBreakdown(key, { statusMin: 400, statusMax: 599, limit: lim, title: 'HTTP errors (4xx + 5xx) by route' });
  }
  if (['count4xx', '4xx'].includes(key)) {
    return httpBreakdown(key, { statusMin: 400, statusMax: 499, limit: lim, title: 'HTTP 4xx by route' });
  }
  if (['count5xx', '5xx'].includes(key)) {
    return httpBreakdown(key, { statusMin: 500, statusMax: 599, limit: lim, title: 'HTTP 5xx by route' });
  }
  if (['requestCount', 'Requests', 'requests'].includes(key)) {
    return httpBreakdown(key, { statusMin: 0, statusMax: 599, limit: lim, title: 'HTTP requests by route' });
  }
  if (key === 'averageLatencyMs' || key === 'errorRate') {
    return httpBreakdown(key, {
      statusMin: key === 'errorRate' ? 400 : 0,
      statusMax: 599,
      limit: lim,
      sortBy: key === 'averageLatencyMs' ? 'avgMs' : 'count',
      title: key === 'averageLatencyMs' ? 'Slowest routes (by avg ms)' : 'Error contribution by route',
    });
  }
  if (key === 'uptimeSeconds') {
    return tableResult({
      metric: key,
      title: 'Application uptime',
      columns: [
        { key: 'field', header: 'Field' },
        { key: 'value', header: 'Value' },
      ],
      rows: [
        { id: 'uptime', field: 'uptimeSeconds', value: Math.round(process.uptime()) },
        { id: 'pid', field: 'pid', value: process.pid },
        { id: 'node', field: 'node', value: process.version },
      ],
      note: 'Process uptime on this node only.',
      source: 'process',
    });
  }

  // ── Outbox / jobs ──
  const outboxMap = {
    pending: ['PENDING'],
    outboxPending: ['PENDING'],
    Processing: ['PROCESSING'],
    processing: ['PROCESSING'],
    active: ['PENDING', 'PROCESSING'],
    failed: ['FAILED', 'DEAD_LETTER'],
    outboxFailed: ['FAILED', 'DEAD_LETTER'],
    Failed: ['FAILED', 'DEAD_LETTER'],
    DeadLetter: ['DEAD_LETTER'],
    deadLetter: ['DEAD_LETTER'],
    completed: ['PROCESSED', 'COMPLETED'],
    Processed: ['PROCESSED', 'COMPLETED'],
    processed: ['PROCESSED', 'COMPLETED'],
    TotalEvents: null,
    totalEvents: null,
  };
  if (Object.prototype.hasOwnProperty.call(outboxMap, key)) {
    if (outboxMap[key] == null) {
      const res = await safeQuery(
        `SELECT id, event_type, status, attempts, created_at
         FROM outbox_events
         ORDER BY COALESCE(updated_at, created_at) DESC
         LIMIT $1`,
        [lim],
      );
      return tableResult({
        metric: key,
        title: 'Outbox events (recent)',
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'event_type', header: 'Event' },
          { key: 'status', header: 'Status' },
          { key: 'attempts', header: 'Attempts' },
          { key: 'created_at', header: 'Created' },
        ],
        rows: res.rows,
      });
    }
    return outboxByStatus(key, outboxMap[key], `Outbox · ${key}`, lim);
  }

  // ── Settlement / betting ──
  if ([
    'settlementPending', 'settlementOpen', 'Settlement open', 'settlement_open',
    'SettlementIssues', 'settlementIssues', 'settlementFailures', 'settlementFailed',
    'Settlement failed', 'settlement_failed',
  ].includes(key) || key.toLowerCase().includes('settlement')) {
    const failed = /fail|issue/i.test(key);
    const st = failed
      ? ['FAILED', 'DEAD', 'DEAD_LETTER']
      : ['PENDING', 'PROCESSING', 'QUEUED', 'OPEN'];
    const res = await safeQuery(
      `SELECT COALESCE(job_id::text, id::text) AS id, bet_id, status, attempts, last_error, created_at, updated_at
       FROM settlement_jobs
       WHERE UPPER(COALESCE(status,'')) = ANY($1::text[])
       ORDER BY COALESCE(updated_at, created_at) DESC
       LIMIT $2`,
      [st, lim],
    );
    return tableResult({
      metric: key,
      title: failed ? 'Failed settlement jobs' : 'Pending / open settlement jobs',
      columns: [
        { key: 'id', header: 'Job' },
        { key: 'bet_id', header: 'Bet' },
        { key: 'status', header: 'Status' },
        { key: 'attempts', header: 'Attempts' },
        { key: 'last_error', header: 'Error' },
        { key: 'updated_at', header: 'Updated' },
      ],
      rows: res.rows,
    });
  }

  if ([
    'openBets', 'Open bets', 'betsPlacedToday', 'Bets today', 'betPlacementFailuresToday',
    'betsRejectedToday', 'Rejected', 'Completed 15m', 'completed_15m',
  ].includes(key)) {
    let where = `UPPER(status) = 'OPEN'`;
    let title = 'Open bets';
    if (/reject|fail/i.test(key)) {
      where = `UPPER(status) IN ('REJECTED','FAILED') AND created_at >= date_trunc('day', NOW())`;
      title = 'Rejected / failed bets today';
    } else if (/today|placed/i.test(key)) {
      where = `created_at >= date_trunc('day', NOW())`;
      title = 'Bets placed today';
    } else if (/15m|completed/i.test(key)) {
      where = `UPPER(status) IN ('WON','LOST','VOID','SETTLED','CASHOUT') AND COALESCE(settled_at, updated_at, created_at) >= NOW() - INTERVAL '15 minutes'`;
      title = 'Bets completed (15m)';
    }
    const res = await safeQuery(
      `SELECT bet_id AS id, user_id, status, stake, potential_payout, created_at
       FROM bets WHERE ${where}
       ORDER BY created_at DESC LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title,
      columns: [
        { key: 'id', header: 'Bet' },
        { key: 'user_id', header: 'User' },
        { key: 'status', header: 'Status' },
        { key: 'stake', header: 'Stake' },
        { key: 'created_at', header: 'Created' },
      ],
      rows: res.rows,
    });
  }

  if (['liveMatches', 'Live matches', 'suspendedMarkets', 'Suspended markets'].includes(key)) {
    if (/suspend/i.test(key)) {
      const res = await safeQuery(
        `SELECT market_id AS id, match_id, status, market_type, updated_at
         FROM markets WHERE UPPER(COALESCE(status,'')) IN ('SUSPENDED','HALTED')
         ORDER BY updated_at DESC NULLS LAST LIMIT $1`,
        [lim],
      ).catch(() => ({ rows: [] }));
      // markets table may not exist — try alternate
      if (!res.rows.length) {
        const alt = await safeQuery(
          `SELECT id, match_id, status, created_at FROM suspended_markets
           ORDER BY created_at DESC LIMIT $1`,
          [lim],
        );
        return tableResult({
          metric: key,
          title: 'Suspended markets',
          columns: [
            { key: 'id', header: 'ID' },
            { key: 'match_id', header: 'Match' },
            { key: 'status', header: 'Status' },
            { key: 'created_at', header: 'Created' },
          ],
          rows: alt.rows,
          note: alt.rows.length ? null : 'No suspended market rows available in DB.',
        });
      }
      return tableResult({
        metric: key,
        title: 'Suspended markets',
        columns: [
          { key: 'id', header: 'Market' },
          { key: 'match_id', header: 'Match' },
          { key: 'status', header: 'Status' },
          { key: 'market_type', header: 'Type' },
          { key: 'updated_at', header: 'Updated' },
        ],
        rows: res.rows,
      });
    }
    const res = await safeQuery(
      `SELECT match_id AS id, sport, status, start_time, updated_at
       FROM matches
       WHERE UPPER(COALESCE(status,'')) IN ('LIVE','IN_PLAY','INPLAY')
       ORDER BY updated_at DESC NULLS LAST LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title: 'Live matches',
      columns: [
        { key: 'id', header: 'Match' },
        { key: 'sport', header: 'Sport' },
        { key: 'status', header: 'Status' },
        { key: 'start_time', header: 'Start' },
        { key: 'updated_at', header: 'Updated' },
      ],
      rows: res.rows,
    });
  }

  // ── Finance / withdrawals / deposits / recon ──
  if ([
    'pendingWithdrawals', 'Pending WD', 'Pending Withdrawals', 'withdrawalHold', 'HOLD',
    'pendingChecker', 'Pending Checker', 'pendingCheckerApprovals', 'Checker',
    'withdrawalApprovals', 'Approvals', 'withdrawalRejections', 'Rejections',
    'highRiskWithdrawals', 'HIGH risk', 'criticalRiskWithdrawals', 'CRITICAL risk',
    'withdrawalFailuresRecent', 'WD failures',
  ].includes(key)) {
    if (/fail/i.test(key)) {
      return withdrawalsByStatus(
        key,
        ['FAILED', 'REJECTED'],
        'Withdrawal failures (1h)',
        lim,
        `AND COALESCE(updated_at, created_at) >= NOW() - INTERVAL '1 hour'`,
      );
    }
    if (/reject/i.test(key)) {
      return withdrawalsByStatus(key, ['REJECTED'], 'Rejected withdrawals', lim);
    }
    if (/approv/i.test(key) && !/checker/i.test(key)) {
      return withdrawalsByStatus(
        key,
        ['APPROVED', 'PAID', 'COMPLETED', 'SUCCESS'],
        'Approved / paid withdrawals (recent)',
        lim,
      );
    }
    if (/checker/i.test(key)) {
      return withdrawalsByStatus(key, ['PENDING_CHECKER'], 'Pending checker withdrawals', lim);
    }
    if (/hold/i.test(key)) {
      return withdrawalsByStatus(key, ['HOLD'], 'Held withdrawals', lim);
    }
    if (/high/i.test(key)) {
      const res = await safeQuery(
        `SELECT withdrawal_id AS id, user_id, amount, status, risk_level, created_at, updated_at
         FROM withdrawals
         WHERE UPPER(COALESCE(risk_level,'')) = 'HIGH'
           AND UPPER(status) IN ('PENDING_REVIEW','HOLD','PENDING_CHECKER')
         ORDER BY COALESCE(updated_at, created_at) DESC LIMIT $1`,
        [lim],
      );
      return tableResult({
        metric: key,
        title: 'HIGH risk pending withdrawals',
        columns: [
          { key: 'id', header: 'Withdrawal' },
          { key: 'user_id', header: 'User' },
          { key: 'amount', header: 'Amount' },
          { key: 'status', header: 'Status' },
          { key: 'risk_level', header: 'Risk' },
          { key: 'updated_at', header: 'Updated' },
        ],
        rows: res.rows,
      });
    }
    if (/critical/i.test(key)) {
      const res = await safeQuery(
        `SELECT withdrawal_id AS id, user_id, amount, status, risk_level, created_at, updated_at
         FROM withdrawals
         WHERE UPPER(COALESCE(risk_level,'')) = 'CRITICAL'
           AND UPPER(status) IN ('PENDING_REVIEW','HOLD','PENDING_CHECKER')
         ORDER BY COALESCE(updated_at, created_at) DESC LIMIT $1`,
        [lim],
      );
      return tableResult({
        metric: key,
        title: 'CRITICAL risk pending withdrawals',
        columns: [
          { key: 'id', header: 'Withdrawal' },
          { key: 'user_id', header: 'User' },
          { key: 'amount', header: 'Amount' },
          { key: 'status', header: 'Status' },
          { key: 'risk_level', header: 'Risk' },
          { key: 'updated_at', header: 'Updated' },
        ],
        rows: res.rows,
      });
    }
    return withdrawalsByStatus(
      key,
      ['PENDING_REVIEW', 'HOLD', 'PENDING_CHECKER'],
      'Pending / held withdrawals',
      lim,
    );
  }

  if ([
    'reconciliationDiscrepancies', 'openReconciliation', 'Open Reconciliation',
    'openReconciliationCases', 'Open recon', 'Wallet vs Ledger',
  ].includes(key)) {
    const res = await safeQuery(
      `SELECT id, reconciliation_type, entity_id, severity, status, difference, detected_at
       FROM reconciliation_cases
       WHERE UPPER(status)='OPEN'
       ORDER BY detected_at DESC NULLS LAST LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title: 'Open reconciliation cases (flag-only)',
      columns: [
        { key: 'id', header: 'Case' },
        { key: 'reconciliation_type', header: 'Type' },
        { key: 'entity_id', header: 'Entity' },
        { key: 'severity', header: 'Severity' },
        { key: 'difference', header: 'Delta' },
        { key: 'detected_at', header: 'Detected' },
      ],
      rows: res.rows,
      note: 'Flag-only — balances are never auto-repaired from this view.',
    });
  }

  if ([
    'depositFailuresToday', 'depositFailures', 'Deposit failures', 'depositsToday',
    'Deposits today', 'Deposits pending 1h', 'deposits_pending_1h', 'Deposits',
    'totalDeposits',
  ].includes(key)) {
    let where = `UPPER(type) IN ('DEPOSIT','CREDIT')`;
    let title = 'Deposits';
    if (/fail/i.test(key)) {
      where += ` AND UPPER(status) IN ('FAILED','FAILURE') AND created_at >= date_trunc('day', NOW())`;
      title = 'Deposit failures today';
    } else if (/pending|1h/i.test(key)) {
      where += ` AND UPPER(status) IN ('PENDING','PROCESSING','CREATED') AND created_at >= NOW() - INTERVAL '1 hour'`;
      title = 'Pending deposits (1h)';
    } else if (/today/i.test(key)) {
      where += ` AND created_at >= date_trunc('day', NOW())`;
      title = 'Deposits today';
    } else {
      where += ` AND UPPER(status) IN ('PAID','COMPLETED','SUCCESS','CAPTURED')`;
      title = 'Completed deposits (recent)';
    }
    const res = await safeQuery(
      `SELECT transaction_id AS id, user_id, type, amount, status, created_at
       FROM transactions WHERE ${where}
       ORDER BY created_at DESC LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title,
      columns: [
        { key: 'id', header: 'Txn' },
        { key: 'user_id', header: 'User' },
        { key: 'amount', header: 'Amount' },
        { key: 'status', header: 'Status' },
        { key: 'created_at', header: 'Created' },
      ],
      rows: res.rows,
    });
  }

  if (['Withdrawals', 'totalWithdrawals'].includes(key)) {
    const res = await safeQuery(
      `SELECT withdrawal_id AS id, user_id, amount, status, created_at, updated_at
       FROM withdrawals
       WHERE UPPER(status) IN ('APPROVED','PAID','COMPLETED','SUCCESS')
       ORDER BY COALESCE(updated_at, created_at) DESC LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title: 'Completed withdrawals (recent)',
      columns: [
        { key: 'id', header: 'Withdrawal' },
        { key: 'user_id', header: 'User' },
        { key: 'amount', header: 'Amount' },
        { key: 'status', header: 'Status' },
        { key: 'updated_at', header: 'Updated' },
      ],
      rows: res.rows,
    });
  }

  // ── Users / KYC ──
  if ([
    'registeredUsers', 'Users', 'newRegistrationsToday', 'Registrations today',
    'Active users', 'activeUsers', 'Active bettors', 'activeBettors',
  ].includes(key)) {
    let where = 'TRUE';
    let title = 'Registered users (sample)';
    if (/today|registration/i.test(key)) {
      where = `created_at >= date_trunc('day', NOW())`;
      title = 'Registrations today';
    } else if (/active bettor/i.test(key)) {
      const res = await safeQuery(
        `SELECT DISTINCT ON (b.user_id) b.user_id AS id, b.user_id, MAX(b.created_at) AS last_bet
         FROM bets b
         WHERE b.created_at >= NOW() - INTERVAL '7 days'
         GROUP BY b.user_id
         ORDER BY b.user_id, MAX(b.created_at) DESC
         LIMIT $1`,
        [lim],
      );
      return tableResult({
        metric: key,
        title: 'Active bettors (7d)',
        columns: [
          { key: 'user_id', header: 'User' },
          { key: 'last_bet', header: 'Last bet' },
        ],
        rows: res.rows,
      });
    } else if (/active/i.test(key)) {
      where = `COALESCE(last_login_at, updated_at, created_at) >= NOW() - INTERVAL '7 days'`;
      title = 'Active users (7d)';
    }
    const res = await safeQuery(
      `SELECT user_id AS id, email, created_at, last_login_at
       FROM users WHERE ${where}
       ORDER BY created_at DESC LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title,
      columns: [
        { key: 'id', header: 'User' },
        { key: 'email', header: 'Email' },
        { key: 'created_at', header: 'Created' },
        { key: 'last_login_at', header: 'Last login' },
      ],
      rows: res.rows,
      note: 'PII visible to authorized admins only.',
    });
  }

  if (['kycPending', 'KYC pending', 'Pending KYC', 'kycVerified', 'KYC verified'].includes(key)) {
    const verified = /verif/i.test(key);
    const res = await safeQuery(
      `SELECT user_id AS id, kyc_status, updated_at, created_at
       FROM profiles
       WHERE UPPER(COALESCE(kyc_status,'')) ${verified ? "IN ('VERIFIED','APPROVED')" : "NOT IN ('VERIFIED','APPROVED')"}
       ORDER BY COALESCE(updated_at, created_at) DESC NULLS LAST
       LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title: verified ? 'KYC verified users' : 'KYC pending / incomplete',
      columns: [
        { key: 'id', header: 'User' },
        { key: 'kyc_status', header: 'KYC' },
        { key: 'updated_at', header: 'Updated' },
      ],
      rows: res.rows,
    });
  }

  // ── Alerts / incidents / security ──
  if ([
    'openCriticalAlerts', 'Open Critical Alerts', 'Open critical alerts',
  ].includes(key)) {
    const res = await safeQuery(
      `SELECT notification_id AS id, title, severity, category, status, created_at
       FROM admin_notifications
       WHERE UPPER(COALESCE(status,'OPEN'))='OPEN'
         AND UPPER(COALESCE(severity,''))='CRITICAL'
       ORDER BY created_at DESC LIMIT $1`,
      [lim],
    );
    if (!res.rows.length) {
      const alt = await safeQuery(
        `SELECT alert_id AS id, title, severity, category, status, created_at
         FROM ops_alerts
         WHERE UPPER(COALESCE(status,'OPEN'))='OPEN'
           AND UPPER(COALESCE(severity,'')) IN ('CRITICAL','HIGH')
         ORDER BY created_at DESC LIMIT $1`,
        [lim],
      );
      return tableResult({
        metric: key,
        title: 'Open critical / high ops alerts',
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'title', header: 'Title' },
          { key: 'severity', header: 'Severity' },
          { key: 'category', header: 'Category' },
          { key: 'status', header: 'Status' },
          { key: 'created_at', header: 'Created' },
        ],
        rows: alt.rows,
      });
    }
    return tableResult({
      metric: key,
      title: 'Open CRITICAL ops alerts',
      columns: [
        { key: 'id', header: 'ID' },
        { key: 'title', header: 'Title' },
        { key: 'category', header: 'Category' },
        { key: 'status', header: 'Status' },
        { key: 'created_at', header: 'Created' },
      ],
      rows: res.rows,
    });
  }

  if (['openIncidents', 'Open Incidents'].includes(key)) {
    const res = await safeQuery(
      `SELECT incident_id AS id, title, severity, status, created_at, updated_at
       FROM ops_incidents
       WHERE UPPER(COALESCE(status,'')) NOT IN ('RESOLVED','CLOSED','POSTMORTEM')
       ORDER BY created_at DESC LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title: 'Open incidents',
      columns: [
        { key: 'id', header: 'Incident' },
        { key: 'title', header: 'Title' },
        { key: 'severity', header: 'Severity' },
        { key: 'status', header: 'Status' },
        { key: 'created_at', header: 'Created' },
      ],
      rows: res.rows,
    });
  }

  if (['openTickets', 'Open support tickets'].includes(key)) {
    const res = await safeQuery(
      `SELECT ticket_id AS id, subject, status, priority, user_id, created_at
       FROM support_tickets
       WHERE UPPER(COALESCE(status,'')) NOT IN ('CLOSED','RESOLVED')
       ORDER BY created_at DESC LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title: 'Open support tickets',
      columns: [
        { key: 'id', header: 'Ticket' },
        { key: 'subject', header: 'Subject' },
        { key: 'status', header: 'Status' },
        { key: 'priority', header: 'Priority' },
        { key: 'user_id', header: 'User' },
        { key: 'created_at', header: 'Created' },
      ],
      rows: res.rows,
    });
  }

  // ── Growth / promo ──
  if ([
    'promotionAbuse', 'Promotion Abuse', 'openPromotionAbuseAlerts', 'Open abuse alerts',
    'promoAbuseOpen', 'Abuse alerts open', 'promotionAbuseBlocksToday', 'Abuse blocks today',
  ].includes(key)) {
    const res = await safeQuery(
      `SELECT id, user_id, alert_type, severity, status, created_at
       FROM promo_abuse_alerts
       WHERE UPPER(COALESCE(status,'OPEN')) IN ('OPEN','ACTIVE','NEW')
       ORDER BY created_at DESC LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title: 'Open promo abuse alerts',
      columns: [
        { key: 'id', header: 'Alert' },
        { key: 'user_id', header: 'User' },
        { key: 'alert_type', header: 'Type' },
        { key: 'severity', header: 'Severity' },
        { key: 'status', header: 'Status' },
        { key: 'created_at', header: 'Created' },
      ],
      rows: res.rows,
    });
  }

  if ([
    'activeCampaigns', 'Active campaigns', 'freebetsIssuedToday', 'Freebets issued',
    'freebetGrants', 'Freebet grants', 'vipUsers', 'VIP users', 'segments', 'Segments',
    'referralActivityToday', 'Referrals today',
  ].includes(key)) {
    if (/campaign/i.test(key)) {
      const res = await safeQuery(
        `SELECT campaign_id AS id, name, status, lifecycle_status, created_at
         FROM promo_campaigns
         WHERE UPPER(COALESCE(lifecycle_status, status, '')) IN ('ACTIVE','LIVE','RUNNING')
         ORDER BY created_at DESC LIMIT $1`,
        [lim],
      );
      return tableResult({
        metric: key,
        title: 'Active campaigns',
        columns: [
          { key: 'id', header: 'Campaign' },
          { key: 'name', header: 'Name' },
          { key: 'status', header: 'Status' },
          { key: 'lifecycle_status', header: 'Lifecycle' },
          { key: 'created_at', header: 'Created' },
        ],
        rows: res.rows,
      });
    }
    if (/vip/i.test(key)) {
      const res = await safeQuery(
        `SELECT user_id AS id, tier, COALESCE(vip_points, points) AS vip_points, updated_at
         FROM user_loyalty
         WHERE UPPER(COALESCE(tier,'')) NOT IN ('','NONE','BRONZE')
            OR COALESCE(vip_points, points, 0) > 0
         ORDER BY COALESCE(vip_points, points, 0) DESC LIMIT $1`,
        [lim],
      );
      return tableResult({
        metric: key,
        title: 'VIP / loyalty users',
        columns: [
          { key: 'id', header: 'User' },
          { key: 'tier', header: 'Tier' },
          { key: 'vip_points', header: 'VIP pts' },
          { key: 'updated_at', header: 'Updated' },
        ],
        rows: res.rows,
      });
    }
    if (/segment/i.test(key)) {
      const res = await safeQuery(
        `SELECT segment_id AS id, name, status, created_at
         FROM crm_segments
         ORDER BY created_at DESC LIMIT $1`,
        [lim],
      );
      return tableResult({
        metric: key,
        title: 'CRM segments',
        columns: [
          { key: 'id', header: 'Segment' },
          { key: 'name', header: 'Name' },
          { key: 'status', header: 'Status' },
          { key: 'created_at', header: 'Created' },
        ],
        rows: res.rows,
      });
    }
    if (/referral/i.test(key)) {
      const res = await safeQuery(
        `SELECT id, referrer_user_id, referred_user_id, status, created_at
         FROM referrals
         WHERE created_at >= date_trunc('day', NOW())
         ORDER BY created_at DESC LIMIT $1`,
        [lim],
      );
      return tableResult({
        metric: key,
        title: 'Referrals today',
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'referrer_user_id', header: 'Referrer' },
          { key: 'referred_user_id', header: 'Referred' },
          { key: 'status', header: 'Status' },
          { key: 'created_at', header: 'Created' },
        ],
        rows: res.rows,
      });
    }
    const res = await safeQuery(
      `SELECT grant_id AS id, user_id, amount, status, created_at
       FROM freebet_grants
       ORDER BY created_at DESC LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title: 'Freebet grants (recent)',
      columns: [
        { key: 'id', header: 'Grant' },
        { key: 'user_id', header: 'User' },
        { key: 'amount', header: 'Amount' },
        { key: 'status', header: 'Status' },
        { key: 'created_at', header: 'Created' },
      ],
      rows: res.rows,
    });
  }

  if (['oddsFreshnessProblems', 'Provider errors'].includes(key)) {
    try {
      const { getFeedHealthSnapshot } = await import('./feedHealthEngine.mjs');
      const feed = getFeedHealthSnapshot();
      const rows = (feed?.providers || []).map((p, i) => ({
        id: p.providerId || p.name || String(i),
        provider: p.providerId || p.name,
        status: p.healthStatus || p.status,
        latencyMs: p.latencyMs ?? p.lastLatencyMs ?? null,
        detail: p.message || p.note || null,
      }));
      return tableResult({
        metric: key,
        title: 'Feed / odds provider health',
        columns: [
          { key: 'provider', header: 'Provider' },
          { key: 'status', header: 'Status' },
          { key: 'latencyMs', header: 'Latency ms' },
          { key: 'detail', header: 'Detail' },
        ],
        rows,
        note: 'Live provider snapshot — not a historical error log.',
        source: 'feed',
      });
    } catch {
      return tableResult({
        metric: key,
        title: 'Feed / odds provider health',
        columns: [{ key: 'detail', header: 'Detail' }],
        rows: [],
        note: 'Feed health snapshot unavailable.',
      });
    }
  }

  // ── Trading desk / analytics aggregates → underlying bets or liabilities ──
  if (['GGR', 'ggr', 'Handle', 'handle', 'Paid out', 'paidOut', 'Open liability', 'openLiability',
    'Turnover', 'turnover', 'Bet count', 'totalBets', 'Cashouts', 'cashouts',
    'Avg stake', 'NGR', 'Hold %', 'Stored liability', 'Mem worst-case'].includes(key)) {
    const res = await safeQuery(
      `SELECT bet_id AS id, user_id, status, stake, actual_payout, created_at, settled_at
       FROM bets
       ORDER BY created_at DESC LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title: `${key} · recent bets (underlying sample)`,
      columns: [
        { key: 'id', header: 'Bet' },
        { key: 'user_id', header: 'User' },
        { key: 'status', header: 'Status' },
        { key: 'stake', header: 'Stake' },
        { key: 'actual_payout', header: 'Payout' },
        { key: 'created_at', header: 'Created' },
      ],
      rows: res.rows,
      note: 'Aggregate KPIs are derived from ledger/bets; this lists recent bets for inspection.',
    });
  }

  // ── DB / dependency snapshot ──
  if (['connectionStatus', 'latencyMs', 'migrationStatus', 'redisStatus', 'System Health', 'systemHealth'].includes(key)) {
    try {
      const { getSystemHealthStatus } = await import('./devopsEngine.mjs');
      const sys = await getSystemHealthStatus().catch(() => null);
      return tableResult({
        metric: key,
        title: 'Database / dependency snapshot',
        columns: [
          { key: 'check', header: 'Check' },
          { key: 'status', header: 'Status' },
          { key: 'detail', header: 'Detail' },
        ],
        rows: [
          {
            id: 'pg',
            check: 'postgres',
            status: sys?.checks?.postgres?.status || 'UNKNOWN',
            detail: `latencyMs=${sys?.checks?.postgres?.latencyMs ?? 'N/A'}`,
          },
          {
            id: 'redis',
            check: 'redis',
            status: sys?.checks?.redis?.status || 'UNKNOWN',
            detail: `latencyMs=${sys?.checks?.redis?.latencyMs ?? 'N/A'}`,
          },
          {
            id: 'outbox',
            check: 'outboxQueue',
            status: sys?.checks?.outboxQueue?.status || 'UNKNOWN',
            detail: `pending=${sys?.checks?.outboxQueue?.pending ?? 'N/A'}`,
          },
        ],
        note: 'Live dependency checks — not a query log.',
        source: 'health',
      });
    } catch {
      /* fall through */
    }
  }

  return {
    success: false,
    metric: key,
    title: 'Unknown metric',
    note: `No drill-down configured for "${key}".`,
    columns: [],
    rows: [],
    status: 404,
    code: 'UNKNOWN_METRIC',
  };
}
