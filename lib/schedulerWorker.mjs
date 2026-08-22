import { processPendingOutboxEvents } from './outboxWorker.mjs';
import { runFullReconciliationAudit } from './reconciliationEngine.mjs';
import { redis } from '../db/redis.js';

let outboxInterval = null;
let reconInterval = null;
let settlementInterval = null;

/**
 * Start Scale-Ready Background Worker Loop
 */
export function startBackgroundWorkers() {
  console.log('🔄 STARTING ODDSYRA BACKGROUND WORKERS & SCHEDULER...');

  // 1. Process Outbox Events every 2 seconds
  if (!outboxInterval) {
    outboxInterval = setInterval(async () => {
      try {
        await processPendingOutboxEvents(20);
      } catch (err) {
        console.error('[Outbox Worker Loop Error]', err.message);
      }
    }, 2000);
  }

  // 2. Process Full Reconciliation Audit every 5 minutes
  if (!reconInterval) {
    reconInterval = setInterval(async () => {
      try {
        await runFullReconciliationAudit();
      } catch (err) {
        console.error('[Reconciliation Loop Error]', err.message);
      }
    }, 300000);
  }

  // 3. Auto-settle completed live matches → WON/LOST/VOID every 30s
  const runLiveSettlement = async () => {
    try {
      const { settleOpenBetsFromLiveScores } = await import('./liveMatchSettlement.mjs');
      const res = await settleOpenBetsFromLiveScores({ limit: 200 });
      if (res.settled > 0 || res.errors > 0) {
        console.log(`[LiveSettlement] checked=${res.checked} settled=${res.settled} skipped=${res.skipped} errors=${res.errors}`);
      }
    } catch (err) {
      console.error('[LiveSettlement Loop Error]', err.message);
    }
  };
  if (!settlementInterval) {
    runLiveSettlement();
    settlementInterval = setInterval(runLiveSettlement, 30000);
  }

  console.log('✅ Background Workers Active: Outbox (2s), Live Settlement (30s), Reconciliation (300s)');
}

/**
 * Stop Background Workers cleanly
 */
export function stopBackgroundWorkers() {
  if (outboxInterval) clearInterval(outboxInterval);
  if (reconInterval) clearInterval(reconInterval);
  if (settlementInterval) clearInterval(settlementInterval);
  outboxInterval = null;
  reconInterval = null;
  settlementInterval = null;
  console.log('🛑 Background Workers stopped cleanly');
}
