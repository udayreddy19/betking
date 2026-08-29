/**
 * Database Match Persistence Backfill Runner
 */

import { backfillMatchesFromPlacedBets } from '../lib/eventPersistence.mjs';
import { query } from '../db/pg.js';

async function main() {
  console.log('🔄 STARTING MATCH PERSISTENCE BACKFILL...');
  const res = await backfillMatchesFromPlacedBets();
  console.log('BACKFILL RESULT:', res);

  const total = await query('SELECT count(*) FROM matches');
  console.log('TOTAL MATCHES IN DATABASE NOW:', total.rows[0].count);
}

main().catch(console.error);
