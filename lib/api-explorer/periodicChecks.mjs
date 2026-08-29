import { listPeriodicIds } from './registry.mjs';
import { runSafeApiTest } from './runTest.mjs';
import { recordHealthCheck } from './healthStore.mjs';
import { getApiById } from './registry.mjs';
import { logger } from '../logger.mjs';

/**
 * Cheap local checks only (Postgres + Redis). Sports feeds are already
 * polled by the aggregator; paid/external APIs are never included here
 * unless API_EXPLORER_PERIODIC_FEEDS=1.
 */
export async function runPeriodicSafeChecks() {
  const extraFeeds = process.env.API_EXPLORER_PERIODIC_FEEDS === '1';
  const ids = listPeriodicIds();
  if (extraFeeds) {
    ids.push('cricbuzz', 'espn');
  }
  for (const apiId of ids) {
    const entry = getApiById(apiId);
    if (!entry) continue;
    try {
      const result = await runSafeApiTest(apiId);
      await recordHealthCheck({
        apiId,
        provider: entry.provider,
        category: entry.category,
        success: result.success,
        statusCode: result.statusCode,
        responseTimeMs: result.responseTimeMs,
        errorCode: result.error?.code || null,
        errorMessage: result.error?.message || null,
      });
    } catch (err) {
      logger.warn('api_explorer_periodic_failed', { apiId, error: err.message });
    }
  }
}
