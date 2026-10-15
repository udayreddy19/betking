import React, { useState, useEffect, useCallback } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { StatusBadge } from '../components/AdminBadge';
import IPLSRLConsoleView from './IPLSRLConsoleView';
import AdminRostersView from './AdminRostersView';

export default function SportsDomainView({ subModule = 'catalog' }) {
  const [sports, setSports] = useState([]);
  const [error, setError] = useState(null);
  const [totalMatches, setTotalMatches] = useState(0);
  const [feedRows, setFeedRows] = useState([]);
  const [feedOverall, setFeedOverall] = useState(null);
  const [feedError, setFeedError] = useState(null);

  const loadCatalog = useCallback(() => {
    adminApiClient.get('/sports/catalog')
      .then((data) => {
        setSports(data.sports || []);
        setTotalMatches(data.totalMatches || 0);
        setError(null);
      })
      .catch((err) => {
        setSports([]);
        setError(err.message || 'Failed to load sports catalog');
      });
  }, []);

  const loadFeeds = useCallback(() => {
    adminApiClient.get('/trading/feeds-health')
      .then((data) => {
        const snap = data.feeds || {};
        const providers = Array.isArray(snap.providers) ? snap.providers : [];
        setFeedRows(providers.map((v) => ({
          id: v.id || v.name || 'unknown',
          name: v.name || v.id || 'unknown',
          status: v.healthStatus || v.status || 'UNKNOWN',
          latencyMs: v.tickAgeMs ?? v.latencyMs ?? v.pollIntervalMs ?? null,
          lastSuccessAt: v.lastSuccessAt || v.lastTickAt || null,
          lastError: v.lastError || v.error || null,
        })));
        setFeedOverall(snap.healthy === false || snap.status === 'DEGRADED' ? 'DEGRADED' : (snap.status || 'OK'));
        setFeedError(null);
      })
      .catch((err) => {
        setFeedRows([]);
        setFeedError(err.message || 'Failed to load feed health');
      });
  }, []);

  useEffect(() => {
    if (subModule === 'iplsrl-console' || subModule === 'rosters') return undefined;
    if (subModule === 'providers') {
      loadFeeds();
      const t = setInterval(loadFeeds, 20_000);
      return () => clearInterval(t);
    }
    loadCatalog();
    return undefined;
  }, [subModule, loadCatalog, loadFeeds]);

  if (subModule === 'iplsrl-console') {
    return <IPLSRLConsoleView />;
  }

  if (subModule === 'rosters') {
    return <AdminRostersView />;
  }

  if (subModule === 'providers') {
    return (
      <div>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 className="admin-page-header__title">Data feeds</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
              Live provider health from trading feed engine. Overall: <strong>{feedOverall || '—'}</strong>
            </p>
            {feedError && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{feedError}</p>}
          </div>
          <button type="button" className="admin-btn admin-btn--secondary admin-btn--sm" onClick={loadFeeds}>
            ↻ Refresh
          </button>
        </div>
        <AdminDataTable
          title="Provider feed health"
          emptyMessage="No provider telemetry"
          data={feedRows}
          columns={[
            { header: 'Provider', key: 'name', render: (r) => <span style={{ fontWeight: 700 }}>{r.name}</span> },
            { header: 'ID', key: 'id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.id}</span> },
            {
              header: 'Latency',
              key: 'latencyMs',
              render: (r) => (
                <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>
                  {r.latencyMs != null ? `${r.latencyMs}ms` : '—'}
                </span>
              ),
            },
            {
              header: 'Last success',
              key: 'lastSuccessAt',
              render: (r) => (
                <span style={{ fontSize: '0.76rem' }}>
                  {r.lastSuccessAt ? new Date(r.lastSuccessAt).toLocaleString() : '—'}
                </span>
              ),
            },
            {
              header: 'Status',
              key: 'status',
              render: (r) => <StatusBadge status={r.status} />,
            },
            {
              header: 'Error',
              key: 'lastError',
              render: (r) => (
                <span style={{ fontSize: '0.74rem', color: r.lastError ? '#f87171' : 'var(--admin-text-dim)' }}>
                  {r.lastError || '—'}
                </span>
              ),
            },
          ]}
        />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 className="admin-page-header__title">Catalog</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
            Live catalog derived from aggregator matches ({totalMatches} total). Use Sports → OddsYra SRL Console for match control.
          </p>
          {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
        </div>
      </div>

      <AdminDataTable
        title="Sports Catalog"
        data={sports}
        columns={[
          { header: 'Sport ID', key: 'id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.id}</span> },
          { header: 'Sport Name', key: 'name', render: (r) => <span style={{ fontWeight: 700 }}>{r.name}</span> },
          { header: 'Competitions', key: 'competitions' },
          { header: 'Matches', key: 'activeMatches' },
          { header: 'Live', key: 'liveMatches', render: (r) => (
            <span style={{ fontWeight: 700, color: Number(r.liveMatches) > 0 ? '#10b981' : 'var(--admin-text-dim)' }}>
              {r.liveMatches}
            </span>
          )},
          { header: 'Providers', key: 'provider' },
          { header: 'Latency', key: 'latency', render: (r) => (
            <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.latency}</span>
          )},
          {
            header: 'Status',
            key: 'status',
            render: (r) => <StatusBadge status={r.status} />,
          },
        ]}
      />
    </div>
  );
}
