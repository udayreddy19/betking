/** Live data refresh intervals — fetch all match details from API on each tick. */
export const LIVE_SCORES_POLL_MS = Number(import.meta.env.VITE_LIVE_SCORES_POLL_MS) || 5_000;
export const MATCH_DETAIL_LIVE_POLL_MS = Number(import.meta.env.VITE_MATCH_DETAIL_LIVE_POLL_MS) || 3_000;
export const MATCH_DETAIL_IDLE_POLL_MS = Number(import.meta.env.VITE_MATCH_DETAIL_IDLE_POLL_MS) || 10_000;
