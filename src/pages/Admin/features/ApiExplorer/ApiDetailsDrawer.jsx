import React, { useEffect, useState } from 'react';
import AdminDrawer from '../../components/AdminDrawer';
import { adminApiClient } from '../../api/adminApiClient';
import ApiResponseViewer from './ApiResponseViewer';
import ApiHistoryPanel from './ApiHistoryPanel';
import ApiConfigurationBadge from './ApiConfigurationBadge';
import ApiStatusBadge from './ApiStatusBadge';

export default function ApiDetailsDrawer({ api, result, isOpen, onClose }) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !api?.id) return undefined;
    let cancelled = false;
    setLoading(true);
    adminApiClient.get(`/api-explorer/apis/${encodeURIComponent(api.id)}/history`)
      .then((data) => {
        if (!cancelled) setHistory(data);
      })
      .catch(() => {
        if (!cancelled) setHistory(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isOpen, api?.id]);

  return (
    <AdminDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={api?.name || 'API details'}
      subtitle={api ? `${api.provider} · ${api.category}` : ''}
      width={560}
    >
      {api && (
        <>
          <div className="api-explorer__drawer-head">
            <ApiStatusBadge status={api.status} />
            <ApiConfigurationBadge configuration={api.configuration} />
          </div>
          <p>{api.description}</p>
          {api.configuration?.fields?.length > 0 && (
            <ul className="api-explorer__config-fields">
              {api.configuration.fields.map((f) => (
                <li key={f.label}>
                  {f.label}: {f.status === 'CONFIGURED' ? '•••••••• Configured' : 'Missing'}
                </li>
              ))}
            </ul>
          )}
          <h3 className="admin-section-title">Latest response</h3>
          <ApiResponseViewer result={result} api={api} />
          <h3 className="admin-section-title">24 hour history</h3>
          <ApiHistoryPanel history={history} loading={loading} />
        </>
      )}
    </AdminDrawer>
  );
}
