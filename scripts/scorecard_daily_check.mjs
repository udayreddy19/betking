#!/usr/bin/env node
/**
 * Daily ops scorecard pin — run via cron on the VPS:
 *   0 6 * * * cd /opt/oddsyra && docker exec oddsyra_prod_backend node scripts/scorecard_daily_check.mjs
 */
import { getProductionScorecard } from '../lib/productionScorecard.mjs';

const card = await getProductionScorecard();
const line = JSON.stringify({
  at: new Date().toISOString(),
  score: card.score,
  grade: card.grade,
  sportsbookOn: card.sportsbookOn,
  openReconCases: card.openReconCases,
  adminMfaRequired: card.adminMfaRequired,
  alertWebhookConfigured: card.alertWebhookConfigured,
  deductions: card.deductions,
});
console.log(line);
if (card.score < 90) {
  console.error(`[scorecard_daily_check] BELOW_THRESHOLD score=${card.score}`);
  process.exit(2);
}
process.exit(0);
