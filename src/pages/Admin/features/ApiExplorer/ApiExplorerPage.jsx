import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApiClient } from '../../api/adminApiClient';
import { useAdminToast } from '../../components/AdminToastContext';
import AdminPageHeader from '../../components/AdminPageHeader';
import AdminEmptyState from '../../components/AdminEmptyState';
import { SkeletonCard } from '../../components/AdminSkeleton';
import AdminModal from '../../components/AdminModal';
import ApiSummaryCards from './ApiSummaryCards';
import ApiCategoryTabs from './ApiCategoryTabs';
import ApiSearch from './ApiSearch';
import ApiCard from './ApiCard';
import ApiDetailsDrawer from './ApiDetailsDrawer';
import ApiResponseViewer from './ApiResponseViewer';
import ApiTestButton from './ApiTestButton';
import OddsEnginePanel from './OddsEnginePanel';

export default function ApiExplorerPage({ subModule = 'overview' }) {
  const { showToast } = useAdminToast();
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(subModule === 'odds-engine' ? 'ODDS' : 'ALL');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [testingId, setTestingId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [results, setResults] = useState({});
  const [drawerApi, setDrawerApi] = useState(null);
  const [responseApi, setResponseApi] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    adminApiClient.get('/api-explorer/apis')
      .then((data) => {
        setPayload(data);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load API registry');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (subModule === 'odds-engine') setCategory('ODDS');
  }, [subModule]);

  const apis = payload?.apis || [];
  const counts = useMemo(() => {
    const next = { ALL: apis.length };
    for (const a of apis) {
      next[a.category] = (next[a.category] || 0) + 1;
    }
    return next;
  }, [apis]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apis.filter((a) => {
      if (category !== 'ALL' && a.category !== category) return false;
      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
      if (typeFilter !== 'ALL' && a.type !== typeFilter) return false;
      if (!q) return true;
      const hay = [a.name, a.provider, a.endpoint, a.baseUrl, a.description, a.id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [apis, category, query, statusFilter, typeFilter]);

  const runTest = async (api) => {
    setTestingId(api.id);
    try {
      const body = await adminApiClient.post(`/api-explorer/apis/${encodeURIComponent(api.id)}/test`);
      setResults((prev) => ({ ...prev, [api.id]: body }));
      setResponseApi(api);
      load();
      if (!body.success) {
        showToast(body.error?.message || 'Test failed', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Test failed', 'error');
      if (err.code === 'RATE_LIMITED' || err.status === 429) {
        showToast('Rate limited — wait before testing again', 'error');
      }
    } finally {
      setTestingId(null);
    }
  };

  const refreshSafe = async () => {
    setRefreshing(true);
    try {
      const data = await adminApiClient.post('/api-explorer/refresh-safe');
      showToast(`Refreshed ${data.refreshed} safe APIs`, 'success');
      load();
    } catch (err) {
      showToast(err.message || 'Refresh failed', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const oddsApi = apis.find((a) => a.id === 'odds-engine-v3');

  return (
    <div className="api-explorer">
      <AdminPageHeader
        title="API Explorer"
        subtitle="Monitor, test and inspect all project APIs and external integrations."
        breadcrumbs={['Admin', 'API Explorer']}
        actions={(
          <ApiTestButton
            label={refreshing ? 'Refreshing…' : 'Refresh safe APIs'}
            testing={refreshing}
            onClick={refreshSafe}
            variant="primary"
          />
        )}
      />

      {loading && !payload && (
        <div className="admin-kpi-grid">
          <SkeletonCard height={88} />
          <SkeletonCard height={88} />
          <SkeletonCard height={88} />
          <SkeletonCard height={88} />
        </div>
      )}

      {error && (
        <AdminEmptyState
          icon="⚠️"
          title="Could not load API Explorer"
          description={error}
          actionLabel="Retry"
          onAction={load}
        />
      )}

      {payload && (
        <>
          <ApiSummaryCards
            summary={payload.summary}
            onFilter={(status) => {
              setStatusFilter(status === 'ALL' ? 'ALL' : status);
              setCategory('ALL');
            }}
          />

          {(subModule === 'odds-engine' || category === 'ODDS' || subModule === 'overview') && oddsApi && (
            <OddsEnginePanel
              api={oddsApi}
              result={results['odds-engine-v3']}
              testing={testingId === 'odds-engine-v3'}
              onTest={() => runTest(oddsApi)}
            />
          )}

          <ApiCategoryTabs
            categories={payload.categories || []}
            counts={counts}
            active={category}
            onChange={setCategory}
          />
          <ApiSearch
            query={query}
            onQuery={setQuery}
            statusFilter={statusFilter}
            onStatus={setStatusFilter}
            typeFilter={typeFilter}
            onType={setTypeFilter}
          />

          {filtered.length === 0 ? (
            <AdminEmptyState
              icon="🔌"
              title="No APIs match these filters"
              description="Try another category or clear the search."
            />
          ) : (
            <div className="api-explorer__grid">
              {filtered.map((api) => (
                <ApiCard
                  key={api.id}
                  api={api}
                  testing={testingId === api.id}
                  onFetch={runTest}
                  onDetails={setDrawerApi}
                  onConnection={runTest}
                />
              ))}
            </div>
          )}
        </>
      )}

      <ApiDetailsDrawer
        api={drawerApi}
        result={drawerApi ? results[drawerApi.id] : null}
        isOpen={Boolean(drawerApi)}
        onClose={() => setDrawerApi(null)}
      />

      <AdminModal
        isOpen={Boolean(responseApi && results[responseApi.id])}
        onClose={() => setResponseApi(null)}
        title={responseApi ? `${responseApi.name} response` : 'Response'}
        description={responseApi ? 'Sanitized payload — secrets are never included.' : ''}
        maxWidth={720}
      >
        {responseApi && (
          <ApiResponseViewer result={results[responseApi.id]} api={responseApi} />
        )}
      </AdminModal>
    </div>
  );
}
