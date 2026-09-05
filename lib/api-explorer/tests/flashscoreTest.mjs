import { fetchFlashscoreLiveScores } from '../../providers/flashscoreProvider.mjs';
import { normalizeTestResult, mapThrownError } from '../result.mjs';
import { timed, withTimeout } from '../timeout.mjs';
import { summarizeSportsMatches } from '../summarize.mjs';

export async function testFlashscore() {
  const started = Date.now();
  try {
    const { value, responseTimeMs, error } = await timed(() => withTimeout(fetchFlashscoreLiveScores({ force: true }), 15000));
    if (error) return mapThrownError(error, responseTimeMs);
    const summary = summarizeSportsMatches(value, 'flashscore');
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
