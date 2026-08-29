import { fetch10CricLiveScores } from '../../providers/tencricProvider.mjs';
import { normalizeTestResult, mapThrownError } from '../result.mjs';
import { timed, withTimeout } from '../timeout.mjs';
import { summarizeSportsMatches } from '../summarize.mjs';

export async function testTenCric() {
  const started = Date.now();
  try {
    const { value, responseTimeMs, error } = await timed(() => withTimeout(fetch10CricLiveScores(), 10000));
    if (error) return mapThrownError(error, responseTimeMs);
    const summary = summarizeSportsMatches(value, '10cric2026');
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
