import { processPendingOutboxEvents } from './outboxWorker.mjs';
import { runFullReconciliationAudit } from './reconciliationEngine.mjs';
import { redis } from '../db/redis.js';

let outboxInterval = null;
let reconInterval = null;
let settlementInterval = null;
let aggregatorInterval = null;
let supportSlaInterval = null;
let kycReminderInterval = null;
let opsAlertInterval = null;
let notificationInterval = null;

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

  // Support SLA reminders every 5 minutes
  const tickSupportSla = async () => {
    try {
      const { runSupportSlaReminderSweep } = await import('./supportSlaWorker.mjs');
      const res = await runSupportSlaReminderSweep({ limit: 40 });
      if (res.emailed > 0 || res.errors > 0) {
        console.log(`[SupportSla] checked=${res.checked} emailed=${res.emailed} errors=${res.errors}`);
      }
    } catch (err) {
      console.error('[SupportSla Loop Error]', err.message);
    }
  };
  if (!supportSlaInterval) {
    supportSlaInterval = setInterval(tickSupportSla, 300000);
  }

  // KYC reminder email retries every 2 minutes
  const tickKycReminders = async () => {
    try {
      const { processKycReminderRetries } = await import('./kycReminder.mjs');
      const res = await processKycReminderRetries({ limit: 25 });
      if (res.sent > 0 || res.failed > 0) {
        console.log(`[KycReminder] checked=${res.checked} sent=${res.sent} failed=${res.failed}`);
      }
    } catch (err) {
      console.error('[KycReminder Loop Error]', err.message);
    }
  };
  if (!kycReminderInterval) {
    kycReminderInterval = setInterval(tickKycReminders, 120000);
  }

  // Ops threshold alert evaluation every 60s (soft-fail; complements hot-path raiseOpsAlert)
  const tickOpsAlerts = async () => {
    try {
      const { evaluateOpsThresholds } = await import('./opsAlertEngine.mjs');
      await evaluateOpsThresholds();
    } catch (err) {
      console.error('[OpsAlert Eval Loop Error]', err.message);
    }
  };
  if (!opsAlertInterval) {
    opsAlertInterval = setInterval(tickOpsAlerts, 60000);
  }

  // Notification delivery queue every 15s (honest delivery status)
  const tickNotifications = async () => {
    try {
      const { processNotificationDeliveryQueue } = await import('./notificationEngine.mjs');
      const res = await processNotificationDeliveryQueue();
      if (res.countDelivered > 0 || res.countDeadLetter > 0) {
        console.log(`[NotificationQueue] delivered=${res.countDelivered} deadLetter=${res.countDeadLetter}`);
      }
    } catch (err) {
      console.error('[NotificationQueue Loop Error]', err.message);
    }
  };
  if (!notificationInterval) {
    notificationInterval = setInterval(tickNotifications, 15000);
  }

  console.log('✅ Background Workers Active: Outbox (2s), Live aggregator (15s), Settlement Recovery (30s), Support SLA (300s), KYC Reminder (120s), Reconciliation (300s), Ops Alerts (60s), Notifications (15s)');
}

/**
 * Stop Background Workers cleanly
 */
export function stopBackgroundWorkers() {
  if (outboxInterval) clearInterval(outboxInterval);
  if (reconInterval) clearInterval(reconInterval);
  if (settlementInterval) clearInterval(settlementInterval);
  if (aggregatorInterval) clearInterval(aggregatorInterval);
  if (supportSlaInterval) clearInterval(supportSlaInterval);
  if (kycReminderInterval) clearInterval(kycReminderInterval);
  if (opsAlertInterval) clearInterval(opsAlertInterval);
  if (notificationInterval) clearInterval(notificationInterval);
  outboxInterval = null;
  reconInterval = null;
  settlementInterval = null;
  aggregatorInterval = null;
  supportSlaInterval = null;
  kycReminderInterval = null;
  opsAlertInterval = null;
  notificationInterval = null;
  console.log('🛑 Background Workers stopped cleanly');
}
