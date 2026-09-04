#!/usr/bin/env node
/**
 * Smoke-test payments@ ops inbox (SMTP + mailbox).
 * Usage: node scripts/send_payments_ops_test_email.mjs
 */
import 'dotenv/config';
import { sendPaymentsOpsTestEmail } from '../lib/paymentsOpsNotify.mjs';

const result = await sendPaymentsOpsTestEmail({
  note: process.argv.slice(2).join(' ') || 'Manual smoke test from deploy pipeline.',
});

console.log(JSON.stringify(result, null, 2));
process.exit(result.success ? 0 : 1);
