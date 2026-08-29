import { ERROR_CODES, SLOW_MS_DEFAULT } from './errorCodes.mjs';
import { sanitizeExplorerPayload, sanitizeErrorMessage } from './sanitize.mjs';

export function classifyLatency(responseTimeMs, slowMs = SLOW_MS_DEFAULT) {
  if (responseTimeMs == null || Number.isNaN(Number(responseTimeMs))) return null;
  return Number(responseTimeMs) >= slowMs ? 'SLOW' : 'HEALTHY';
}

export function normalizeTestResult({
  success,
  statusCode = null,
  responseTimeMs,
  fetchedAt,
  data = null,
  summary = null,
  error = null,
  healthStatus = null,
  mock = false,
  implementation = 'REAL',
} = {}) {
  const fetched = fetchedAt || new Date().toISOString();
  const ms = responseTimeMs == null ? null : Math.max(0, Math.round(Number(responseTimeMs)));

  let resolvedHealth = healthStatus;
  if (!resolvedHealth) {
    if (!success) resolvedHealth = error?.code === ERROR_CODES.NOT_CONFIGURED ? 'NOT_CONFIGURED' : 'FAILED';
    else resolvedHealth = classifyLatency(ms) || 'HEALTHY';
  }

  const safeError = error
    ? {
      code: error.code || ERROR_CODES.INTERNAL_ERROR,
      message: sanitizeErrorMessage(error.message || 'Request failed'),
    }
    : null;

  return {
    success: Boolean(success),
    statusCode: statusCode == null ? null : Number(statusCode),
    responseTimeMs: ms,
    fetchedAt: fetched,
    healthStatus: resolvedHealth,
    mock: Boolean(mock),
    implementation,
    data: success ? sanitizeExplorerPayload(data) : null,
    summary: sanitizeExplorerPayload(summary),
    error: safeError,
  };
}

export function failResult({ code, message, statusCode = null, responseTimeMs = 0, extra } = {}) {
  return normalizeTestResult({
    success: false,
    statusCode,
    responseTimeMs,
    data: extra?.data ?? null,
    summary: extra?.summary ?? null,
    mock: extra?.mock,
    implementation: extra?.implementation,
    healthStatus: extra?.healthStatus,
    error: { code: code || ERROR_CODES.INTERNAL_ERROR, message },
  });
}

export function mapThrownError(err, responseTimeMs) {
  const code = err?.code;
  if (code === ERROR_CODES.TIMEOUT || /timeout/i.test(err?.message || '')) {
    return failResult({
      code: ERROR_CODES.TIMEOUT,
      message: 'Provider did not respond',
      responseTimeMs,
    });
  }
  if (code === ERROR_CODES.NOT_CONFIGURED) {
    return failResult({
      code: ERROR_CODES.NOT_CONFIGURED,
      message: err.message || 'Integration is not configured',
      responseTimeMs,
      extra: { healthStatus: 'NOT_CONFIGURED' },
    });
  }
  if (err?.name === 'AbortError') {
    return failResult({
      code: ERROR_CODES.TIMEOUT,
      message: 'Provider did not respond',
      responseTimeMs,
    });
  }
  if (err?.name === 'FetchError' || /network|fetch failed|enotfound|econnrefused/i.test(err?.message || '')) {
    return failResult({
      code: ERROR_CODES.NETWORK_ERROR,
      message: 'Network error reaching provider',
      responseTimeMs,
    });
  }
  return failResult({
    code: ERROR_CODES.PROVIDER_UNAVAILABLE,
    message: err?.message || 'Provider request failed',
    responseTimeMs,
  });
}
