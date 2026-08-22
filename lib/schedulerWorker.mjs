import { processPendingOutboxEvents } from './outboxWorker.mjs';
import { runFullReconciliationAudit } from './reconciliationEngine.mjs';
import { redis } from '../db/redis.js';

let outboxInterval = null;
let reconInterval = null;
let settlementInterval = null;
let aggregatorInterval = null;

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

  // 3. Settlement recovery sweep every 30s (primary path is event-driven on aggregator tick)
  const runSettlementRecovery = async () => {
    try {
      const { runSettlementRecoverySweep } = await import('./settlement/settlementEventBridge.mjs');
      const res = await runSettlementRecoverySweep({ limit: 200 });
      if (res.recovery?.settled > 0 || res.recovery?.errors > 0) {
        console.log(`[SettlementRecovery] settled=${res.recovery.settled} errors=${res.recovery.errors}`);
      }
    } catch (err) {
      console.error('[SettlementRecovery Loop Error]', err.message);
    }
  };
  if (!settlementInterval) {
    runSettlementRecovery();
    settlementInterval = setInterval(runSettlementRecovery, 30000);
  }

  // Drive event-driven settlement from cached live scores (worker-only; API server skips this).
  const tickLiveAggregator = async () => {
    try {
      const { aggregateLiveScores } = await import('./aggregator.mjs');
      await aggregateLiveScores({ force: false });
    } catch (err) {
      console.error('[Aggregator Tick Error]', err.message);
    }
  };
  if (!aggregatorInterval) {
    tickLiveAggregator();
    aggregatorInterval = setInterval(tickLiveAggregator, 15000);
  }

  console.log('✅ Background Workers Active: Outbox (2s), Live aggregator (15s), Settlement Recovery (30s), Reconciliation (300s)');
}

/**
 * Stop Background Workers cleanly
 */
export function stopBackgroundWorkers() {
  if (outboxInterval) clearInterval(outboxInterval);
  if (reconInterval) clearInterval(reconInterval);
  if (settlementInterval) clearInterval(settlementInterval);
  if (aggregatorInterval) clearInterval(aggregatorInterval);
  outboxInterval = null;
  reconInterval = null;
  settlementInterval = null;
  aggregatorInterval = null;
  console.log('🛑 Background Workers stopped cleanly');
}
