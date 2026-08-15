import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import IPLSRLConsoleView from './IPLSRLConsoleView';

export default function SportsDomainView({ subModule = 'catalog' }) {
  const [sports, setSports] = useState([]);
  const [error, setError] = useState(null);
  const [totalMatches, setTotalMatches] = useState(0);

  useEffect(() => {
    if (subModule === 'iplsrl-console') return undefined;
    let cancelled = false;
    adminApiClient.get('/sports/catalog')
      .then((data) => {
        if (cancelled) return;
        setSports(data.sports || []);
        setTotalMatches(data.totalMatches || 0);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setSports([]);
        setError(err.message || 'Failed to load sports catalog');
      });
    return () => { cancelled = true; };
  }, [subModule]);

  if (subModule === 'iplsrl-console') {
    return <IPLSRLConsoleView />;
  }

  return (
    <div>
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>
            {subModule === 'providers'
              ? '03 · Data Feed Latency Monitors'
              : subModule === 'rosters'
                ? '03 · Team Rosters & Squads'
                : '03 · Sports Catalog & Data Provider Governance'}
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted, var(--color-text-muted))', fontSize: '0.85rem' }}>
            Live catalog derived from aggregator matches ({totalMatches} total). Use Sports → IPLSRL Console for SRL operator control.
          </p>
          {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.82rem' }}>{error}</p>}
        </div>
      </div>

      <AdminDataTable
        title={subModule === 'providers' ? 'Provider Feed Telemetry' : 'Sports Catalog & Provider Feed Telemetry'}
        data={sports}
        columns={[
          { header: 'Sport ID', key: 'id' },
          { header: 'Sport Name', key: 'name' },
          { header: 'Competitions', key: 'competitions' },
          { header: 'Matches', key: 'activeMatches' },
          { header: 'Live', key: 'liveMatches' },
          { header: 'Providers', key: 'provider' },
          { header: 'Latency', key: 'latency' },
          {
            header: 'Status',
            key: 'status',
            render: (r) => (
              <span style={{
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 700,
                background: r.status === 'LIVE' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                color: r.status === 'LIVE' ? '#f87171' : '#10b981',
              }}>
                {r.status}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
