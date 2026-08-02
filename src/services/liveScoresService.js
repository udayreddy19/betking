/**
 * Live Scores Service — single unified API call.
 *
 * All scraping, merging, and deduplication is handled server-side by
 * the /api/live-scores endpoint. The frontend just consumes the result.
 */

import { normalizeTeamName } from '../utils/teamNames';

// Re-export for any components that still import from here
export { normalizeTeamName };

/**
 * Fetch live scores from the unified BetKing API.
 * @param {{ force?: boolean }} [options] - Pass force:true only for manual retry.
 * Returns: { matches, series, counts, sources, fetchedAt, cached }
 */
export async function fetchLiveScores(options = {}) {
  const url = options.force ? '/api/live-scores?refresh=1' : '/api/live-scores';
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Live scores API failed (${response.status})`);
  }
  return response.json();
}
