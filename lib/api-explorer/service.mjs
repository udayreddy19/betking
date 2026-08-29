import { ProviderRegistry } from '../providers/ProviderRegistry.mjs';
import { getFeedHealthSnapshot } from '../feedHealthEngine.mjs';
import { API_CATEGORIES, listRegistry, getApiById, listSafeRefreshIds } from './registry.mjs';
import { buildConfigView, razorpayKeyMode, allEnvPresent } from './configStatus.mjs';
import { classifyLatency } from './result.mjs';
import { ERROR_CODES, SLOW_MS_DEFAULT } from './errorCodes.mjs';
import { getLatestByApiIds, getApiHistory, getHistorySummary, recordHealthCheck } from './healthStore.mjs';
import { runSafeApiTest } from './runTest.mjs';
import { logger } from '../logger.mjs';

function overlayProvider(entry) {
  if (entry.category !== 'SPORTS_DATA') return null;
  const idMap = { tencric: '10cric2026' };
  const registryId = idMap[entry.id] || entry.id;
  const providers = ProviderRegistry.getAllProviders();
  const p = providers.find((x) => x.id === registryId);
  if (!p) return null;
  return {
    priority: p.priority,
    enabled: p.enabled,
    consecutiveErrors: p.consecutiveErrors || 0,
    providerHealthStatus: p.healthStatus,
    lastSuccessAt: p.lastSuccessTimestamp ? new Date(p.lastSuccessTimestamp).toISOString() : null,
  };
}

function configFor(entry) {
  const fields = entry.configFields || [];
  if (entry.handler === 'kyc-vendor' || (entry.handler === 'not-configured' && !fields.length && !entry.requiresConfig?.length)) {
    return { status: 'MISSING', mode: null, fields: [{ label: 'Vendor SDK', status: 'MISSING' }] };
  }
  if (entry.id === 'razorpay') {
    const keyMode = razorpayKeyMode();
    return buildConfigView(fields, { mode: keyMode === 'TEST' ? 'TEST' : keyMode });
  }
  if (fields.length) {
    const mode = entry.id === 'jwt' && !allEnvPresent(['JWT_SECRET']) && process.env.NODE_ENV !== 'production'
      ? 'DEVELOPMENT'
      : null;
    return buildConfigView(fields, { mode });
  }
  if (entry.requiresConfig?.length) {
    return buildConfigView(entry.requiresConfig.map((env) => ({ label: env, env })));
  }
  if (entry.mock) {
    return { status: 'CONFIGURED', mode: null, fields: [{ label: 'Implementation', status: 'CONFIGURED' }] };
  }
  return { status: 'CONFIGURED', mode: null, fields: [] };
}

function deriveStatus(entry, latest, config) {
  if (entry.unused || entry.fetchMode === 'NOT_TESTABLE' && (entry.id === 'sportradar' || entry.mock && entry.unused)) {
    if (config.status === 'MISSING' || entry.unused) return 'NOT_CONFIGURED';
  }
  if (config.status === 'MISSING' && (entry.requiresConfig?.length || entry.configFields?.length)) {
    return 'NOT_CONFIGURED';
  }
  if (!latest) return config.status === 'MISSING' ? 'NOT_CONFIGURED' : 'UNKNOWN';
  if (!latest.success) {
    return latest.error_code === ERROR_CODES.NOT_CONFIGURED ? 'NOT_CONFIGURED' : 'FAILED';
  }
  return classifyLatency(latest.response_time_ms) || 'HEALTHY';
}

export async function listExplorerApis() {
  const registry = listRegistry();
  const latestMap = await getLatestByApiIds(registry.map((a) => a.id));
  let feed = null;
  try {
    feed = getFeedHealthSnapshot();
  } catch {
    feed = null;
  }

  const apis = registry.map((entry) => {
    const config = configFor(entry);
    const latest = latestMap[entry.id] || null;
    const provider = overlayProvider(entry);
    const status = deriveStatus(entry, latest, config);
    return {
      id: entry.id,
      name: entry.name,
      category: entry.category,
      provider: entry.provider,
      type: entry.type,
      description: entry.description,
      baseUrl: entry.baseUrl,
      method: entry.method,
      endpoint: entry.endpoint,
      testable: entry.testable,
      fetchMode: entry.fetchMode,
      mock: Boolean(entry.mock),
      unused: Boolean(entry.unused),
      legacy: Boolean(entry.legacy),
      includeInRefreshAll: Boolean(entry.includeInRefreshAll),
      timeout: entry.timeout,
      configuration: config,
      status,
      lastChecked: latest?.checked_at || provider?.lastSuccessAt || null,
      responseTimeMs: latest?.response_time_ms ?? null,
      lastError: latest && !latest.success
        ? { code: latest.error_code, message: latest.error_message }
        : null,
      providerHealth: provider,
    };
  });

  const counts = {
    total: apis.length,
    healthy: apis.filter((a) => a.status === 'HEALTHY').length,
    slow: apis.filter((a) => a.status === 'SLOW').length,
    failed: apis.filter((a) => a.status === 'FAILED').length,
    notConfigured: apis.filter((a) => a.status === 'NOT_CONFIGURED').length,
  };
  const timed = apis.filter((a) => a.responseTimeMs != null);
  const averageResponseTimeMs = timed.length
    ? Math.round(timed.reduce((s, a) => s + a.responseTimeMs, 0) / timed.length)
    : null;

  return {
    categories: API_CATEGORIES,
    slowThresholdMs: SLOW_MS_DEFAULT,
    feedHealth: feed
      ? {
        status: feed.status,
        activeProvider: feed.activeProvider,
        providers: feed.providers,
      }
      : null,
    summary: { ...counts, averageResponseTimeMs },
    apis,
  };
}

export async function testExplorerApi(apiId, { adminId } = {}) {
  const entry = getApiById(apiId);
  if (!entry) {
    return { httpStatus: 404, body: failLike(ERROR_CODES.UNKNOWN_API, 'Unknown API id') };
  }
  const result = await runSafeApiTest(apiId);
  try {
    await recordHealthCheck({
      apiId: entry.id,
      provider: entry.provider,
      category: entry.category,
      success: result.success,
      statusCode: result.statusCode,
      responseTimeMs: result.responseTimeMs,
      errorCode: result.error?.code || null,
      errorMessage: result.error?.message || null,
    });
  } catch (err) {
    logger.warn('api_explorer_health_persist_failed', { apiId, error: err.message });
  }
  logger.info('api_explorer_test', {
    adminId: adminId || null,
    apiId: entry.id,
    success: result.success,
    responseTimeMs: result.responseTimeMs,
    statusCode: result.statusCode,
  });
  return { httpStatus: 200, body: result };
}

function failLike(code, message) {
  return {
    success: false,
    statusCode: null,
    responseTimeMs: 0,
    fetchedAt: new Date().toISOString(),
    data: null,
    summary: null,
    error: { code, message },
  };
}

export async function refreshSafeApis({ adminId } = {}) {
  const ids = listSafeRefreshIds();
  const results = [];
  for (const id of ids) {
    const { body } = await testExplorerApi(id, { adminId });
    results.push({
      apiId: id,
      success: body.success,
      healthStatus: body.healthStatus,
      responseTimeMs: body.responseTimeMs,
      error: body.error,
    });
  }
  return {
    refreshed: results.length,
    results,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getExplorerHistory(apiId) {
  if (!getApiById(apiId)) return null;
  const [rows, summary] = await Promise.all([
    getApiHistory(apiId, { limit: 80, hours: 24 }),
    getHistorySummary(apiId, 24),
  ]);
  return { apiId, hours: 24, summary, history: rows };
}

