/**
 * Production readiness scorecard (0–100) for Oddsyra ops excellence.
 * Read-only — never mutates money or product mode.
 */
import { query } from '../db/pg.js';
import { DAILY_HOUSE_CAPS } from './dailyHouseCaps.mjs';
import { inspectKnownTestFundingAccounts } from './knownTestFundingExclusions.mjs';

export async function getProductionScorecard() {
  const deductions = [];
  let score = 100;

  const product = await query(
    `SELECT betting_enabled, software_platform_enabled, wallet_enabled, pg_review_mode
     FROM product_configuration WHERE id = 1`,
  ).catch(() => ({ rows: [{}] }));
  const p = product.rows[0] || {};
  const sportsbookOn = p.betting_enabled === true && p.software_platform_enabled !== true;
  if (!sportsbookOn) {
    score -= 8;
    deductions.push({ points: 8, code: 'SPORTSBOOK_OFF', detail: 'Sportsbook not ON as exclusive public mode' });
  }

  const openRecon = await query(
    `SELECT COUNT(*)::int AS c FROM reconciliation_cases WHERE UPPER(status)='OPEN'`,
  ).catch(() => ({ rows: [{ c: 0 }] }));
  const openCount = Number(openRecon.rows[0]?.c || 0);
  if (openCount > 0) {
    const pen = Math.min(15, openCount * 2);
    score -= pen;
    deductions.push({ points: pen, code: 'OPEN_RECON', detail: `${openCount} OPEN reconciliation case(s)` });
  }

  const dlq = await query(
    `SELECT COUNT(*)::int AS c FROM settlement_jobs WHERE UPPER(status)='DEAD_LETTER'`,
  ).catch(() => ({ rows: [{ c: 0 }] }));
  const dlqCount = Number(dlq.rows[0]?.c || 0);
  if (dlqCount > 0) {
    const pen = Math.min(10, dlqCount);
    score -= pen;
    deductions.push({ points: pen, code: 'SETTLEMENT_DLQ', detail: `${dlqCount} DEAD_LETTER settlement job(s)` });
  }

  const mfa = process.env.ADMIN_MFA_REQUIRED;
  const mfaOn = ['1', 'true', 'yes'].includes(String(mfa || '').toLowerCase());
  if (!mfaOn) {
    score -= 6;
    deductions.push({ points: 6, code: 'MFA_OFF', detail: 'ADMIN_MFA_REQUIRED not enforced' });
  }

  const webhookEnv = process.env.OPS_ALERT_WEBHOOK_URL
    || process.env.SLACK_OPS_WEBHOOK_URL
    || process.env.SLACK_WEBHOOK_URL;
  const webhookRows = await query(
    `SELECT COUNT(*)::int AS c FROM ops_alert_webhooks WHERE enabled = TRUE`,
  ).catch(() => ({ rows: [{ c: 0 }] }));
  if (!webhookEnv && Number(webhookRows.rows[0]?.c || 0) === 0) {
    score -= 4;
    deductions.push({ points: 4, code: 'NO_ALERT_WEBHOOK', detail: 'No OPS_ALERT_WEBHOOK_URL or persisted webhook' });
  }

  const testFunding = await inspectKnownTestFundingAccounts().catch(() => null);
  const pendingTest = Number(testFunding?.pendingCount || 0);
  // Residual test cash is informational only when recon flags are closed.
  if (pendingTest > 0 && openCount > 0) {
    score -= 3;
    deductions.push({
      points: 3,
      code: 'TEST_FUNDING_OPEN_FLAGS',
      detail: `${pendingTest} known test-funding account(s) with residual + OPEN recon`,
    });
  }

  if (!DAILY_HOUSE_CAPS?.maxDailyNetWin) {
    score -= 2;
    deductions.push({ points: 2, code: 'HOUSE_CAPS_MISSING', detail: 'Daily house caps not loaded' });
  }

  // Bonus: settlement queue healthy
  const pendingJobs = await query(
    `SELECT COUNT(*)::int AS c FROM settlement_jobs
     WHERE UPPER(status) IN ('PENDING','RETRY','FAILED','AWAITING_EVIDENCE')`,
  ).catch(() => ({ rows: [{ c: 0 }] }));
  if (Number(pendingJobs.rows[0]?.c || 0) > 20) {
    score -= 3;
    deductions.push({
      points: 3,
      code: 'SETTLEMENT_BACKLOG',
      detail: `${pendingJobs.rows[0].c} unsettled settlement jobs`,
    });
  }

  score = Math.max(0, Math.min(100, score));
  const grade = score >= 95 ? 'A+' : score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : 'D';

  return {
    success: true,
    score,
    grade,
    sportsbookOn,
    openReconCases: openCount,
    settlementDeadLetter: dlqCount,
    adminMfaRequired: mfaOn,
    alertWebhookConfigured: Boolean(webhookEnv) || Number(webhookRows.rows[0]?.c || 0) > 0,
    houseCaps: DAILY_HOUSE_CAPS,
    deductions,
    updatedAt: new Date().toISOString(),
    note: 'Read-only scorecard. Fix deductions to reach 100.',
  };
}
