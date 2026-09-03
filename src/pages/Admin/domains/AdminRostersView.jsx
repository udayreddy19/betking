/**
 * Admin Sports → Squads: live playing XIs from aggregator matches.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { StatusBadge } from '../components/AdminBadge';

export default function AdminRostersView() {
  const [matches, setMatches] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminApiClient.get('/sports/rosters')
      .then((data) => {
        if (cancelled) return;
        setMatches(data.matches || []);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setMatches([]);
        setError(err.message || 'Failed to load squads');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (matches || []).filter((r) => {
      if (!q) return true;
      return String(r.match || '').toLowerCase().includes(q)
        || String(r.league || '').toLowerCase().includes(q)
        || String(r.id || '').toLowerCase().includes(q);
    });
  }, [matches, query]);

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="admin-page-header__title">Squads</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
            Playing XI counts from live feeds (same source as Verify → Lineups).
          </p>
          {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
        </div>
        <input
          type="search"
          placeholder="Search match or league…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            minWidth: 220,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--admin-border, #334155)',
            background: 'var(--admin-surface, #0f172a)',
            color: 'inherit',
          }}
        />
      </div>

      <AdminDataTable
        title={loading ? 'Loading squads…' : `Match squads (${rows.length})`}
        data={rows}
        columns={[
          { header: 'Match', key: 'match', render: (r) => <span style={{ fontWeight: 700 }}>{r.match}</span> },
          { header: 'League', key: 'league' },
          {
            header: 'Team 1 XI',
            key: 'squad1',
            render: (r) => (
              <span className="admin-text-mono">
                {r.squad1 > 0 ? r.squad1 : '—'}
              </span>
            ),
          },
          {
            header: 'Team 2 XI',
            key: 'squad2',
            render: (r) => (
              <span className="admin-text-mono">
                {r.squad2 > 0 ? r.squad2 : '—'}
              </span>
            ),
          },
          {
            header: 'Feed',
            key: 'hasSquads',
            render: (r) => (
              <span style={{ fontSize: '0.76rem', color: 'var(--admin-text-muted)' }}>
                {r.hasSquads ? 'squads' : r.hasScorecard ? 'scorecard' : 'pending'}
              </span>
            ),
          },
          {
            header: 'Source',
            key: 'source',
            render: (r) => (
              <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.source}</span>
            ),
          },
          {
            header: 'Status',
            key: 'status',
            render: (r) => <StatusBadge status={r.status} />,
          },
        ]}
        emptyMessage={loading ? 'Loading…' : 'No live fixtures with squad data yet.'}
      />
    </div>
  );
}
