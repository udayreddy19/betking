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
let apiExplorerHealthInterval = null;
let spinGrantExpireInterval = null;
let referralReconInterval = null;
let resettleScanInterval = null;
let paymentsDigestInterval = null;

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
      const payload = await aggregateLiveScores({ force: false });
      try {
        const { evaluateFollowPriceAlerts } = await import('./matchFollowAlerts.mjs');
        await evaluateFollowPriceAlerts(payload?.matches || []);
      } catch (err) {
        console.error('[FollowAlerts Tick Error]', err.message);
      }
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

  // Referral reconciliation fallback sweep every 60s
  const tickReferralReconciliation = async () => {
    try {
      const { reconcilePendingReferrals } = await import('./referralLoyaltyEngine.mjs');
      const res = await reconcilePendingReferrals({ batchSize: 50 });
      if (res?.qualified > 0) {
        console.log(`[ReferralReconciliation] qualified=${res.qualified} processed=${res.processed}`);
      }
    } catch (err) {
      console.error('[ReferralReconciliation Loop Error]', err.message);
    }
  };
  if (!referralReconInterval) {
    tickReferralReconciliation();
    referralReconInterval = setInterval(tickReferralReconciliation, 60000);
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

  const tickApiExplorerHealth = async () => {
    try {
      const { runPeriodicSafeChecks } = await import('./api-explorer/periodicChecks.mjs');
      await runPeriodicSafeChecks();
    } catch (err) {
      console.error('[ApiExplorer Health Loop Error]', err.message);
    }
  };
  if (!apiExplorerHealthInterval) {
    apiExplorerHealthInterval = setInterval(tickApiExplorerHealth, 60000);
  }

  const tickSpinGrantExpiry = async () => {
    try {
      const { expireDueSpinGrantsBatch } = await import('./spinGrantEngine.mjs');
      const res = await expireDueSpinGrantsBatch({ limit: 50 });
      if (res.expiredBonus > 0 || res.expiredFreebet > 0 || res.errors > 0) {
        console.log(`[SpinGrantExpiry] users=${res.users} bonus=${res.expiredBonus} freebet=${res.expiredFreebet} errors=${res.errors}`);
      }
    } catch (err) {
      console.error('[SpinGrantExpiry Loop Error]', err.message);
    }
  };
  if (!spinGrantExpireInterval) {
    tickSpinGrantExpiry();
    spinGrantExpireInterval = setInterval(tickSpinGrantExpiry, 30000);
  }

  // Nightly-ish resettle scan for wrong LOST Overs on totals (every 6h)
  const tickResettleScan = async () => {
    try {
      const { scanWrongLostTotals } = await import('./resettleWrongLostTotalsScan.mjs');
      const report = await scanWrongLostTotals({ lookbackDays: 3, limit: 200 });
      if (report.suspectCount > 0) {
        console.warn(
          `[ResettleScan] suspects=${report.suspectCount} sample=${report.suspects.slice(0, 3).map((s) => s.betId).join(',')}`,
        );
      }
    } catch (err) {
      console.error('[ResettleScan Loop Error]', err.message);
    }
  };
  if (!resettleScanInterval) {
    // First run after 10 minutes so boot isn't blocked
    setTimeout(tickResettleScan, 600_000);
    resettleScanInterval = setInterval(tickResettleScan, 6 * 60 * 60 * 1000);
  }

  // Small-deposit digest → payments@ (default hourly; override via PAYMENTS_DEPOSIT_DIGEST_INTERVAL_MS)
  const tickPaymentsDigest = async () => {
    try {
      const { flushPaymentsDepositDigest, paymentsOpsConfig } = await import('./paymentsOpsNotify.mjs');
      const cfg = paymentsOpsConfig();
      if (!(cfg.digestBelowInr > 0)) return;
      const res = await flushPaymentsDepositDigest({ limit: 200 });
      if (res.flushed > 0 || res.error) {
        console.log(`[PaymentsDigest] flushed=${res.flushed || 0} emailed=${Boolean(res.emailed)} error=${res.error || ''}`);
      }
    } catch (err) {
      console.error('[PaymentsDigest Loop Error]', err.message);
    }
  };
  if (!paymentsDigestInterval) {
    const intervalMs = Math.max(
      60_000,
      Number(process.env.PAYMENTS_DEPOSIT_DIGEST_INTERVAL_MS || 3_600_000) || 3_600_000,
    );
    setTimeout(tickPaymentsDigest, 120_000);
    paymentsDigestInterval = setInterval(tickPaymentsDigest, intervalMs);
  }

  console.log('✅ Background Workers Active: Outbox (2s), Live aggregator (15s), Settlement Recovery (30s), Spin grant expiry (30s), Support SLA (300s), KYC Reminder (120s), Reconciliation (300s), Ops Alerts (60s), Notifications (15s), API Explorer health (60s), Resettle scan (6h), Payments digest');
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
  if (apiExplorerHealthInterval) clearInterval(apiExplorerHealthInterval);
  if (spinGrantExpireInterval) clearInterval(spinGrantExpireInterval);
  if (referralReconInterval) clearInterval(referralReconInterval);
  if (resettleScanInterval) clearInterval(resettleScanInterval);
  if (paymentsDigestInterval) clearInterval(paymentsDigestInterval);
  outboxInterval = null;
  reconInterval = null;
  settlementInterval = null;
  aggregatorInterval = null;
  supportSlaInterval = null;
  kycReminderInterval = null;
  opsAlertInterval = null;
  notificationInterval = null;
  apiExplorerHealthInterval = null;
  spinGrantExpireInterval = null;
  referralReconInterval = null;
  resettleScanInterval = null;
  paymentsDigestInterval = null;
  console.log('🛑 Background Workers stopped cleanly');
}
