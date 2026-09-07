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
    'Settlement failed', 'settlement_failed', 'Completed 15m', 'completed_15m',
  ].includes(key) || (key.toLowerCase().includes('settlement') && !/bet/i.test(key))) {
    if (/15m|completed_15m/i.test(key)) {
      const res = await safeQuery(
        `SELECT COALESCE(job_id::text, id::text) AS id, bet_id, status, attempts, last_error, created_at, updated_at
         FROM settlement_jobs
         WHERE UPPER(COALESCE(status,'')) = 'COMPLETED'
           AND COALESCE(updated_at, created_at) >= NOW() - INTERVAL '15 minutes'
         ORDER BY COALESCE(updated_at, created_at) DESC
         LIMIT $1`,
        [lim],
      );
      return tableResult({
        metric: key,
        title: 'Settlement jobs completed (15m)',
        columns: [
          { key: 'id', header: 'Job' },
          { key: 'bet_id', header: 'Bet' },
          { key: 'status', header: 'Status' },
          { key: 'attempts', header: 'Attempts' },
          { key: 'updated_at', header: 'Updated' },
        ],
        rows: res.rows,
        note: 'Same window as Observability completed_15m.',
      });
    }
    const failed = /fail|issue/i.test(key);
    const st = failed
      ? ['FAILED', 'DEAD', 'DEAD_LETTER']
      : ['PENDING', 'RETRY', 'AWAITING_EVIDENCE', 'PROCESSING', 'QUEUED', 'OPEN'];
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
    'betsRejectedToday', 'Rejected',
  ].includes(key)) {
    let where = `UPPER(status) IN ('PENDING','ACCEPTED','OPEN')`;
    let title = 'Open bets';
    if (/reject|fail/i.test(key)) {
      where = `UPPER(status) IN ('REJECTED','FAILED','DECLINED') AND created_at >= date_trunc('day', NOW())`;
      title = 'Rejected / failed bets today';
    } else if (/today|placed/i.test(key)) {
      where = `created_at >= date_trunc('day', NOW())`;
      title = 'Bets placed today';
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
      ['REQUESTED', 'PENDING', 'PENDING_APPROVAL', 'PENDING_REVIEW', 'UNDER_REVIEW', 'HOLD', 'PENDING_CHECKER'],
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
    if (/pending|1h/i.test(key)) {
      const res = await safeQuery(
        `SELECT deposit_id AS id, user_id, amount, status, provider, created_at, updated_at
         FROM deposits
         WHERE UPPER(COALESCE(status,'')) IN ('CREATED','PENDING','INITIATED')
           AND created_at >= NOW() - INTERVAL '1 hour'
         ORDER BY created_at DESC LIMIT $1`,
        [lim],
      );
      return tableResult({
        metric: key,
        title: 'Deposits pending (1h)',
        columns: [
          { key: 'id', header: 'Deposit' },
          { key: 'user_id', header: 'User' },
          { key: 'amount', header: 'Amount' },
          { key: 'status', header: 'Status' },
          { key: 'provider', header: 'Provider' },
          { key: 'created_at', header: 'Created' },
        ],
        rows: res.rows,
        note: 'From deposits table (same as Observability pending_1h).',
      });
    }
    let where = `UPPER(type) = 'DEPOSIT'`;
    let title = 'Deposits';
    if (/fail/i.test(key)) {
      where += ` AND UPPER(status) IN ('FAILED','FAILURE') AND created_at >= date_trunc('day', NOW())`;
      title = 'Deposit failures today';
    } else if (/today/i.test(key)) {
      where += ` AND UPPER(status) IN ('PAID','COMPLETED','SUCCESS','CAPTURED') AND created_at >= date_trunc('day', NOW())`;
      title = 'Deposits today';
    } else {
      where += ` AND UPPER(status) = 'COMPLETED'`;
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
      `SELECT transaction_id AS id, user_id, type, amount, status, created_at
       FROM transactions
       WHERE UPPER(type) = 'WITHDRAWAL'
         AND UPPER(status) = 'COMPLETED'
       ORDER BY created_at DESC LIMIT $1`,
      [lim],
    );
    if (!res.rows.length) {
      const alt = await safeQuery(
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
        rows: alt.rows,
        note: 'Fallback from withdrawals table — BI prefers transactions type=WITHDRAWAL.',
      });
    }
    return tableResult({
      metric: key,
      title: 'Completed withdrawal transactions (recent)',
      columns: [
        { key: 'id', header: 'Txn' },
        { key: 'user_id', header: 'User' },
        { key: 'amount', header: 'Amount' },
        { key: 'status', header: 'Status' },
        { key: 'created_at', header: 'Created' },
      ],
      rows: res.rows,
      note: 'Same filter as Analytics totalWithdrawals (transactions WITHDRAWAL + COMPLETED).',
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
        `SELECT b.user_id AS id, b.user_id, MAX(b.created_at) AS last_bet, COUNT(*)::int AS bets
         FROM bets b
         GROUP BY b.user_id
         ORDER BY MAX(b.created_at) DESC
         LIMIT $1`,
        [lim],
      );
      return tableResult({
        metric: key,
        title: 'Active bettors (all-time distinct)',
        columns: [
          { key: 'user_id', header: 'User' },
          { key: 'bets', header: 'Bets' },
          { key: 'last_bet', header: 'Last bet' },
        ],
        rows: res.rows,
        note: 'Matches Analytics activeBettors = distinct users with any bets.',
      });
    } else if (/active/i.test(key)) {
      const res = await safeQuery(
        `SELECT p.user_id AS id, u.email, p.account_status, p.kyc_status, p.updated_at
         FROM user_profiles p
         LEFT JOIN users u ON u.user_id = p.user_id
         WHERE UPPER(COALESCE(p.account_status,'')) = 'ACTIVE'
         ORDER BY COALESCE(p.updated_at, u.created_at) DESC NULLS LAST
         LIMIT $1`,
        [lim],
      );
      return tableResult({
        metric: key,
        title: 'Active users (account_status=ACTIVE)',
        columns: [
          { key: 'id', header: 'User' },
          { key: 'email', header: 'Email' },
          { key: 'account_status', header: 'Status' },
          { key: 'kyc_status', header: 'KYC' },
          { key: 'updated_at', header: 'Updated' },
        ],
        rows: res.rows,
        note: 'Same source as Analytics active users KPI.',
      });
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

  if (['kycPending', 'KYC pending', 'Pending KYC', 'kycVerified', 'KYC verified', 'kycVerifiedToday'].includes(key)) {
    const verified = /verif/i.test(key);
    const res = await safeQuery(
      verified
        ? `SELECT user_id AS id, kyc_status, updated_at, created_at
           FROM user_profiles
           WHERE UPPER(COALESCE(kyc_status,'')) IN ('VERIFIED','APPROVED')
             AND updated_at >= date_trunc('day', NOW())
           ORDER BY updated_at DESC NULLS LAST
           LIMIT $1`
        : `SELECT user_id AS id, kyc_status, updated_at, created_at
           FROM user_profiles
           WHERE UPPER(COALESCE(kyc_status,'NOT_STARTED')) IN ('PENDING','SUBMITTED','IN_REVIEW')
           ORDER BY COALESCE(updated_at, created_at) DESC NULLS LAST
           LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title: verified ? 'KYC verified today' : 'KYC pending / in review',
      columns: [
        { key: 'id', header: 'User' },
        { key: 'kyc_status', header: 'KYC' },
        { key: 'updated_at', header: 'Updated' },
      ],
      rows: res.rows,
      note: 'From user_profiles (same as Ops Control Tower KYC KPIs).',
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
      `SELECT id, title, severity, service, status, created_at, resolved_at
       FROM incidents
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
        { key: 'service', header: 'Service' },
        { key: 'status', header: 'Status' },
        { key: 'created_at', header: 'Created' },
      ],
      rows: res.rows,
      note: 'From incidents (same as Ops Control Tower).',
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

  // Growth Overview = promotions; Ops Control Tower = crm_campaigns
  if (['crmActiveCampaigns', 'CRM campaigns'].includes(key)) {
    const res = await safeQuery(
      `SELECT id, name, segment, channel, status, sent_count, created_at
       FROM crm_campaigns
       WHERE UPPER(COALESCE(status,'')) IN ('ACTIVE','RUNNING','SCHEDULED')
       ORDER BY created_at DESC LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title: 'Active CRM campaigns',
      columns: [
        { key: 'id', header: 'Campaign' },
        { key: 'name', header: 'Name' },
        { key: 'segment', header: 'Segment' },
        { key: 'channel', header: 'Channel' },
        { key: 'status', header: 'Status' },
        { key: 'sent_count', header: 'Sent' },
        { key: 'created_at', header: 'Created' },
      ],
      rows: res.rows,
      note: 'From crm_campaigns (same as Ops Promotion Operations KPI).',
    });
  }

  if (['activeCampaigns', 'Active campaigns'].includes(key)) {
    const res = await safeQuery(
      `SELECT id, name, code, type, status, is_targeted, created_at, expires_at
       FROM promotions
       WHERE UPPER(COALESCE(status,'')) = 'ACTIVE'
       ORDER BY created_at DESC LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title: 'Active promotions',
      columns: [
        { key: 'id', header: 'Promotion' },
        { key: 'name', header: 'Name' },
        { key: 'code', header: 'Code' },
        { key: 'type', header: 'Type' },
        { key: 'status', header: 'Status' },
        { key: 'is_targeted', header: 'Targeted' },
        { key: 'created_at', header: 'Created' },
      ],
      rows: res.rows,
      note: 'From promotions where status = ACTIVE (same as Growth Overview KPI).',
    });
  }

  if (['usersTargeted', 'Users targeted'].includes(key)) {
    const res = await safeQuery(
      `SELECT cu.assignment_id AS id, cu.user_id, cu.promotion_id, p.name AS campaign,
              cu.offer_email_status, cu.offer_email_sent_at, cu.assigned_at
       FROM deposit_freebet_campaign_users cu
       LEFT JOIN promotions p ON p.id = cu.promotion_id
       ORDER BY cu.assigned_at DESC LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title: 'Users targeted',
      columns: [
        { key: 'id', header: 'Assignment' },
        { key: 'user_id', header: 'User' },
        { key: 'campaign', header: 'Campaign' },
        { key: 'offer_email_status', header: 'Email' },
        { key: 'assigned_at', header: 'Assigned' },
      ],
      rows: res.rows,
      note: 'From deposit_freebet_campaign_users (same as Overview KPI).',
    });
  }

  if (['emailsSent', 'Emails sent', 'emailsFailed', 'Emails Failed', 'Emails failed'].includes(key)) {
    const failed = /fail/i.test(key);
    const res = await safeQuery(
      `SELECT cu.assignment_id AS id, cu.user_id, cu.promotion_id, p.name AS campaign,
              cu.offer_email_status, cu.offer_email_sent_at, cu.offer_email_message_id, cu.offer_email_error
       FROM deposit_freebet_campaign_users cu
       LEFT JOIN promotions p ON p.id = cu.promotion_id
       WHERE UPPER(cu.offer_email_status) = $2
       ORDER BY COALESCE(cu.offer_email_sent_at, cu.assigned_at) DESC LIMIT $1`,
      [lim, failed ? 'FAILED' : 'SENT'],
    );
    // Also include grant-level promo emails (sitewide deposit freebet)
    const grantEmails = await safeQuery(
      `SELECT grant_id AS id, user_id, promotion_id, email_status AS offer_email_status,
              email_sent_at AS offer_email_sent_at, email_message_id AS offer_email_message_id,
              email_error AS offer_email_error, NULL::text AS campaign
       FROM deposit_freebet_grants
       WHERE UPPER(email_status) = $2
       ORDER BY COALESCE(email_sent_at, created_at) DESC LIMIT $1`,
      [lim, failed ? 'FAILED' : 'SENT'],
    );
    const rows = [...(res.rows || []), ...(grantEmails.rows || [])].slice(0, lim);
    return tableResult({
      metric: key,
      title: failed ? 'Offer emails failed' : 'Offer emails sent',
      columns: [
        { key: 'id', header: 'ID' },
        { key: 'user_id', header: 'User' },
        { key: 'campaign', header: 'Campaign' },
        { key: 'promotion_id', header: 'Promotion' },
        { key: 'offer_email_status', header: 'Status' },
        { key: 'offer_email_sent_at', header: 'Sent at' },
        { key: 'offer_email_error', header: 'Error' },
      ],
      rows,
      note: failed
        ? 'Failed offer emails from campaign assignments and deposit freebet grants.'
        : 'Sent offer emails from campaign assignments and deposit freebet grants.',
    });
  }

  if ([
    'freebetGrants', 'Freebet grants', 'freebetIssued', 'Freebet issued',
    'freebetConsumed', 'Freebet consumed', 'freebetsIssuedToday', 'Freebets issued',
    'freebetsClaimedToday', 'Freebets claimed', 'claimConversion', 'Claim conversion',
  ].includes(key)) {
    let where = 'TRUE';
    let title = 'Deposit freebet grants';
    let note = 'From deposit_freebet_grants (same as Growth / Ops freebet KPIs).';
    if (/consumed|claimed/i.test(key)) {
      where = `UPPER(status) IN ('USED','CLAIMED','REDEEMED')`;
      title = 'Freebet grants consumed / claimed';
      if (/today/i.test(key)) {
        where += ` AND COALESCE(updated_at, created_at) >= date_trunc('day', NOW())`;
        title = 'Freebet grants claimed today';
      }
    } else if (/today|issued today/i.test(key)) {
      where = `created_at >= date_trunc('day', NOW())`;
      title = 'Freebet grants issued today';
    } else if (/claim conversion/i.test(key)) {
      title = 'Freebet grants (claim conversion detail)';
      note = 'Grant users used in claim conversion vs targeted campaign users.';
    }
    const res = await safeQuery(
      `SELECT grant_id AS id, user_id, promotion_id, deposit_id, deposit_amount,
              freebet_amount AS amount, remaining_amount, status, email_status, created_at
       FROM deposit_freebet_grants
       WHERE ${where}
       ORDER BY created_at DESC LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title,
      columns: [
        { key: 'id', header: 'Grant' },
        { key: 'user_id', header: 'User' },
        { key: 'promotion_id', header: 'Promotion' },
        { key: 'deposit_id', header: 'Deposit' },
        { key: 'amount', header: 'Freebet' },
        { key: 'status', header: 'Status' },
        { key: 'created_at', header: 'Created' },
      ],
      rows: res.rows,
      note,
    });
  }

  if (['depositsLinkedToFreebet', 'Linked deposits'].includes(key)) {
    const res = await safeQuery(
      `SELECT grant_id AS id, user_id, deposit_id, deposit_amount, freebet_amount, status, created_at
       FROM deposit_freebet_grants
       WHERE deposit_id IS NOT NULL AND COALESCE(deposit_amount, 0) > 0
       ORDER BY created_at DESC LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title: 'Deposits linked to freebet grants',
      columns: [
        { key: 'id', header: 'Grant' },
        { key: 'user_id', header: 'User' },
        { key: 'deposit_id', header: 'Deposit' },
        { key: 'deposit_amount', header: 'Deposit ₹' },
        { key: 'freebet_amount', header: 'Freebet ₹' },
        { key: 'status', header: 'Status' },
        { key: 'created_at', header: 'Created' },
      ],
      rows: res.rows,
      note: 'Deposit amounts recorded on deposit_freebet_grants.',
    });
  }

  if (['vipUsers', 'VIP users'].includes(key)) {
    const res = await safeQuery(
      `SELECT user_id AS id, tier, COALESCE(vip_points, points) AS vip_points, updated_at
       FROM user_loyalty
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
      note: 'All rows in user_loyalty (same as Overview VIP users count).',
    });
  }

  if (['segments', 'Segments'].includes(key)) {
    const res = await safeQuery(
      `SELECT id, name, member_count, auto_evaluate, created_at, updated_at
       FROM customer_segments
       ORDER BY COALESCE(updated_at, created_at) DESC LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title: 'Customer segments',
      columns: [
        { key: 'id', header: 'Segment' },
        { key: 'name', header: 'Name' },
        { key: 'member_count', header: 'Members' },
        { key: 'auto_evaluate', header: 'Auto' },
        { key: 'created_at', header: 'Created' },
      ],
      rows: res.rows,
      note: 'From customer_segments (same as Overview KPI).',
    });
  }

  if ([
    'referralActivityToday', 'Referrals today', 'referralConversion', 'Referral conversion',
    'referralsTotal', 'referralsRegistered', 'referralsQualified', 'referralsRewarded',
    'referralRewardValue', 'referralsFraudReview',
  ].includes(key)) {
    let where = 'TRUE';
    let title = 'Referrals';
    if (key === 'referralsRegistered') {
      where = `UPPER(COALESCE(status,'')) = 'REGISTERED'`;
      title = 'Referrals · REGISTERED';
    } else if (key === 'referralsQualified') {
      where = `(UPPER(COALESCE(status,'')) IN ('QUALIFIED','REWARDED') OR UPPER(COALESCE(qualification_status,'')) = 'QUALIFIED')`;
      title = 'Referrals · QUALIFIED';
    } else if (key === 'referralsRewarded' || key === 'referralRewardValue') {
      where = `(UPPER(COALESCE(status,'')) = 'REWARDED' OR UPPER(COALESCE(reward_status,'')) = 'GRANTED')`;
      title = key === 'referralRewardValue' ? 'Rewarded referrals (value)' : 'Referrals · REWARDED';
    } else if (key === 'referralsFraudReview') {
      where = `UPPER(COALESCE(status,'')) = 'FRAUD_REVIEW'`;
      title = 'Referrals · FRAUD_REVIEW';
    } else if (/today/i.test(key) && !/conversion/i.test(key)) {
      where = `created_at >= date_trunc('day', NOW())`;
      title = 'Referrals today';
    } else if (/conversion/i.test(key)) {
      title = 'Referrals (conversion sample)';
    }
    const res = await safeQuery(
      `SELECT id, referrer_user_id, referred_user_id, referral_code, status,
              COALESCE(referrer_reward_amount, reward_amount) AS reward_amount, created_at
       FROM referrals
       WHERE ${where}
       ORDER BY created_at DESC LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title,
      columns: [
        { key: 'id', header: 'ID' },
        { key: 'referrer_user_id', header: 'Referrer' },
        { key: 'referred_user_id', header: 'Referred' },
        { key: 'referral_code', header: 'Code' },
        { key: 'status', header: 'Status' },
        { key: 'reward_amount', header: 'Reward' },
        { key: 'created_at', header: 'Created' },
      ],
      rows: res.rows,
      note: 'From referrals (same as Growth Referrals / Ops referral KPIs).',
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

  // ── Trading desk / analytics aggregates (aligned with traderDeskMetrics / BI) ──
  if (['Handle', 'handle', 'GGR', 'ggr', 'Hold %', 'Paid out', 'paidOut'].includes(key)) {
    const types = /paid|payout/i.test(key)
      ? ['BET_WIN', 'BET_CASHOUT', 'BET_VOID']
      : ['BET_STAKE'];
    const res = await safeQuery(
      `SELECT transaction_id AS id, user_id, type, amount, status, reference_id, created_at
       FROM transactions
       WHERE UPPER(type) = ANY($1::text[])
         AND UPPER(status) IN ('SUCCESS','COMPLETED')
       ORDER BY created_at DESC LIMIT $2`,
      [types, lim],
    );
    return tableResult({
      metric: key,
      title: /paid|payout/i.test(key)
        ? 'Payout transactions (wins / cashouts / voids)'
        : 'Stake transactions (handle / GGR input)',
      columns: [
        { key: 'id', header: 'Txn' },
        { key: 'user_id', header: 'User' },
        { key: 'type', header: 'Type' },
        { key: 'amount', header: 'Amount' },
        { key: 'status', header: 'Status' },
        { key: 'reference_id', header: 'Ref' },
        { key: 'created_at', header: 'Created' },
      ],
      rows: res.rows,
      note: 'Same ledger types as Trading desk GGR / handle / paid-out formulas.',
    });
  }

  if (['Open liability', 'openLiability'].includes(key)) {
    const res = await safeQuery(
      `SELECT bet_id AS id, user_id, status, stake,
              COALESCE(potential_payout, stake * COALESCE(accepted_odds, odds, 1)) AS potential_payout,
              created_at
       FROM bets
       WHERE UPPER(status) IN ('ACCEPTED','PENDING','OPEN')
       ORDER BY created_at DESC LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title: 'Open bets (liability basis)',
      columns: [
        { key: 'id', header: 'Bet' },
        { key: 'user_id', header: 'User' },
        { key: 'status', header: 'Status' },
        { key: 'stake', header: 'Stake' },
        { key: 'potential_payout', header: 'Potential' },
        { key: 'created_at', header: 'Created' },
      ],
      rows: res.rows,
      note: 'Open liability = sum(potential_payout) − sum(stake) on these statuses.',
    });
  }

  if (['Stored liability', 'storedMarketLiability'].includes(key)) {
    const res = await safeQuery(
      `SELECT market_id || ':' || selection_id AS id, market_id, selection_id,
              net_liability, total_stake, updated_at
       FROM market_selection_liability
       ORDER BY ABS(net_liability) DESC LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title: 'Stored market selection liability',
      columns: [
        { key: 'market_id', header: 'Market' },
        { key: 'selection_id', header: 'Selection' },
        { key: 'net_liability', header: 'Net liability' },
        { key: 'total_stake', header: 'Stake' },
        { key: 'updated_at', header: 'Updated' },
      ],
      rows: res.rows,
      note: 'From market_selection_liability (Trading desk stored liability).',
    });
  }

  if (['Mem worst-case', 'memoryWorstCaseLoss'].includes(key)) {
    try {
      const { getSystemWideExposureSummary } = await import('./exposureEngine.mjs');
      const mem = getSystemWideExposureSummary();
      return tableResult({
        metric: key,
        title: 'In-memory exposure summary',
        columns: [
          { key: 'metric', header: 'Metric' },
          { key: 'value', header: 'Value' },
        ],
        rows: [
          { id: 'bets', metric: 'globalBetsCount', value: mem.globalBetsCount },
          { id: 'staked', metric: 'globalStakedAmount', value: mem.globalStakedAmount },
          { id: 'payout', metric: 'globalPotentialPayout', value: mem.globalPotentialPayout },
          { id: 'worst', metric: 'globalWorstCaseLoss', value: mem.globalWorstCaseLoss },
          { id: 'match', metric: 'highestRiskMatchId', value: mem.highestRiskMatchId },
        ],
        note: 'Process-local exposure store — resets on restart; not a DB table.',
        source: 'memory',
      });
    } catch {
      return tableResult({
        metric: key,
        title: 'In-memory exposure summary',
        columns: [{ key: 'detail', header: 'Detail' }],
        rows: [],
        note: 'Exposure engine unavailable.',
      });
    }
  }

  if (['Cashouts', 'cashouts'].includes(key)) {
    const res = await safeQuery(
      `SELECT bet_id AS id, user_id, status, stake, actual_payout, created_at, settled_at
       FROM bets
       WHERE UPPER(status) = 'CASHED_OUT'
       ORDER BY COALESCE(settled_at, created_at) DESC LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title: 'Cashed-out bets',
      columns: [
        { key: 'id', header: 'Bet' },
        { key: 'user_id', header: 'User' },
        { key: 'stake', header: 'Stake' },
        { key: 'actual_payout', header: 'Payout' },
        { key: 'settled_at', header: 'Cashed at' },
      ],
      rows: res.rows,
    });
  }

  if (['Turnover', 'turnover', 'Bet count', 'totalBets', 'Avg stake', 'NGR', 'settledGgr'].includes(key)) {
    const res = await safeQuery(
      `SELECT bet_id AS id, user_id, status, stake, potential_payout, actual_payout, created_at, settled_at
       FROM bets
       WHERE UPPER(status) IN ('ACCEPTED','SETTLED','WON','LOST','CASHED_OUT')
       ORDER BY created_at DESC LIMIT $1`,
      [lim],
    );
    return tableResult({
      metric: key,
      title: key === 'settledGgr'
        ? 'Settled bets (Analytics GGR sample)'
        : `${key} · recent qualifying bets`,
      columns: [
        { key: 'id', header: 'Bet' },
        { key: 'user_id', header: 'User' },
        { key: 'status', header: 'Status' },
        { key: 'stake', header: 'Stake' },
        { key: 'actual_payout', header: 'Payout' },
        { key: 'created_at', header: 'Created' },
      ],
      rows: res.rows,
      note: key === 'settledGgr'
        ? 'Analytics GGR = settled stake − settled payout (bets). Trading desk GGR uses ledger BET_STAKE − payouts.'
        : 'Sample of bets counted in Analytics turnover / bet count.',
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
