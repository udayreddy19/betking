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
 * Returns: { matches, series, counts, sources, fetchedAt, cached }
 */
export async function fetchLiveScores() {
  const response = await fetch('/api/live-scores');
  if (!response.ok) {
    throw new Error(`Live scores API failed (${response.status})`);
  }
  return response.json();
}
