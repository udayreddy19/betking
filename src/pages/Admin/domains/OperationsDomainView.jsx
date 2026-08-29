import React, { useState, useEffect, useCallback } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { StatusBadge } from '../components/AdminBadge';
import AdminKPI from '../components/AdminKPI';
import { useAdminToast } from '../components/AdminToastContext';
import { AdminKpiDrillDrawer, useAdminKpiDrilldown } from '../hooks/useAdminKpiDrilldown';
import { startVisibleInterval } from '../utils/visibleInterval';

function fmt(v) {
  if (v == null || Number.isNaN(Number(v))) return 'N/A';
  return Number(v).toLocaleString();
}

function ObservabilityKpis({ data, onDrill }) {
  if (!data) return null;
  const rows = [
    { label: 'Settlement open', metric: 'settlementPending', value: data.settlement?.open_jobs, accent: '#fbbf24' },
    { label: 'Settlement failed', metric: 'settlementFailed', value: data.settlement?.failed_jobs, accent: '#f43f5e' },
    { label: 'Completed 15m', metric: 'completed_15m', value: data.settlement?.completed_15m, accent: '#34d399' },
    { label: 'Deposits pending 1h', metric: 'deposits_pending_1h', value: data.deposits?.pending_1h, accent: '#38bdf8' },
    { label: 'Open bets', metric: 'openBets', value: data.betting?.open_bets, accent: '#818cf8' },
    { label: 'Outbox pending', metric: 'outboxPending', value: data.outbox?.pending, accent: '#f59e0b' },
    { label: 'Outbox failed', metric: 'outboxFailed', value: data.outbox?.failed, accent: '#f87171' },
  ];
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
      gap: 12,
      marginBottom: 20,
    }}
    >
      {rows.map((m) => (
        <AdminKPI
          key={m.label}
          label={m.label}
          value={m.value ?? '—'}
          accent={m.accent}
          source="Details"
          onClick={onDrill ? () => onDrill(m.metric, m.label) : undefined}
        />
      ))}
    </div>
  );
}

function SettlementQueuePanel() {
  const [pendingJobs, setPendingJobs] = useState([]);
  const [pendingBets, setPendingBets] = useState([]);
  const [failedJobs, setFailedJobs] = useState([]);
  const [blockedBets, setBlockedBets] = useState([]);
  const [obs, setObs] = useState(null);
  const [error, setError] = useState(null);
  const [retryingId, setRetryingId] = useState(null);
  const [selectedBlocked, setSelectedBlocked] = useState(null);
  const { showToast } = useAdminToast();
  const drill = useAdminKpiDrilldown();

  const load = useCallback(() => {
    Promise.all([
      adminApiClient.get('/settlement/pending').catch((err) => ({ error: err.message })),
      adminApiClient.get('/settlement/failed').catch(() => ({ failedJobs: [] })),
      adminApiClient.get('/settlement/blocked').catch(() => ({ blockedBets: [] })),
      adminApiClient.get('/ops/observability').catch(() => null),
    ]).then(([pending, failed, blocked, observability]) => {
      if (pending.error) {
        setError(pending.error);
        setPendingJobs([]);
        setPendingBets([]);
      } else {
        setPendingJobs(pending.pendingJobs || []);
        setPendingBets(pending.pendingBets || []);
        setError(null);
      }
      setFailedJobs(failed.failedJobs || []);
      setBlockedBets(blocked.blockedBets || []);
      setObs(observability);
    });
  }, []);

  useEffect(() => {
    const stop = startVisibleInterval(load, 30000, { runImmediately: true });
    return stop;
  }, [load]);

  const retryJob = async (jobId) => {
    if (!jobId) return;
    setRetryingId(jobId);
    try {
      await adminApiClient.post(`/settlement/retry/${encodeURIComponent(jobId)}`);
      showToast(`Retry queued for ${jobId}`, 'success');
      load();
    } catch (err) {
      showToast(err.message || 'Retry failed', 'error');
    } finally {
      setRetryingId(null);
    }
  };

  const jobRows = [
    ...pendingJobs.map((j) => ({
      id: j.job_id || j.jobId || j.id,
      betId: j.bet_id || j.betId,
      status: j.status || 'PENDING',
      attempts: j.attempts ?? j.retry_count,
      updatedAt: j.updated_at || j.updatedAt,
      source: 'pending',
    })),
    ...failedJobs.map((j) => ({
      id: j.job_id || j.jobId || j.id,
      betId: j.bet_id || j.betId,
      status: j.status || 'FAILED',
      attempts: j.attempts ?? j.retry_count,
      updatedAt: j.updated_at || j.updatedAt,
      source: 'failed',
    })),
  ];

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <div className="admin-flex-between" style={{ flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>12 · Settlement Queue & Confidence Monitoring</h2>
          <button type="button" className="admin-btn admin-btn--secondary admin-btn--sm" onClick={load}>
            ↻ Refresh
          </button>
        </div>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Real-time settlement confidence states, multi-provider consensus, and blocked queue inspection. Refreshes every 30s.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      <ObservabilityKpis data={obs} onDrill={drill.openDrilldown} />
      <AdminKpiDrillDrawer drill={drill} />

      {blockedBets.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <AdminDataTable
            title={`Blocked Settlement Queue (${blockedBets.length})`}
            emptyMessage="No bets currently blocked by confidence engine"
            data={blockedBets}
            columns={[
              { header: 'Bet ID', key: 'betId', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.betId}</span> },
              { header: 'Match', key: 'matchId', render: (r) => <span style={{ fontSize: '0.76rem' }}>{r.matchId}</span> },
              { header: 'Market', key: 'marketId', render: (r) => <span style={{ fontSize: '0.76rem' }}>{r.marketId}</span> },
              {
                header: 'Confidence State',
                key: 'confidenceState',
                render: (r) => (
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    background: r.confidenceState === 'CONFLICT' ? '#ef444422' : (r.confidenceState === 'STALE' ? '#f59e0b22' : '#3b82f622'),
                    color: r.confidenceState === 'CONFLICT' ? '#ef4444' : (r.confidenceState === 'STALE' ? '#f59e0b' : '#60a5fa'),
                  }}>
                    {r.confidenceState || 'BLOCKED'}
                  </span>
                ),
              },
              {
                header: 'Reason',
                key: 'reasons',
                render: (r) => (
                  <span style={{ fontSize: '0.74rem', color: '#fca5a5' }}>
                    {Array.isArray(r.reasons) ? r.reasons[0] : (r.reasons || 'Blocked by confidence gate')}
                  </span>
                ),
              },
              {
                header: 'Inspect',
                key: 'inspect',
                sortable: false,
                render: (r) => (
                  <button
                    type="button"
                    className="admin-btn admin-btn--secondary admin-btn--sm"
                    onClick={() => setSelectedBlocked(r)}
                  >
                    View Details
                  </button>
                ),
              },
            ]}
          />
        </div>
      )}

      {selectedBlocked && (
        <div style={{
          padding: '16px',
          marginBottom: '20px',
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '8px',
        }}>
          <div className="admin-flex-between">
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>
              Blocked Bet Evidence & Consensus: #{selectedBlocked.betId}
            </h3>
            <button
              type="button"
              className="admin-btn admin-btn--secondary admin-btn--sm"
              onClick={() => setSelectedBlocked(null)}
            >
              Close
            </button>
          </div>
          <div style={{ marginTop: '10px', fontSize: '0.8rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <strong>Confidence State:</strong> {selectedBlocked.confidenceState} <br />
              <strong>Finality State:</strong> {selectedBlocked.finalityState || 'PROVISIONAL'} <br />
              <strong>Settlement Allowed:</strong> {selectedBlocked.settlementAllowed ? 'YES' : 'NO (BLOCKED)'} <br />
              <strong>First Blocked At:</strong> {selectedBlocked.firstBlockedAt || '—'} <br />
            </div>
            <div>
              <strong>Providers Available:</strong> {selectedBlocked.providerConsensus?.providersAvailable ?? 1} <br />
              <strong>Providers Agree:</strong> {selectedBlocked.providerConsensus?.providersAgree ? 'YES' : 'NO (CONFLICT)'} <br />
              <strong>Conflicting Fields:</strong> {selectedBlocked.providerConsensus?.conflictingFields?.join(', ') || 'None'} <br />
              <strong>Last Evaluated:</strong> {selectedBlocked.lastEvaluatedAt || '—'} <br />
            </div>
          </div>
          {Array.isArray(selectedBlocked.reasons) && selectedBlocked.reasons.length > 0 && (
            <div style={{ marginTop: '10px', padding: '8px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px' }}>
              <strong style={{ color: '#f87171' }}>Reason Codes:</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: '20px', color: '#fca5a5', fontSize: '0.78rem' }}>
                {selectedBlocked.reasons.map((rsn, idx) => <li key={idx}>{rsn}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      <AdminDataTable
        title="Settlement Jobs"
        emptyMessage="No pending or failed settlement jobs"
        data={jobRows}
        columns={[
          { header: 'Job ID', key: 'id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.id}</span> },
          { header: 'Bet ID', key: 'betId', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.betId || '—'}</span> },
          { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
          { header: 'Attempts', key: 'attempts', render: (r) => r.attempts ?? '—' },
          { header: 'Updated', key: 'updatedAt', render: (r) => r.updatedAt || '—' },
          {
            header: 'Retry',
            key: 'retry',
            sortable: false,
            render: (r) => (
              <button
                type="button"
                className="admin-btn admin-btn--primary admin-btn--sm"
                disabled={!r.id || retryingId === r.id}
                onClick={() => retryJob(r.id)}
              >
                {retryingId === r.id ? '…' : 'Retry'}
              </button>
            ),
          },
        ]}
      />

      <div style={{ marginTop: 20 }}>
        <AdminDataTable
          title="Pending Open Bets"
          emptyMessage="No open bets awaiting settlement"
          data={(pendingBets || []).map((b) => ({
            id: b.bet_id || b.betId,
            userId: b.user_id || b.userId,
            matchId: b.match_id || b.matchId,
            marketId: b.market_id || b.marketId,
            stake: b.stake,
            odds: b.odds,
            status: b.status,
            createdAt: b.created_at || b.createdAt,
          }))}
          columns={[
            { header: 'Bet ID', key: 'id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.id}</span> },
            { header: 'User', key: 'userId' },
            { header: 'Match', key: 'matchId' },
            { header: 'Market', key: 'marketId' },
            { header: 'Stake', key: 'stake' },
            { header: 'Odds', key: 'odds' },
            { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
            { header: 'Created', key: 'createdAt' },
          ]}
        />
      </div>
    </div>
  );
}

function ControlTowerOpsPanel({ onNavigate }) {
  const [tower, setTower] = useState(null);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [filter, setFilter] = useState('All');
  const drill = useAdminKpiDrilldown();

  const load = useCallback(() => {
    adminApiClient.get('/operations/control-tower')
      .then((data) => {
        setTower(data);
        setLastUpdated(data.lastUpdated || new Date().toISOString());
        setError(data.liveDataUnavailable ? 'Live data unavailable' : null);
      })
      .catch((err) => {
        setError(err.message || 'Live data unavailable');
        setTower(null);
      });
  }, []);

  useEffect(() => {
    const stop = startVisibleInterval(load, 20000, { runImmediately: true });
    return stop;
  }, [load]);

  const top = tower?.topCards || {};
  const cards = [
    { label: 'System Health', value: top.systemHealth || 'N/A', accent: '#34d399', metric: 'systemHealth', cat: 'Infrastructure' },
    { label: 'Open Critical Alerts', value: fmt(top.openCriticalAlerts), accent: '#f43f5e', metric: 'openCriticalAlerts', nav: { domainId: 'operations', subModuleId: 'alerts' }, cat: 'Critical' },
    { label: 'Pending Withdrawals', value: fmt(top.pendingWithdrawals), accent: '#f59e0b', metric: 'pendingWithdrawals', nav: { domainId: 'finance', subModuleId: 'maker-checker' }, cat: 'Finance' },
    { label: 'Pending Checker', value: fmt(top.pendingChecker), accent: '#fb923c', metric: 'pendingChecker', nav: { domainId: 'finance', subModuleId: 'maker-checker' }, cat: 'Finance' },
    { label: 'Open Reconciliation', value: fmt(top.openReconciliation), accent: '#818cf8', metric: 'openReconciliation', nav: { domainId: 'finance', subModuleId: 'finance-health' }, cat: 'Finance' },
    { label: 'Open Incidents', value: fmt(top.openIncidents), accent: '#f87171', metric: 'openIncidents', nav: { domainId: 'operations', subModuleId: 'incidents' }, cat: 'Critical' },
    { label: 'Promotion Abuse', value: fmt(top.promotionAbuse), accent: '#a855f7', metric: 'promotionAbuse', nav: { domainId: 'growth', subModuleId: 'promo-abuse' }, cat: 'Promotions' },
    { label: 'Settlement Issues', value: fmt(top.settlementIssues), accent: '#ef4444', metric: 'settlementIssues', nav: { domainId: 'operations', subModuleId: 'settlement-queue' }, cat: 'Betting' },
  ].filter((c) => {
    if (filter === 'All') return true;
    if (filter === 'Critical') return c.cat === 'Critical' || String(c.value).toUpperCase() === 'CRITICAL';
    if (filter === 'Healthy') return String(c.value).toUpperCase() === 'HEALTHY';
    return c.cat === filter;
  });

  const section = (title, obj, keys, cat) => {
    if (filter !== 'All' && filter !== cat && !['High', 'Warning', 'Healthy'].includes(filter)) {
      if (filter === 'Critical' && cat !== 'Finance' && cat !== 'Betting') return null;
      if (!['Critical', 'High', 'Warning', 'Healthy'].includes(filter) && filter !== cat) return null;
    }
    return (
    <div style={{ marginBottom: 20 }}>
      <h3 className="admin-section-title">{title}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {keys.map(([label, key]) => (
          <AdminKPI
            key={key}
            label={label}
            value={fmt(obj?.[key])}
            accent="#64748b"
            source="Details"
            onClick={() => drill.openDrilldown(key, label)}
          />
        ))}
      </div>
    </div>
    );
  };

  const FILTERS = ['All', 'Critical', 'High', 'Warning', 'Healthy', 'Finance', 'Betting', 'KYC', 'Promotions', 'Security', 'Infrastructure'];

  return (
    <div>
      <div className="admin-flex-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Operations Control Tower</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
            Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleString() : '—'}
            {error ? ` · ${error}` : ''}
            {' · Click any tile for details'}
          </p>
        </div>
        <button type="button" className="admin-btn admin-btn--secondary admin-btn--sm" onClick={load}>↻ Refresh</button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`admin-btn admin-btn--sm ${filter === f ? 'admin-btn--primary' : 'admin-btn--secondary'}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
        {cards.map((c) => (
          <AdminKPI
            key={c.label}
            label={c.label}
            value={c.value}
            accent={c.accent}
            source="Details"
            onClick={() => {
              if (c.metric) drill.openDrilldown(c.metric, c.label);
              else if (c.nav && onNavigate) onNavigate(c.nav);
            }}
          />
        ))}
      </div>

      {(filter === 'All' || filter === 'Finance') && section('Financial Operations', tower?.financial, [
        ['Deposits today', 'depositsToday'],
        ['Deposit failures', 'depositFailures'],
        ['Pending WD', 'pendingWithdrawals'],
        ['Approvals', 'withdrawalApprovals'],
        ['Rejections', 'withdrawalRejections'],
        ['HOLD', 'withdrawalHold'],
        ['HIGH risk', 'highRiskWithdrawals'],
        ['CRITICAL risk', 'criticalRiskWithdrawals'],
        ['Checker', 'pendingCheckerApprovals'],
        ['Open recon', 'openReconciliationCases'],
      ], 'Finance')}

      {(filter === 'All' || filter === 'Betting') && section('Betting Operations', tower?.betting, [
        ['Live matches', 'liveMatches'],
        ['Open bets', 'openBets'],
        ['Bets today', 'betsPlacedToday'],
        ['Rejected', 'betsRejectedToday'],
        ['Settlement pending', 'settlementPending'],
        ['Settlement failures', 'settlementFailures'],
        ['Suspended markets', 'suspendedMarkets'],
        ['Odds freshness issues', 'oddsFreshnessProblems'],
      ], 'Betting')}

      {(filter === 'All' || filter === 'Promotions') && section('Promotion Operations', tower?.promotions, [
        ['Active campaigns', 'activeCampaigns'],
        ['Freebets issued', 'freebetsIssuedToday'],
        ['Freebets claimed', 'freebetsClaimedToday'],
        ['Abuse blocks today', 'promotionAbuseBlocksToday'],
        ['Open abuse alerts', 'openPromotionAbuseAlerts'],
        ['Referrals today', 'referralActivityToday'],
      ], 'Promotions')}

      {(filter === 'All' || filter === 'KYC') && section('User / KYC', tower?.usersKyc, [
        ['Registrations today', 'newRegistrationsToday'],
        ['KYC pending', 'kycPending'],
        ['KYC verified', 'kycVerified'],
        ['Registered users', 'registeredUsers'],
      ], 'KYC')}

      <AdminDataTable
        title="Admin Work Queue"
        emptyMessage="No queue items"
        data={(tower?.workQueue || []).map((q) => ({
          id: q.id,
          label: q.label,
          count: fmt(q.count),
          domainId: q.domainId,
          subModuleId: q.subModuleId,
        }))}
        columns={[
          { header: 'Queue', key: 'label' },
          { header: 'Count', key: 'count' },
          {
            header: 'Open',
            key: 'open',
            sortable: false,
            render: (r) => (
              <button
                type="button"
                className="admin-btn admin-btn--secondary admin-btn--sm"
                onClick={() => onNavigate?.({ domainId: r.domainId, subModuleId: r.subModuleId })}
              >
                Open
              </button>
            ),
          },
        ]}
      />
      <AdminKpiDrillDrawer drill={drill} />
    </div>
  );
}

function AlertsPanel() {
  const [alerts, setAlerts] = useState([]);
  const [status, setStatus] = useState('OPEN');
  const [busy, setBusy] = useState(null);
  const { showToast } = useAdminToast();

  const load = useCallback(() => {
    const q = status ? `?status=${encodeURIComponent(status)}&limit=50` : '?limit=50';
    adminApiClient.get(`/operations/alerts${q}`)
      .then((data) => setAlerts(data.alerts || []))
      .catch(() => setAlerts([]));
  }, [status]);

  useEffect(() => {
    const stop = startVisibleInterval(load, 20000, { runImmediately: true });
    return stop;
  }, [load]);

  const act = async (id, action) => {
    setBusy(`${id}:${action}`);
    try {
      await adminApiClient.post(`/operations/alerts/${id}/${action}`, {});
      if (action === 'create-incident') showToast('Incident created', 'success');
      load();
    } catch (err) {
      showToast(err.message || 'Action failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="admin-flex-between" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Ops Alerts</h2>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="admin-input" style={{ width: 160 }}>
          <option value="OPEN">OPEN</option>
          <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
          <option value="RESOLVED">RESOLVED</option>
          <option value="DISMISSED">DISMISSED</option>
          <option value="">ALL</option>
        </select>
      </div>
      <AdminDataTable
        title="Alerts"
        emptyMessage="No alerts"
        data={alerts.map((a) => ({
          id: a.notification_id,
          title: a.title,
          severity: a.severity || a.priority,
          status: a.status || 'OPEN',
          category: a.category,
          occurrences: a.occurrence_count || 1,
          createdAt: a.created_at,
          entity: a.entity_id || a.action_target_id,
        }))}
        columns={[
          { header: 'Title', key: 'title' },
          { header: 'Severity', key: 'severity', render: (r) => <StatusBadge status={r.severity} /> },
          { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
          { header: 'Category', key: 'category' },
          { header: 'Count', key: 'occurrences' },
          { header: 'Entity', key: 'entity', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.72rem' }}>{r.entity || '—'}</span> },
          {
            header: 'Actions',
            key: 'actions',
            sortable: false,
            render: (r) => (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => act(r.id, 'acknowledge')}>Ack</button>
                <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => act(r.id, 'resolve')}>Resolve</button>
                <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => act(r.id, 'dismiss')}>Dismiss</button>
                <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" disabled={busy} onClick={() => act(r.id, 'create-incident')}>Incident</button>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function IncidentsPanel() {
  const [incidents, setIncidents] = useState([]);
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState('SEV-2');
  const { showToast } = useAdminToast();

  const load = useCallback(() => {
    adminApiClient.get('/operations/incidents?limit=50')
      .then((data) => setIncidents(data.incidents || []))
      .catch(() => setIncidents([]));
  }, []);

  useEffect(() => {
    const stop = startVisibleInterval(load, 30000, { runImmediately: true });
    return stop;
  }, [load]);

  const create = async () => {
    if (!title.trim()) return;
    try {
      await adminApiClient.post('/operations/incidents', { title, severity });
      setTitle('');
      showToast('Incident created', 'success');
      load();
    } catch (err) {
      showToast(err.message || 'Create failed', 'error');
    }
  };

  const resolve = async (id) => {
    try {
      await adminApiClient.post(`/operations/incidents/${id}/resolve`, {
        resolutionSummary: 'Resolved from Operations UI',
      });
      load();
    } catch (err) {
      showToast(err.message || 'Resolve failed', 'error');
    }
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 12px', fontSize: '1.3rem', fontWeight: 800 }}>Incidents</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="admin-input" placeholder="Incident title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ minWidth: 240 }} />
        <select className="admin-input" value={severity} onChange={(e) => setSeverity(e.target.value)} style={{ width: 120 }}>
          {['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="button" className="admin-btn admin-btn--primary" onClick={create}>Create</button>
      </div>
      <AdminDataTable
        title="Incident register"
        emptyMessage="No incidents"
        data={incidents.map((i) => ({
          id: i.id,
          number: i.incident_number || i.id,
          title: i.title,
          severity: i.severity,
          status: i.status,
          assigned: i.assigned_to || '—',
          createdAt: i.created_at,
        }))}
        columns={[
          { header: 'Number', key: 'number', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.72rem' }}>{r.number}</span> },
          { header: 'Title', key: 'title' },
          { header: 'Severity', key: 'severity', render: (r) => <StatusBadge status={r.severity} /> },
          { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
          { header: 'Assigned', key: 'assigned' },
          { header: 'Created', key: 'createdAt' },
          {
            header: 'Resolve',
            key: 'resolve',
            sortable: false,
            render: (r) => (
              <button type="button" className="admin-btn admin-btn--sm" onClick={() => resolve(r.id)} disabled={['RESOLVED', 'CLOSED', 'POSTMORTEM'].includes(String(r.status).toUpperCase())}>
                Resolve
              </button>
            ),
          },
        ]}
      />
    </div>
  );
}

function ProductionHealthPanel() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const drill = useAdminKpiDrilldown();

  const load = useCallback(() => {
    adminApiClient.get('/operations/production-health')
      .then((data) => {
        setHealth(data);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || 'Live data unavailable');
        setHealth(null);
      });
  }, []);

  useEffect(() => {
    const stop = startVisibleInterval(load, 30000, { runImmediately: true });
    return stop;
  }, [load]);

  const block = (title, obj, fields) => (
    <div style={{ marginBottom: 18 }}>
      <h3 className="admin-section-title">{title} · {obj?.status || 'UNKNOWN'}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {fields.map(([label, key]) => {
          const raw = obj?.[key];
          const display = typeof raw === 'string' && Number.isNaN(Number(raw))
            ? raw
            : fmt(raw);
          return (
            <AdminKPI
              key={key}
              label={label}
              value={display}
              accent="#64748b"
              source="Details"
              onClick={() => drill.openDrilldown(key, label)}
            />
          );
        })}
      </div>
    </div>
  );

  return (
    <div>
      <div className="admin-flex-between" style={{ marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Production Health</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
            Overall: {health?.overall || 'UNKNOWN'}
            {health?.lastUpdated ? ` · Last updated: ${new Date(health.lastUpdated).toLocaleString()}` : ''}
            {error ? ` · ${error}` : ''}
            {' · Click any tile for details'}
          </p>
        </div>
        <button type="button" className="admin-btn admin-btn--secondary admin-btn--sm" onClick={load}>↻ Refresh</button>
      </div>
      {block('Application', health?.application, [
        ['Uptime (s)', 'uptimeSeconds'], ['Requests', 'requestCount'], ['Errors', 'errorCount'],
        ['Error rate', 'errorRate'], ['Avg latency ms', 'averageLatencyMs'], ['5xx', 'count5xx'], ['4xx', 'count4xx'],
      ])}
      {block('Database', health?.database, [
        ['Connection', 'connectionStatus'], ['Latency ms', 'latencyMs'], ['Migrations', 'migrationStatus'], ['Redis', 'redisStatus'],
      ])}
      {block('Background Jobs', health?.backgroundJobs, [
        ['Pending', 'pending'], ['Failed', 'failed'], ['Completed', 'completed'], ['Active', 'active'],
      ])}
      {block('Betting', health?.betting, [
        ['Placement failures', 'betPlacementFailuresToday'], ['Settlement pending', 'settlementPending'],
        ['Settlement failed', 'settlementFailed'],
      ])}
      {block('Finance', health?.finance, [
        ['WD failures', 'withdrawalFailuresRecent'], ['Pending WD', 'pendingWithdrawals'],
        ['Recon open', 'reconciliationDiscrepancies'], ['Deposit failures', 'depositFailuresToday'],
      ])}
      {block('Security', health?.security, [
        ['Open critical alerts', 'openCriticalAlerts'],
      ])}
      <AdminKpiDrillDrawer drill={drill} />
    </div>
  );
}

function NotificationsPanel() {
  const [rows, setRows] = useState([]);
  const [unread, setUnread] = useState(0);
  const { showToast } = useAdminToast();

  const load = useCallback(() => {
    adminApiClient.get('/operations/notifications?limit=50')
      .then((data) => {
        setRows(data.notifications || []);
        setUnread(data.unreadCount || 0);
      })
      .catch(() => setRows([]));
  }, []);

  useEffect(() => {
    const stop = startVisibleInterval(load, 20000, { runImmediately: true });
    return stop;
  }, [load]);

  return (
    <div>
      <div className="admin-flex-between" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>
          Notification Center
          {unread > 0 ? ` (${unread} unread)` : ''}
        </h2>
        <button
          type="button"
          className="admin-btn admin-btn--secondary admin-btn--sm"
          onClick={async () => {
            await adminApiClient.post('/operations/notifications/read-all', {});
            showToast('All marked read', 'success');
            load();
          }}
        >
          Mark all read
        </button>
      </div>
      <AdminDataTable
        title="Notifications"
        emptyMessage="No notifications"
        data={rows.map((n) => ({
          id: n.notification_id,
          title: n.title,
          severity: n.severity || n.priority,
          category: n.category,
          read: n.is_read ? 'Yes' : 'Unread',
          createdAt: n.created_at,
        }))}
        columns={[
          { header: 'Title', key: 'title' },
          { header: 'Severity', key: 'severity', render: (r) => <StatusBadge status={r.severity} /> },
          { header: 'Type', key: 'category' },
          { header: 'Read', key: 'read' },
          { header: 'Created', key: 'createdAt' },
          {
            header: 'Mark read',
            key: 'mr',
            sortable: false,
            render: (r) => (
              <button
                type="button"
                className="admin-btn admin-btn--sm"
                onClick={async () => {
                  await adminApiClient.post(`/operations/notifications/${r.id}/read`, {});
                  load();
                }}
              >
                Read
              </button>
            ),
          },
        ]}
      />
    </div>
  );
}

function BackupsDrPanel() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    adminApiClient.get('/operations/backups?limit=50')
      .then((data) => {
        setRows(data.backups || []);
        setSummary(data.summary || null);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
        setRows([]);
      });
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Backups / DR</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Backup log metadata. Isolated restore verification and wallet↔ledger mismatch counts are documented in DR reports — not claimed as production RPO/RTO from local dumps.
        </p>
        {summary && (
          <p style={{ fontSize: '0.78rem', marginTop: 8 }}>
            Last backup: {summary.lastBackupAt ? new Date(summary.lastBackupAt).toLocaleString() : '—'}
            {' · '}Status: {summary.lastStatus || '—'}
            {' · '}Age: {summary.ageHours != null ? `${summary.ageHours}h` : '—'}
          </p>
        )}
        {error && <p style={{ color: '#fbbf24' }}>{error}</p>}
      </div>
      <AdminDataTable
        title="Backup log"
        data={rows}
        emptyMessage="No backups_log rows"
        columns={[
          { header: 'ID', key: 'id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.72rem' }}>{r.id}</span> },
          { header: 'Type', key: 'backup_type' },
          { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
          { header: 'Size', key: 'size_bytes', render: (r) => (r.size_bytes != null ? `${Math.round(r.size_bytes / 1024 / 1024)} MB` : '—') },
          { header: 'Duration', key: 'duration_ms', render: (r) => (r.duration_ms != null ? `${r.duration_ms} ms` : '—') },
          { header: 'When', key: 'created_at', render: (r) => (r.created_at ? new Date(r.created_at).toLocaleString() : '—') },
        ]}
      />
    </div>
  );
}

function ProductionReadinessPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [env, setEnv] = useState('local');
  const [selectedGate, setSelectedGate] = useState(null);

  const load = () => {
    adminApiClient.get(`/operations/production-readiness?environment=${encodeURIComponent(env)}`)
      .then((res) => { setData(res); setError(null); })
      .catch((err) => { setError(err.message); setData(null); });
  };

  useEffect(() => { load(); }, [env]);

  const gates = data?.gates || [];
  const go = data?.goNoGo;
  const tf = data?.testFunding;

  return (
    <div>
      <div className="admin-flex-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Production Readiness / Go-Live</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
            Evidence-based gates. Local tests never make production GREEN. No auto-repair of wallets/ledger.
          </p>
        </div>
        <label style={{ fontSize: '0.78rem' }}>
          Environment claim
          <select value={env} onChange={(e) => setEnv(e.target.value)} style={{ display: 'block', marginTop: 4 }}>
            <option value="local">local</option>
            <option value="staging">staging</option>
            <option value="production">production</option>
          </select>
        </label>
        <button type="button" className="admin-btn admin-btn--sm" onClick={load}>Refresh</button>
        {data && <StatusBadge status={data.overall} />}
      </div>

      {error && <p style={{ color: '#fbbf24' }}>{error}</p>}

      {go && (
        <div style={{
          marginBottom: 16,
          padding: 12,
          border: '1px solid var(--admin-border)',
          borderRadius: 8,
          background: go.goLiveBlockedByTestFunding ? 'rgba(251,191,36,0.08)' : undefined,
        }}>
          <div style={{ fontWeight: 800 }}>GO/NO-GO: {go.decision}</div>
          <p style={{ fontSize: '0.78rem', margin: '6px 0 0' }}>
            Environment: {data?.environment || env} · Generated: {data?.generatedAt || '—'}
            {data?.telemetryScope ? ` · ${data.telemetryScope}` : ''}
          </p>
          {go.reasons?.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: '0.8rem' }}>
              {go.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
          {tf?.code && (
            <p style={{ fontSize: '0.78rem', marginTop: 8 }}>
              Test funding: <StatusBadge status={tf.code} /> · pending: {tf.pendingCount ?? '—'}
              · residual total: {tf.residualTotal != null ? Number(tf.residualTotal).toFixed(2) : '—'}
              {tf.goLiveBlocked ? ' · GO-LIVE BLOCK until residual balances are zeroed via authorized path' : ''}
            </p>
          )}
          {(data?.mismatchCounts || tf) && (
            <p style={{ fontSize: '0.75rem', marginTop: 6, color: 'var(--admin-text-muted)' }}>
              RAW mismatches: {data?.mismatchCounts?.RAW_MISMATCH_COUNT ?? tf?.RAW_MISMATCH_COUNT ?? '—'}
              {' · '}ACTIONABLE: {data?.mismatchCounts?.ACTIONABLE_MISMATCH_COUNT ?? tf?.ACTIONABLE_MISMATCH_COUNT ?? '—'}
              {' · '}ACCEPTED: {data?.mismatchCounts?.ACCEPTED_MISMATCH_COUNT ?? tf?.ACCEPTED_MISMATCH_COUNT ?? '—'}
              {' · '}NO AUTO-REPAIR
            </p>
          )}
        </div>
      )}

      {Array.isArray(data?.whyNotGreen) && data.whyNotGreen.length > 0 && (
        <div style={{ marginBottom: 16, padding: 12, border: '1px solid var(--admin-border)', borderRadius: 8 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Why not GREEN?</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.78rem', maxHeight: 220, overflow: 'auto' }}>
            {data.whyNotGreen.slice(0, 40).map((w) => (
              <li key={w.id}>
                <span className="admin-text-mono">{w.id}</span>
                {' '}
                <StatusBadge status={w.status} />
                {w.blocking ? ' · BLOCKING' : ''}
                {' — '}
                {w.explanation}
              </li>
            ))}
          </ul>
        </div>
      )}

      <AdminDataTable
        title="Go-live gates"
        data={gates.map((g) => ({
          id: g.id,
          label: g.label,
          status: g.status,
          blocking: g.blocking,
          evidence: g.evidence,
          explanation: g.explanation,
          remediation: g.remediation,
        }))}
        emptyMessage="No gates"
        onRowClick={setSelectedGate}
        columns={[
          { header: 'Gate', key: 'id', render: (r) => <span className="admin-text-mono">{r.id}</span> },
          { header: 'Label', key: 'label' },
          { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
          { header: 'Blocking', key: 'blocking', render: (r) => (r.blocking ? 'YES' : '') },
        ]}
      />

      {tf?.accounts?.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: '0.95rem' }}>Known test-funding accounts (read-only)</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
            NO AUTO-REPAIR. Zero via maker/checker or authorized adjustment before go-live.
          </p>
          <AdminDataTable
            title="Test funding"
            data={tf.accounts}
            columns={[
              { header: 'User', key: 'userId' },
              { header: 'Cash', key: 'cashBalance' },
              { header: 'Bonus', key: 'bonusBalance' },
              { header: 'Freebet', key: 'freebetBalance' },
              { header: 'Reserved', key: 'reservedBalance' },
              { header: 'Bucket', key: 'bucketTotal' },
              { header: 'Ledger', key: 'ledgerSum' },
              { header: 'Cleanup', key: 'cleanupStatus', render: (r) => r.cleanupStatus || (r.residualNonZero ? 'PENDING_ZERO' : 'CLEAN') },
              { header: 'Residual', key: 'residualNonZero', render: (r) => (r.residualNonZero ? 'YES' : 'no') },
            ]}
          />
        </div>
      )}

      {selectedGate && (
        <div
          role="dialog"
          aria-label="Gate evidence"
          style={{
            position: 'fixed', right: 0, top: 0, bottom: 0, width: 'min(420px, 100vw)',
            background: 'var(--admin-surface, #111)', borderLeft: '1px solid var(--admin-border)',
            padding: 16, overflow: 'auto', zIndex: 40,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>{selectedGate.id}</h3>
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => setSelectedGate(null)}>Close</button>
          </div>
          <p><StatusBadge status={selectedGate.status} /> {selectedGate.label}</p>
          <pre style={{ fontSize: '0.72rem', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(selectedGate.evidence || {}, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}


function ProductionCertificationPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [env, setEnv] = useState('production');
  const [selectedGate, setSelectedGate] = useState(null);

  const load = () => {
    adminApiClient.get(`/operations/production-certification?environment=${encodeURIComponent(env)}`)
      .then((res) => { setData(res); setError(null); })
      .catch((err) => { setError(err.message); setData(null); });
  };

  useEffect(() => { load(); }, [env]);

  const go = data?.goNoGo;
  const gates = Array.isArray(data?.gates) ? data.gates : Object.values(data?.gatesMap || data?.gates || {});
  const checklistSections = data?.checklist?.sections || null;

  return (
    <div>
      <div className="admin-flex-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>PRODUCTION CERTIFICATION</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
            Phase 11 evidence-gated certification. No Force GREEN. No auto-repair. No override.
            Local/staging evidence never satisfies production. Checklist cannot override certification.
          </p>
        </div>
        <label style={{ fontSize: '0.78rem' }}>
          Environment
          <select value={env} onChange={(e) => setEnv(e.target.value)} style={{ display: 'block', marginTop: 4 }}>
            <option value="local">local</option>
            <option value="staging">staging</option>
            <option value="production">production</option>
          </select>
        </label>
        <button type="button" className="admin-btn admin-btn--sm" onClick={load}>Refresh</button>
        {data && <StatusBadge status={data.PRODUCTION_CERTIFICATION_STATUS || data.certificationStatus} />}
      </div>

      {error && <p style={{ color: '#fbbf24' }}>{error}</p>}

      {go && (
        <div style={{ marginBottom: 16, padding: 12, border: '1px solid var(--admin-border)', borderRadius: 8 }}>
          <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>
            {go.decision === 'GO' ? 'GO' : 'NO-GO'}
            {' · '}
            STATUS: {data?.PRODUCTION_CERTIFICATION_STATUS || data?.status || '—'}
          </div>
          <p style={{ fontSize: '0.78rem', marginTop: 6 }}>
            productionClaimAllowed: <strong>{go.productionClaimAllowed ? 'YES' : 'NO'}</strong>
            {' · '}forceGreenAllowed: <strong>NO</strong>
            {' · '}autoRepair: <strong>NO</strong>
            {' · '}overrideAllowed: <strong>NO</strong>
            {' · '}version: {data?.certificationVersion || data?.phase || '—'}
            {' · '}commit: {data?.build?.gitCommit || data?.gitCommit || '—'}
            {' · '}at: {data?.generatedAt || '—'}
          </p>
          {data?.testFunding && (
            <p style={{ fontSize: '0.75rem', marginTop: 4 }}>
              Test funding (connected): {data.testFunding.code || '—'}
              {' · '}residual: {data.testFunding.residualTotal != null ? Number(data.testFunding.residualTotal).toFixed(2) : '—'}
              {' · '}pending: {data.testFunding.pendingCount ?? '—'}
              {data.testFunding.goLiveBlocked ? ' · GO-LIVE BLOCK' : ''}
            </p>
          )}
          {data?.ledger?.mismatchCounts && (
            <p style={{ fontSize: '0.75rem', marginTop: 4 }}>
              Ledger RAW: {data.ledger.mismatchCounts.RAW_MISMATCH_COUNT ?? '—'}
              {' · '}ACTIONABLE: {data.ledger.mismatchCounts.ACTIONABLE_MISMATCH_COUNT ?? '—'}
              {' · '}ACCEPTED: {data.ledger.mismatchCounts.ACCEPTED_MISMATCH_COUNT ?? '—'}
              {' · '}{data.ledger.policy || 'FLAG_ONLY'}
            </p>
          )}
          {go.mandatoryBlockers?.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: '0.78rem' }}>
              {go.mandatoryBlockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
          )}
        </div>
      )}

      {checklistSections && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: 8 }}>Go-live checklist (read-only)</h3>
          <p style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', marginTop: 0 }}>
            {data.checklist?.note || 'Does not override certification.'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {Object.entries(checklistSections).map(([section, items]) => (
              <div key={section} style={{ border: '1px solid var(--admin-border)', borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 700, fontSize: '0.78rem', marginBottom: 6 }}>{section}</div>
                {(items || []).map((item) => (
                  <div key={item.gate} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.72rem', marginBottom: 4 }}>
                    <span className="admin-text-mono">{item.gate}</span>
                    <StatusBadge status={item.status} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {data?.evidenceCompleteness && (
        <p style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', marginBottom: 12 }}>
          Evidence files: {data.evidenceCompleteness.filesOnDisk ?? '—'}
          {data.evidenceCompleteness.phase11Files != null ? ` · phase11: ${data.evidenceCompleteness.phase11Files}` : ''}
          {data.evidenceCompleteness.phase10Files != null ? ` · phase10: ${data.evidenceCompleteness.phase10Files}` : ''}
          {' · '}missing latest: {(data.evidenceCompleteness.missingLatest || []).slice(0, 8).join(', ') || 'none'}
          {(data.evidenceCompleteness.missingLatest || []).length > 8 ? '…' : ''}
        </p>
      )}

      <AdminDataTable
        title="Certification gates"
        data={gates.map((g) => ({
          name: g.name || g.gate,
          status: g.status,
          environment: g.environment || g.evidenceEnvironment || '—',
          evidenceTime: g.evidenceTimestamp || g.timestamp || '—',
          evidenceAge: g.evidenceAgeHuman || '—',
          evidenceSource: g.evidenceSource || g.evidencePath || '—',
          verifiedBy: g.verifiedBy || g.verifier || '—',
          reason: g.reason || g.notes || '—',
          required: g.required ? 'YES' : '',
          raw: g,
        }))}
        emptyMessage="No gates"
        onRowClick={(r) => setSelectedGate(r.raw)}
        columns={[
          { header: 'Gate', key: 'name', render: (r) => <span className="admin-text-mono">{r.name}</span> },
          { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
          { header: 'Environment', key: 'environment' },
          { header: 'Evidence time', key: 'evidenceTime' },
          { header: 'Age', key: 'evidenceAge' },
          { header: 'Source', key: 'evidenceSource' },
          { header: 'Reason', key: 'reason' },
        ]}
      />

      {selectedGate && (
        <div
          role="dialog"
          aria-label="Certification evidence drawer"
          style={{
            position: 'fixed', right: 0, top: 0, bottom: 0, width: 'min(440px, 100vw)',
            background: 'var(--admin-surface, #111)', borderLeft: '1px solid var(--admin-border)',
            padding: 16, overflow: 'auto', zIndex: 40,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>{selectedGate.name || selectedGate.gate}</h3>
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => setSelectedGate(null)}>Close</button>
          </div>
          <p><StatusBadge status={selectedGate.status} /></p>
          <p style={{ fontSize: '0.75rem' }}>
            Env: {selectedGate.environment} · Evidence env: {selectedGate.evidenceEnvironment || '—'}
            <br />
            Expires: {selectedGate.expiresAt || '—'}
            <br />
            Method: {selectedGate.verificationMethod || '—'}
          </p>
          <pre style={{ fontSize: '0.72rem', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(selectedGate, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}



export default function OperationsDomainView({ subModule = 'health-matrix', onNavigate }) {
  const [services, setServices] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [outboxEvents, setOutboxEvents] = useState([]);
  const [obs, setObs] = useState(null);
  const [error, setError] = useState(null);
  const drill = useAdminKpiDrilldown();

  useEffect(() => {
    let cancelled = false;

    if (['settlement-queue', 'control-tower', 'alerts', 'incidents', 'production-health', 'production-readiness', 'production-certification', 'notifications', 'backups-dr'].includes(subModule)) {
      return undefined;
    }

    if (subModule === 'outbox-queue') {
      const loadOutbox = () => {
        Promise.all([
          adminApiClient.get('/outbox/metrics'),
          adminApiClient.get('/outbox/events'),
          adminApiClient.get('/ops/observability').catch(() => null),
        ])
          .then(([metricsRes, eventsRes, observability]) => {
            if (cancelled) return;
            setMetrics(metricsRes.metrics || null);
            setOutboxEvents(eventsRes.events || []);
            setObs(observability);
            setError(eventsRes.note || null);
          })
          .catch((err) => {
            if (cancelled) return;
            setMetrics(null);
            setOutboxEvents([]);
            setError(err.message || 'Failed to load outbox telemetry');
          });
      };
      const stop = startVisibleInterval(loadOutbox, 30000, { runImmediately: true });
      return () => {
        cancelled = true;
        stop();
      };
    }

    const loadHealth = () => {
      Promise.all([
        adminApiClient.get('/operations/health'),
        adminApiClient.get('/ops/observability').catch(() => null),
      ])
        .then(([data, observability]) => {
          if (cancelled) return;
          setServices(data.services || []);
          setObs(observability);
          setError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setServices([]);
          setError(err.message || 'Failed to load health matrix');
        });
    };
    const stop = startVisibleInterval(loadHealth, 30000, { runImmediately: true });
    return () => {
      cancelled = true;
      stop();
    };
  }, [subModule]);

  if (subModule === 'control-tower') return <ControlTowerOpsPanel onNavigate={onNavigate} />;
  if (subModule === 'alerts') return <AlertsPanel />;
  if (subModule === 'incidents') return <IncidentsPanel />;
  if (subModule === 'production-health') return <ProductionHealthPanel />;
  if (subModule === 'production-readiness') return <ProductionReadinessPanel />;
  if (subModule === 'production-certification') return <ProductionCertificationPanel />;
  if (subModule === 'notifications') return <NotificationsPanel />;
  if (subModule === 'settlement-queue') return <SettlementQueuePanel />;
  if (subModule === 'backups-dr') return <BackupsDrPanel />;

  if (subModule === 'outbox-queue') {
    const metricRows = metrics ? [
      { label: 'Pending', metric: 'pending', value: metrics.pending, accent: '#fbbf24' },
      { label: 'Processing', metric: 'processing', value: metrics.processing, accent: '#38bdf8' },
      { label: 'Processed', metric: 'processed', value: metrics.processed, accent: '#34d399' },
      { label: 'Failed', metric: 'failed', value: metrics.failed, accent: '#f43f5e' },
      { label: 'Dead Letter', metric: 'deadLetter', value: metrics.deadLetter, accent: '#f87171' },
      { label: 'Total Events', metric: 'totalEvents', value: metrics.totalEvents, accent: '#818cf8' },
    ] : [];

    return (
      <div>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>12 · Outbox Worker Telemetry</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
            Transactional outbox queue depth and in-flight events. Refreshes every 30s. Click any tile for details.
          </p>
          {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
        </div>

        <ObservabilityKpis data={obs} onDrill={drill.openDrilldown} />

        {metricRows.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 12,
            marginBottom: 20,
          }}
          >
            {metricRows.map((m) => (
              <AdminKPI
                key={m.label}
                label={m.label}
                value={m.value ?? '—'}
                accent={m.accent}
                source="Details"
                onClick={() => drill.openDrilldown(m.metric, m.label)}
              />
            ))}
          </div>
        )}

        <AdminDataTable
          title="Active Outbox Events"
          emptyMessage="No pending or failed outbox events"
          data={outboxEvents}
          columns={[
            { header: 'Event ID', key: 'id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.id}</span> },
            { header: 'Type', key: 'eventType', render: (r) => <span className="admin-badge admin-badge--neutral">{r.eventType}</span> },
            { header: 'Aggregate', key: 'aggregateType' },
            { header: 'Aggregate ID', key: 'aggregateId', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.aggregateId}</span> },
            { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
            { header: 'Created At', key: 'createdAt' },
          ]}
        />
        <AdminKpiDrillDrawer drill={drill} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>12 · Infrastructure Health Matrix</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Live Postgres ping + aggregator provider status. Unknown services stay UNKNOWN (not faked healthy).
          Click observability tiles for details.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      <ObservabilityKpis data={obs} onDrill={drill.openDrilldown} />
      <AdminKpiDrillDrawer drill={drill} />

      <AdminDataTable
        title="Service & Infrastructure Health Checks"
        emptyMessage="No health signals yet"
        data={services}
        columns={[
          { header: 'Service / Dependency', key: 'service', render: (r) => <span style={{ fontWeight: 700 }}>{r.service}</span> },
          { header: 'Health Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
          { header: 'Latency / Mode', key: 'latency', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.latency}</span> },
          { header: 'Detail', key: 'uptime' },
        ]}
      />
    </div>
  );
}
