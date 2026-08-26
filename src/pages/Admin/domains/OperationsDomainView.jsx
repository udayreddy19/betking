import React, { useState, useEffect, useCallback } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { StatusBadge } from '../components/AdminBadge';
import AdminKPI from '../components/AdminKPI';
import { useAdminToast } from '../components/AdminToastContext';
import { startVisibleInterval } from '../utils/visibleInterval';

function ObservabilityKpis({ data }) {
  if (!data) return null;
  const rows = [
    { label: 'Settlement open', value: data.settlement?.open_jobs, accent: '#fbbf24' },
    { label: 'Settlement failed', value: data.settlement?.failed_jobs, accent: '#f43f5e' },
    { label: 'Completed 15m', value: data.settlement?.completed_15m, accent: '#34d399' },
    { label: 'Deposits pending 1h', value: data.deposits?.pending_1h, accent: '#38bdf8' },
    { label: 'Open bets', value: data.betting?.open_bets, accent: '#818cf8' },
    { label: 'Outbox pending', value: data.outbox?.pending, accent: '#f59e0b' },
    { label: 'Outbox failed', value: data.outbox?.failed, accent: '#f87171' },
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
        />
      ))}
    </div>
  );
}

function SettlementQueuePanel() {
  const [pendingJobs, setPendingJobs] = useState([]);
  const [pendingBets, setPendingBets] = useState([]);
  const [failedJobs, setFailedJobs] = useState([]);
  const [obs, setObs] = useState(null);
  const [error, setError] = useState(null);
  const [retryingId, setRetryingId] = useState(null);
  const { showToast } = useAdminToast();

  const load = useCallback(() => {
    Promise.all([
      adminApiClient.get('/settlement/pending').catch((err) => ({ error: err.message })),
      adminApiClient.get('/settlement/failed').catch(() => ({ failedJobs: [] })),
      adminApiClient.get('/ops/observability').catch(() => null),
    ]).then(([pending, failed, observability]) => {
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
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>12 · Settlement Queue</h2>
          <button type="button" className="admin-btn admin-btn--secondary admin-btn--sm" onClick={load}>
            ↻ Refresh
          </button>
        </div>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Pending settlement jobs and open bets awaiting resolution. Refreshes every 30s.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
        {obs?.alerts?.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {obs.alerts.map((a) => (
              <div
                key={a.code}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  fontSize: '0.8rem',
                  background: a.severity === 'high' ? 'rgba(244,63,94,0.1)' : 'rgba(245,158,11,0.1)',
                  color: a.severity === 'high' ? '#b91c1c' : '#b45309',
                }}
              >
                {a.message}
              </div>
            ))}
          </div>
        )}
      </div>

      <ObservabilityKpis data={obs} />

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

export default function OperationsDomainView({ subModule = 'health-matrix' }) {
  const [services, setServices] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [outboxEvents, setOutboxEvents] = useState([]);
  const [obs, setObs] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    if (subModule === 'settlement-queue') {
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

  if (subModule === 'settlement-queue') {
    return <SettlementQueuePanel />;
  }

  if (subModule === 'outbox-queue') {
    const metricRows = metrics ? [
      { label: 'Pending', value: metrics.pending, accent: '#fbbf24' },
      { label: 'Processing', value: metrics.processing, accent: '#38bdf8' },
      { label: 'Processed', value: metrics.processed, accent: '#34d399' },
      { label: 'Failed', value: metrics.failed, accent: '#f43f5e' },
      { label: 'Dead Letter', value: metrics.deadLetter, accent: '#f87171' },
      { label: 'Total Events', value: metrics.totalEvents, accent: '#818cf8' },
    ] : [];

    return (
      <div>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>12 · Outbox Worker Telemetry</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
            Transactional outbox queue depth and in-flight events. Refreshes every 30s.
          </p>
          {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
        </div>

        <ObservabilityKpis data={obs} />

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
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>12 · Infrastructure Health Matrix</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Live Postgres ping + aggregator provider status. Unknown services stay UNKNOWN (not faked healthy).
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      <ObservabilityKpis data={obs} />

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
