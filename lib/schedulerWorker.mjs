import { processPendingOutboxEvents } from './outboxWorker.mjs';
import { runFullReconciliationAudit } from './reconciliationEngine.mjs';
import { redis } from '../db/redis.js';

let outboxInterval = null;
let reconInterval = null;

/**
 * Start Scale-Ready Background Worker Loop
 */
export function startBackgroundWorkers() {
  console.log('🔄 STARTING BETKING BACKGROUND WORKERS & SCHEDULER...');

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

  console.log('✅ Background Workers Active: Outbox Processor (2s), Reconciliation Audit (300s)');
}

/**
 * Stop Background Workers cleanly
 */
export function stopBackgroundWorkers() {
  if (outboxInterval) clearInterval(outboxInterval);
  if (reconInterval) clearInterval(reconInterval);
  outboxInterval = null;
  reconInterval = null;
  console.log('🛑 Background Workers stopped cleanly');
}
