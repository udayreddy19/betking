import React from 'react';
import AdminCard from '../../components/AdminCard';
import ApiTestButton from './ApiTestButton';
import ApiResponseViewer from './ApiResponseViewer';
import ApiStatusBadge from './ApiStatusBadge';
import { formatIstDateTime } from '../../../../utils/istTime';

export default function OddsEnginePanel({
  api,
  result,
  testing,
  onTest,
  title = 'OddsEngineV3',
  subtitle = 'Sandbox canonical match state — never touches live odds, wallets, or settlement',
  testLabel,
  defaultEngine = 'OddsEngineV3',
  defaultVersion = '3.0.0',
  accent = 'var(--admin-accent-violet)',
}) {
  const summary = result?.summary || {};
  const label = testLabel || `Test ${title}`;
  return (
    <section className="api-explorer__odds" aria-label={`${title} sandbox`}>
      <AdminCard
        accent={accent}
        title={title}
        subtitle={subtitle}
        actions={(
          <ApiTestButton
            label={label}
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
            <strong>{summary.engineName || summary.engine || defaultEngine}</strong>
          </div>
          <div>
            <span>Version</span>
            <strong>{summary.engineVersion || defaultVersion}</strong>
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
