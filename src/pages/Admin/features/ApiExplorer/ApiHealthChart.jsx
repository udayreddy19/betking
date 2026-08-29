import React from 'react';

export default function ApiHealthChart({ points = [] }) {
  if (!points.length) {
    return <p className="api-explorer__muted">No health samples in the last 24 hours.</p>;
  }
  const max = Math.max(1, ...points.map((p) => Number(p.responseTimeMs) || 0));
  return (
    <div className="api-explorer__chart" role="img" aria-label="24 hour response times">
      {points.map((p, i) => {
        const h = Math.max(4, Math.round(((Number(p.responseTimeMs) || 0) / max) * 64));
        return (
          <span
            key={`${p.at}-${i}`}
            className={`api-explorer__bar${p.success ? '' : ' api-explorer__bar--fail'}`}
            style={{ height: h }}
            title={`${p.success ? 'OK' : 'Fail'} · ${p.responseTimeMs ?? '—'}ms · ${p.at}`}
          />
        );
      })}
    </div>
  );
}
