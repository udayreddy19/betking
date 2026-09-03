import React from 'react';
import AdminCard from '../../components/AdminCard';
import ApiTestButton from './ApiTestButton';
import ApiResponseViewer from './ApiResponseViewer';
import ApiStatusBadge from './ApiStatusBadge';
import { formatIst, formatIstDateTime } from '../../../../utils/istTime';

export default function OddsEnginePanel({ api, result, testing, onTest }) {
  const summary = result?.summary || {};
  return (
    <section className="api-explorer__odds" aria-label="OddsEngineV3 sandbox">
      <AdminCard
        accent="var(--admin-accent-violet)"
        title="OddsEngineV3"
        subtitle="Sandbox canonical match state — never touches live odds, wallets, or settlement"
        actions={(
          <ApiTestButton
            label="Test OddsEngineV3"
            testing={testing}
            onClick={onTest}
          />
        )}
      >
        <div className="api-explorer__odds-stats">
          <div>
            <span>Status</span>
            <strong><ApiStatusBadge status={api?.status || summary.status} /></strong>
          </div>
          <div>
            <span>Engine</span>
            <strong>{summary.engineName || summary.engine || 'OddsEngineV3'}</strong>
          </div>
          <div>
            <span>Version</span>
            <strong>{summary.engineVersion || '3.0.0'}</strong>
          </div>
          <div>
            <span>Markets</span>
            <strong>{summary.marketCount ?? '—'}</strong>
          </div>
          <div>
            <span>Active selections</span>
            <strong>{summary.activeSelectionCount ?? '—'}</strong>
          </div>
          <div>
            <span>State / odds version</span>
            <strong>{summary.stateVersion ?? '—'} / {summary.oddsVersion ?? '—'}</strong>
          </div>
          <div>
            <span>Generated</span>
            <strong>{summary.generatedAt ? formatIstDateTime(summary.generatedAt) : '—'}</strong>
          </div>
          <div>
            <span>Duration</span>
            <strong>{summary.generationDurationMs != null ? `${summary.generationDurationMs}ms` : '—'}</strong>
          </div>
        </div>
        {result && <ApiResponseViewer result={result} api={api} />}
      </AdminCard>
    </section>
  );
}
