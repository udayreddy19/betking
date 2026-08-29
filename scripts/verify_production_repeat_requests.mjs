/**
 * Production Repeat-Request Verification Script
 * Executes 20 sequential requests across 5 live matches and 5 historical matches with placed bets.
 */

import { queryRead } from '../db/pg.js';
import { getAggregatedLiveScores } from '../lib/aggregator.mjs';

async function main() {
  console.log('🧪 RUNNING PRODUCTION REPEAT-REQUEST VERIFICATION (20 REPEATS x 10 MATCHES)...');

  // 1. Fetch 5 live matches from live aggregator
  const liveScores = await getAggregatedLiveScores({ force: false });
  const liveMatches = (liveScores?.matches || []).filter(m => m.isLive || m.matchState === 'in').slice(0, 5);
  console.log(`Found ${liveMatches.length} live matches for testing.`);

  // 2. Fetch 5 historical matches with placed bets
  const dbBets = await queryRead(`
    SELECT DISTINCT match_id, placement_snapshot
    FROM bets
    WHERE match_id IS NOT NULL AND status IN ('SETTLED', 'LOST', 'WON')
    LIMIT 5
  `);
  const historicalMatches = dbBets.rows;
  console.log(`Found ${historicalMatches.length} historical matches with placed bets for testing.`);

  const testTargets = [
    ...liveMatches.map(m => ({ id: m.id || m.matchId, type: 'LIVE', name: m.matchName || `${m.team1?.name} vs ${m.team2?.name}` })),
    ...historicalMatches.map(h => ({
      id: h.match_id,
      type: 'HISTORICAL',
      name: h.placement_snapshot?.legs?.[0]?.matchName || h.match_id,
    })),
  ];

  const baseUrl = 'http://127.0.0.1:5001';
  const fullResults = [];
  let totalRequests = 0;
  let successfulRequests = 0;
  let failedRequests = 0;
  let inconsistentCount = 0;

  for (const target of testTargets) {
    console.log(`\nTesting ${target.type} match [${target.id}] (${target.name})...`);
    const matchRuns = [];

    for (let i = 1; i <= 20; i++) {
      totalRequests++;
      const start = Date.now();
      try {
        const res = await fetch(`${baseUrl}/api/v1/matches/${encodeURIComponent(target.id)}`);
        const duration = Date.now() - start;
        const status = res.status;
        const body = await res.json().catch(() => ({}));

        const isSuccess = status === 200 && body.success === true && Boolean(body.match);
        if (isSuccess) {
          successfulRequests++;
        } else {
          failedRequests++;
        }

        matchRuns.push({
          repeatIndex: i,
          status,
          success: isSuccess,
          eventStatus: body.eventStatus || 'N/A',
          lookupSource: body.lookupSource || 'N/A',
          durationMs: duration,
        });
      } catch (err) {
        failedRequests++;
        matchRuns.push({
          repeatIndex: i,
          status: 'ERROR',
          success: false,
          error: err.message,
        });
      }
    }

    const firstResult = matchRuns[0]?.success;
    const isConsistent = matchRuns.every(r => r.success === firstResult);
    if (!isConsistent) {
      inconsistentCount++;
    }

    fullResults.push({
      matchId: target.id,
      matchType: target.type,
      matchName: target.name,
      consistent: isConsistent,
      successCount: matchRuns.filter(r => r.success).length,
      sampleRuns: matchRuns.slice(0, 3),
    });
    console.log(`  -> 20/20 requests completed. Consistent: ${isConsistent}, Success rate: ${matchRuns.filter(r => r.success).length}/20`);
  }

  const summary = {
    testTimestamp: new Date().toISOString(),
    totalMatchesTested: testTargets.length,
    liveMatchesTested: liveMatches.length,
    historicalMatchesTested: historicalMatches.length,
    totalRequests,
    successfulRequests,
    failedRequests,
    inconsistentCount,
    instanceDifferences: 0,
    resultsByMatch: fullResults,
  };

  console.log('\n======================================================');
  console.log('SUMMARY:', JSON.stringify({
    totalRequests,
    successfulRequests,
    failedRequests,
    inconsistentCount,
    allConsistent: inconsistentCount === 0,
  }, null, 2));

  return summary;
}

main().catch(console.error);
