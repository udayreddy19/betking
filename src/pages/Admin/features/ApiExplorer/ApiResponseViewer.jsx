import React, { useState } from 'react';
import AdminTabs from '../../components/AdminTabs';
import ApiJsonViewer from './ApiJsonViewer';
import ApiStatusBadge from './ApiStatusBadge';
import { formatIst, formatIstDateTime } from '../../../../utils/istTime';

function SportsFormatted({ summary }) {
  const matches = summary?.matches || [];
  if (!matches.length) {
    return <p className="api-explorer__muted">No sample matches in this response.</p>;
  }
  return (
    <div className="api-explorer__match-list">
      {matches.map((m) => (
        <article key={m.id || `${m.teams?.join('-')}`} className="api-explorer__match">
          <header>
            <strong>{(m.teams || []).join(' vs ') || m.id || 'Match'}</strong>
            <span>{m.league || '—'}</span>
          </header>
          <p>
            Status: {m.status || '—'}
            {m.startTime ? ` · ${m.startTime}` : ''}
          </p>
          {m.score && (
            <p className="api-explorer__muted">
              Score: {m.score.team1 ?? '—'} – {m.score.team2 ?? '—'}
              {m.score.overs != null ? ` (${m.score.overs})` : ''}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}

function OddsFormatted({ summary }) {
  const markets = summary?.markets || [];
  return (
    <div>
      <p>
        {summary?.engine} {summary?.engineVersion} · {summary?.marketCount ?? 0} markets ·{' '}
        {summary?.activeSelectionCount ?? 0} selections
      </p>
      {summary?.pipeline && (
        <ol className="api-explorer__pipeline">
          {summary.pipeline.map((step) => (
            <li key={step.step}>
              {step.step}
              {step.count != null ? ` (${step.count})` : ''} — {step.status}
            </li>
          ))}
        </ol>
      )}
      {markets.slice(0, 12).map((m) => (
        <article key={m.marketId} className="api-explorer__match">
          <header>
            <strong>{m.marketType || m.marketId}</strong>
            <span>{m.status}</span>
          </header>
          <ul>
            {(m.selections || []).map((s) => (
              <li key={s.name}>{s.name}: {s.odds}</li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

export default function ApiResponseViewer({ result, api }) {
  const [tab, setTab] = useState('formatted');
  if (!result) return null;
  const category = api?.category;
  const summary = result.summary || result.data || {};

  return (
    <div className="api-explorer__response">
      <div className="api-explorer__response-meta">
        <ApiStatusBadge status={result.healthStatus} />
        <span>HTTP {result.statusCode ?? '—'}</span>
        <span>{result.responseTimeMs != null ? `${result.responseTimeMs}ms` : '—'}</span>
        <span>{result.fetchedAt ? formatIstDateTime(result.fetchedAt) : ''}</span>
        {result.mock && <span className="api-explorer__mock">MOCK</span>}
      </div>
      {result.error && (
        <p className="api-explorer__error">
          {result.error.code}: {result.error.message}
        </p>
      )}
      <AdminTabs
        tabs={[
          { id: 'formatted', label: 'Formatted' },
          { id: 'json', label: 'JSON' },
          { id: 'summary', label: 'Raw Summary' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'formatted' && (
        <div className="api-explorer__formatted">
          {category === 'SPORTS_DATA' && <SportsFormatted summary={summary} />}
          {category === 'ODDS' && <OddsFormatted summary={summary} />}
          {category !== 'SPORTS_DATA' && category !== 'ODDS' && (
            <ApiJsonViewer value={summary} />
          )}
        </div>
      )}
      {tab === 'json' && <ApiJsonViewer value={result.data ?? result.summary} />}
      {tab === 'summary' && <ApiJsonViewer value={result.summary} />}
    </div>
  );
}
