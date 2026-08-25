#!/usr/bin/env node
/**
 * Sync Cricbuzz ball-by-ball feed into match_ball_events for open delivery bets.
 * Works for all cricket formats (T10 / T20 / ODI / Hundred / Test).
 *
 * Usage:
 *   node scripts/sync-ball-feed.mjs
 *   node scripts/sync-ball-feed.mjs --match=oy_xxx
 */

import { query } from '../db/pg.js';
import { enrichMatchWithBallFeed, matchHasBallFeed } from '../lib/cricbuzzBallFeed.mjs';
import { ingestBallEventsFromMatch } from '../lib/settlement/canonicalBallEvents.mjs';
import { fetchMatchDetail } from '../lib/matchDetailFetcher.mjs';

function parseArg(name) {
  const flag = process.argv.find((a) => a.startsWith(`--${name}=`));
  return flag ? flag.split('=').slice(1).join('=') : null;
}

async function main() {
  const matchFilter = parseArg('match');
  const bets = await query(
    matchFilter
      ? `SELECT DISTINCT match_id FROM bets
         WHERE UPPER(status) IN ('ACCEPTED','PENDING','OPEN')
           AND market_id ILIKE '%next_delivery%'
           AND match_id = $1`
      : `SELECT DISTINCT match_id FROM bets
         WHERE UPPER(status) IN ('ACCEPTED','PENDING','OPEN')
           AND market_id ILIKE '%next_delivery%'
         LIMIT 40`,
    matchFilter ? [matchFilter] : [],
  );

  const results = [];
  for (const row of bets.rows) {
    const matchId = row.match_id;
    let match = { id: matchId, matchId, sport: 'cricket' };
    try {
      match = await fetchMatchDetail(match, { fast: false }) || match;
    } catch (err) {
      results.push({ matchId, error: `detail:${err.message}` });
      continue;
    }
    if (!matchHasBallFeed(match)) {
      match = await enrichMatchWithBallFeed(match);
    }
    if (!matchHasBallFeed(match)) {
      results.push({
        matchId,
        format: match.matchFormat || match.matchType || match.format || null,
        hasBallFeed: false,
        note: 'provider scorecard-only (no o_summary)',
      });
      continue;
    }
    const ingest = await ingestBallEventsFromMatch(match);
    results.push({
      matchId,
      format: match.matchFormat || match.matchType || match.format || null,
      hasBallFeed: true,
      overs: (match.overHistory || []).length,
      ingested: ingest.ingested,
      corrections: ingest.corrections,
    });
  }

  console.log(JSON.stringify({ event: 'BALL_FEED_SYNC', count: results.length, results }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
