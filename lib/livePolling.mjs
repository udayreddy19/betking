/** Server-side live data refresh intervals. */
export const LIVE_SCORES_POLL_MS = Number(process.env.LIVE_SCORES_POLL_MS) || 2_000;
export const AGGREGATOR_CACHE_TTL_MS = Math.max(800, Number(process.env.AGGREGATOR_CACHE_TTL_MS) || 1_000);
