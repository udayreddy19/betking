#!/usr/bin/env node
/**
 * CLI for wrong LOST totals resettle scan (read-only).
 */

import { scanWrongLostTotals } from '../lib/resettleWrongLostTotalsScan.mjs';

async function main() {
  const lookbackDays = Number(process.env.RESETTLE_LOOKBACK_DAYS) || 7;
  const report = await scanWrongLostTotals({ lookbackDays });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.suspectCount > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error(JSON.stringify({
    event: 'RESETTLE_WRONG_LOST_TOTALS_SCAN_ERROR',
    message: err.message,
  }));
  process.exit(1);
});
