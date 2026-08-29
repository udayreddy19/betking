import { fetchCrexCricketMatches } from '../../crexCricketProvider.mjs';
import { normalizeTestResult, mapThrownError } from '../result.mjs';
import { timed, withTimeout } from '../timeout.mjs';
import { summarizeSportsMatches } from '../summarize.mjs';

export async function testCrex() {
  const started = Date.now();
  try {
    const { value, responseTimeMs, error } = await timed(() => withTimeout(fetchCrexCricketMatches('live'), 10000));
    if (error) return mapThrownError(error, responseTimeMs);
    const summary = summarizeSportsMatches(value, 'crex');
    return normalizeTestResult({
      success: true,
      statusCode: 200,
      responseTimeMs,
      summary,
      data: summary,
    });
  } catch (err) {
    return mapThrownError(err, Date.now() - started);
  }
}
