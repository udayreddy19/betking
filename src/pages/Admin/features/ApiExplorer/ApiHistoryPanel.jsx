import React from 'react';
import ApiHealthChart from './ApiHealthChart';
import ApiStatusBadge from './ApiStatusBadge';

export default function ApiHistoryPanel({ history, loading }) {
  if (loading) return <p className="api-explorer__muted">Loading history…</p>;
  if (!history) return <p className="api-explorer__muted">Select an API to load 24-hour history.</p>;
  const summary = history.summary || {};
  return (
    <div className="api-explorer__history">
      <div className="api-explorer__history-meta">
        <span>Samples: {summary.samples ?? 0}</span>
        <span>Failures: {summary.failureCount ?? 0}</span>
        <span>Avg: {summary.averageResponseTimeMs != null ? `${summary.averageResponseTimeMs}ms` : '—'}</span>
        {summary.latest && (
          <ApiStatusBadge status={summary.latest.success ? 'HEALTHY' : 'FAILED'} />
        )}
      </div>
      <ApiHealthChart points={summary.points || []} />
    </div>
  );
}
