import { query, checkPgHealth } from '../../../db/pg.js';
import { normalizeTestResult, failResult, mapThrownError } from '../result.mjs';
import { ERROR_CODES } from '../errorCodes.mjs';
import { timed, withTimeout } from '../timeout.mjs';
import { sanitizeErrorMessage } from '../sanitize.mjs';

export async function testPostgres() {
  const started = Date.now();
  try {
    const { value, responseTimeMs, error } = await timed(() => withTimeout((async () => {
      const health = await checkPgHealth();
      let version = null;
      if (health?.connected) {
        try {
          const ver = await query('SELECT version() AS version');
          const raw = String(ver.rows?.[0]?.version || '');
          version = raw.split(',').shift()?.trim() || null;
        } catch {
          version = null;
        }
      }
      return { health, version };
    })(), 8000));

    if (error) return mapThrownError(error, responseTimeMs);

    const connected = Boolean(value?.health?.connected);
    if (!connected) {
      return failResult({
        code: ERROR_CODES.PROVIDER_UNAVAILABLE,
        message: sanitizeErrorMessage(value?.health?.error || 'PostgreSQL is not connected'),
        responseTimeMs,
        extra: { healthStatus: 'FAILED' },
      });
    }

    const mock = /mock/i.test(String(value?.health?.error || ''));
    return normalizeTestResult({
      success: true,
      statusCode: 200,
      responseTimeMs,
      implementation: mock ? 'MOCK' : 'REAL',
      mock,
      summary: {
        connected: true,
        latencyMs: responseTimeMs,
        version: value.version,
        replicaConfigured: Boolean(value?.health?.replicaConfigured),
        replicaConnected: value?.health?.replicaConnected ?? null,
      },
      data: {
        connected: true,
        latencyMs: responseTimeMs,
        version: value.version,
      },
    });
  } catch (err) {
    return mapThrownError(err, Date.now() - started);
  }
}
