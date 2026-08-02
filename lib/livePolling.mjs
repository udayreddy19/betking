/** Server-side live data refresh intervals. */
export const LIVE_SCORES_POLL_MS = Number(process.env.LIVE_SCORES_POLL_MS) || 5_000;
export const AGGREGATOR_CACHE_TTL_MS = Math.max(2_000, LIVE_SCORES_POLL_MS - 1_000);
