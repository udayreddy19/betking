import { getSystemHealthStatus, getLivenessStatus, getReadinessStatus, getPublicReadinessStatus } from '../../devopsEngine.mjs';
import { getAggregatedLiveScores } from '../../aggregator.mjs';
import { normalizeTestResult, mapThrownError } from '../result.mjs';
import { timed, withTimeout } from '../timeout.mjs';
import { summarizeSportsMatches } from '../summarize.mjs';

export async function testInternalHealth() {
  const started = Date.now();
  try {
    const { value, responseTimeMs, error } = await timed(() => withTimeout(getSystemHealthStatus(), 8000));
    if (error) return mapThrownError(error, responseTimeMs);
    const down = value?.status === 'DOWN';
    return normalizeTestResult({
      success: !down,
      statusCode: down ? 503 : 200,
      responseTimeMs,
      summary: {
        overall: value?.status || 'HEALTHY',
        postgres: value?.checks?.postgres?.status || null,
        redis: value?.checks?.redis?.status || null,
      },
      data: {
        overall: value?.status,
        postgres: {
          status: value?.checks?.postgres?.status,
          latencyMs: value?.checks?.postgres?.latencyMs,
        },
        redis: {
          status: value?.checks?.redis?.status,
          latencyMs: value?.checks?.redis?.latencyMs,
        },
      },
    });
  } catch (err) {
    return mapThrownError(err, Date.now() - started);
  }
}

export async function testInternalLiveness() {
  const started = Date.now();
  const live = getLivenessStatus();
  return normalizeTestResult({
    success: live?.alive !== false,
    statusCode: 200,
    responseTimeMs: Date.now() - started,
    summary: { alive: live?.alive !== false },
    data: { alive: live?.alive !== false, timestamp: live?.timestamp || new Date().toISOString() },
  });
}

export async function testInternalReadiness() {
  const started = Date.now();
  try {
    const { value, responseTimeMs, error } = await timed(() => withTimeout(getReadinessStatus(), 8000));
    if (error) return mapThrownError(error, responseTimeMs);
    const publicBody = getPublicReadinessStatus(value);
    return normalizeTestResult({
      success: Boolean(publicBody?.ready),
      statusCode: publicBody?.ready ? 200 : 503,
      responseTimeMs,
      summary: { ready: Boolean(publicBody?.ready), status: publicBody?.status || value?.status },
      data: { ready: Boolean(publicBody?.ready), status: publicBody?.status || null },
    });
  } catch (err) {
    return mapThrownError(err, Date.now() - started);
  }
}

export async function testLiveScoresCache() {
  const started = Date.now();
  try {
    const { value, responseTimeMs, error } = await timed(() => withTimeout(
      getAggregatedLiveScores({ force: false }),
      8000,
    ));
    if (error) return mapThrownError(error, responseTimeMs);
    const matches = value?.matches || value?.live || value;
    const summary = summarizeSportsMatches(matches, 'aggregator-cache');
    return normalizeTestResult({
      success: true,
      statusCode: 200,
      responseTimeMs,
      summary: {
        ...summary,
        cached: Boolean(value?.cached),
        stale: Boolean(value?.stale),
        note: 'Reads aggregator cache only. Does not force a provider refresh.',
      },
      data: summary,
    });
  } catch (err) {
    return mapThrownError(err, Date.now() - started);
  }
}

export async function testAuthRequiredEndpoint(label = 'Protected endpoint') {
  return normalizeTestResult({
    success: true,
    statusCode: 401,
    responseTimeMs: 0,
    healthStatus: 'HEALTHY',
    summary: {
      authenticationRequired: true,
      executable: false,
      note: `${label} requires a user session. API Explorer will not execute it or display tokens.`,
    },
    data: {
      authenticationRequired: true,
    },
  });
}
