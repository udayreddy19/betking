import { logger } from './logger.mjs';
import {
  broadcastScoreMatch,
  broadcastScoresLive,
  listSubscribedChannelIds,
} from './websocketEngine.mjs';
import { LIVE_SCORES_POLL_MS } from './livePolling.mjs';

const ODDS_FANOUT_CONCURRENCY = 6;

/**
 * Push a fresh aggregator snapshot to live WS subscribers.
 * Odds V3 is only rebuilt for matches that currently have odds:match:* subscribers.
 */
export function publishAggregatorTick(payload) {
  if (!payload) return;

  try {
    broadcastScoresLive({
      timestamp: payload.timestamp,
      status: payload.status,
      counts: payload.counts,
      sources: payload.sources,
      series: payload.series,
      matches: payload.matches,
      feedError: payload.feedError,
      pollIntervalMs: LIVE_SCORES_POLL_MS,
    });
  } catch (err) {
    logger.warn('scores_live_broadcast_failed', { error: err.message });
  }

  const scoreChannels = listSubscribedChannelIds('scores:match:');
  if (scoreChannels.length && Array.isArray(payload.matches)) {
    const byId = new Map();
    for (const match of payload.matches) {
      const id = match?.id || match?.matchId;
      if (id) byId.set(String(id), match);
    }
    for (const channel of scoreChannels) {
      const matchId = channel.slice('scores:match:'.length);
      const match = byId.get(matchId);
      if (match) broadcastScoreMatch(matchId, match);
    }
  }

  const oddsChannels = listSubscribedChannelIds('odds:match:');
  if (!oddsChannels.length) return;

  const matchIds = oddsChannels.map((ch) => ch.slice('odds:match:'.length));
  fanoutOdds(matchIds).catch((err) => {
    logger.warn('odds_fanout_failed', { error: err.message });
  });
}

async function fanoutOdds(matchIds) {
  const { buildMatchOddsPayload } = await import('./liveScoresApiHandlers.mjs');
  for (let i = 0; i < matchIds.length; i += ODDS_FANOUT_CONCURRENCY) {
    const batch = matchIds.slice(i, i + ODDS_FANOUT_CONCURRENCY);
    await Promise.allSettled(
      batch.map((matchId) => buildMatchOddsPayload({ matchId, force: true })),
    );
  }
}
