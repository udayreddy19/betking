/**
 * Persist API Explorer health checks. Falls back to in-memory storage
 * when the api_health_checks table is not yet migrated (tests / fresh DBs).
 */

const memoryRows = [];
const MAX_MEMORY = 500;

function rowFromInsert({
  apiId,
  provider,
  category,
  success,
  statusCode,
  responseTimeMs,
  errorCode,
  errorMessage,
}) {
  return {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    api_id: apiId,
    provider: provider || null,
    category: category || null,
    success: Boolean(success),
    status_code: statusCode == null ? null : Number(statusCode),
    response_time_ms: responseTimeMs == null ? null : Math.round(Number(responseTimeMs)),
    error_code: errorCode || null,
    error_message: errorMessage ? String(errorMessage).slice(0, 500) : null,
    checked_at: new Date().toISOString(),
  };
}

async function getQuery() {
  try {
    const mod = await import('../../db/pg.js');
    return mod.query;
  } catch {
    return null;
  }
}

export async function recordHealthCheck(entry) {
  const row = rowFromInsert(entry);
  const query = await getQuery();
  if (query) {
    try {
      const res = await query(
        `INSERT INTO api_health_checks
           (api_id, provider, category, success, status_code, response_time_ms, error_code, error_message, checked_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING id, api_id, provider, category, success, status_code, response_time_ms,
                   error_code, error_message, checked_at`,
        [
          row.api_id,
          row.provider,
          row.category,
          row.success,
          row.status_code,
          row.response_time_ms,
          row.error_code,
          row.error_message,
        ],
      );
      if (res?.rows?.[0]) {
        return { ...res.rows[0], checked_at: res.rows[0].checked_at?.toISOString?.() || row.checked_at };
      }
    } catch {
      // table missing or DB down — memory fallback
    }
  }
  memoryRows.unshift(row);
  if (memoryRows.length > MAX_MEMORY) memoryRows.length = MAX_MEMORY;
  return row;
}

export async function getApiHistory(apiId, { limit = 50, hours = 24 } = {}) {
  const query = await getQuery();
  if (query) {
    try {
      const res = await query(
        `SELECT id, api_id, provider, category, success, status_code, response_time_ms,
                error_code, error_message, checked_at
           FROM api_health_checks
          WHERE api_id = $1
            AND checked_at >= NOW() - ($2::int * INTERVAL '1 hour')
          ORDER BY checked_at DESC
          LIMIT $3`,
        [apiId, hours, Math.min(200, Math.max(1, limit))],
      );
      return (res.rows || []).map((r) => ({
        ...r,
        checked_at: r.checked_at instanceof Date ? r.checked_at.toISOString() : r.checked_at,
      }));
    } catch {
      // fall through
    }
  }
  const cutoff = Date.now() - hours * 3600 * 1000;
  return memoryRows
    .filter((r) => r.api_id === apiId && Date.parse(r.checked_at) >= cutoff)
    .slice(0, limit);
}

export async function getLatestByApiIds(apiIds) {
  const ids = Array.isArray(apiIds) ? apiIds : [];
  if (ids.length === 0) return {};
  const query = await getQuery();
  if (query) {
    try {
      const res = await query(
        `SELECT DISTINCT ON (api_id)
                api_id, success, status_code, response_time_ms, error_code, error_message, checked_at
           FROM api_health_checks
          WHERE api_id = ANY($1::text[])
          ORDER BY api_id, checked_at DESC`,
        [ids],
      );
      const map = {};
      for (const r of res.rows || []) {
        map[r.api_id] = {
          ...r,
          checked_at: r.checked_at instanceof Date ? r.checked_at.toISOString() : r.checked_at,
        };
      }
      return map;
    } catch {
      // fall through
    }
  }
  const map = {};
  for (const id of ids) {
    const row = memoryRows.find((r) => r.api_id === id);
    if (row) map[id] = row;
  }
  return map;
}

export async function getHistorySummary(apiId, hours = 24) {
  const rows = await getApiHistory(apiId, { limit: 200, hours });
  const times = rows.filter((r) => r.success && r.response_time_ms != null).map((r) => Number(r.response_time_ms));
  const failures = rows.filter((r) => !r.success).length;
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
  return {
    samples: rows.length,
    failureCount: failures,
    successCount: rows.length - failures,
    averageResponseTimeMs: avg,
    latest: rows[0] || null,
    points: rows.slice(0, 48).reverse().map((r) => ({
      at: r.checked_at,
      success: r.success,
      responseTimeMs: r.response_time_ms,
    })),
  };
}

export function _resetMemoryForTests() {
  memoryRows.length = 0;
}
