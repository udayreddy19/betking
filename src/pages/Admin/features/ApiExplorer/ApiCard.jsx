import React from 'react';
import AdminCard from '../../components/AdminCard';
import ApiStatusBadge from './ApiStatusBadge';
import ApiConfigurationBadge from './ApiConfigurationBadge';
import ApiTestButton from './ApiTestButton';

function relativeTime(iso) {
  if (!iso) return 'Never';
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const s = Math.round(ms / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s} seconds ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return new Date(iso).toLocaleString();
}

export default function ApiCard({
  api,
  testing,
  onFetch,
  onDetails,
  onConnection,
}) {
  const accent = api.status === 'HEALTHY'
    ? 'var(--admin-success)'
    : api.status === 'FAILED'
      ? 'var(--admin-danger)'
      : api.status === 'SLOW'
        ? 'var(--admin-warning)'
        : 'var(--admin-border)';

  return (
    <AdminCard
      accent={accent}
      title={api.name}
          subtitle={`${api.category.replace(/_/g, ' ')} · ${api.provider}`}
      actions={<ApiStatusBadge status={testing ? 'TESTING' : api.status} />}
    >
      <dl className="api-explorer__meta">
        <div>
          <dt>API Key / Config</dt>
          <dd><ApiConfigurationBadge configuration={api.configuration} /></dd>
        </div>
        <div>
          <dt>Last checked</dt>
          <dd>{relativeTime(api.lastChecked)}</dd>
        </div>
        <div>
          <dt>Response</dt>
          <dd>{api.responseTimeMs != null ? `${api.responseTimeMs}ms` : '—'}</dd>
        </div>
        <div>
          <dt>Endpoint</dt>
          <dd className="api-explorer__endpoint">{api.method} {api.endpoint || api.baseUrl || '—'}</dd>
        </div>
      </dl>
      {api.mock && <p className="api-explorer__mock">Mock / sample implementation — not a live vendor API</p>}
      {api.unused && <p className="api-explorer__muted">Registered but unused by the live aggregator.</p>}
      {api.providerHealth && (
        <p className="api-explorer__muted">
          Priority {api.providerHealth.priority} · errors {api.providerHealth.consecutiveErrors} ·{' '}
          {api.providerHealth.providerHealthStatus}
        </p>
      )}
      <div className="api-explorer__actions">
        <ApiTestButton
          label="Fetch Data"
          testing={testing}
          disabled={!api.testable}
          onClick={() => onFetch(api)}
        />
        <ApiTestButton label="View Details" variant="ghost" onClick={() => onDetails(api)} />
        <ApiTestButton
          label="Test Connection"
          variant="ghost"
          testing={testing}
          disabled={!api.testable}
          onClick={() => onConnection(api)}
        />
      </div>
    </AdminCard>
  );
}
