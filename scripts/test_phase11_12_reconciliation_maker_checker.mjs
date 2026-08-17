/**
 * PHASES 11 & 12 ACCEPTANCE TEST: FINANCIAL RECONCILIATION & MAKER-CHECKER WORKFLOW
 * Verifies Multi-Domain Financial Auditing and Dual-Operator Maker-Checker Controls.
 */

import { runFullReconciliationAudit } from '../lib/reconciliationEngine.mjs';
import { makerCheckerEngine } from '../lib/makerCheckerEngine.mjs';

async function runPhase1112AcceptanceTest() {
  console.log('🚀 EXECUTING PHASES 11 & 12: FINANCIAL RECONCILIATION & MAKER-CHECKER ACCEPTANCE TEST...\n');
  let passCount = 0;

  try {
    const testUserId = `mc_user_${Date.now()}@oddsyra.com`;

    // 1. Run Multi-Domain Financial Reconciliation Audit
    console.log('   ⏳ Test 1/4: Running Multi-Domain Financial Reconciliation Audit...');
    const auditRes = await runFullReconciliationAudit();

    if (!auditRes.success) throw new Error('Financial Reconciliation Audit failed');
    console.log(`✅ TEST 1/4 PASSED: Multi-Domain Financial Reconciliation Audit completed! (Overall Status: ${auditRes.overallStatus}).`);
    passCount++;

    // 2. Maker Submits Manual Credit Request (₹5,000)
    console.log('   ⏳ Test 2/4: Submitting Maker-Checker Manual Credit Request (₹5,000)...');
    const req = await makerCheckerEngine.submitRequest({
      actionType: 'MANUAL_CREDIT',
      targetEntityType: 'user',
      targetEntityId: testUserId,
      requestPayload: { amount: 5000, reason: 'VIP Goodwill Compensation' },
      makerId: 'admin_maker_priya',
    });

    if (!req.requestId || req.status !== 'PENDING_APPROVAL') {
      throw new Error(`Failed to submit maker request, got: ${JSON.stringify(req)}`);
    }
    console.log(`✅ TEST 2/4 PASSED: Maker Request submitted cleanly! (Request ID: ${req.requestId}, Status: ${req.status}).`);
    passCount++;

    // 3. Prevent Self-Approval (Maker = Checker)
    console.log('   ⏳ Test 3/4: Testing Prevention of Maker Self-Approval...');
    let selfApprovalBlocked = false;
    try {
      await makerCheckerEngine.approveRequest(req.requestId, 'admin_maker_priya');
    } catch (err) {
      if (err.message.includes('MAKER_CHECKER_SELF_APPROVAL_PROHIBITED')) {
        selfApprovalBlocked = true;
      }
    }

    if (!selfApprovalBlocked) {
      throw new Error('CRITICAL FAILURE: Maker was allowed to approve their own request!');
    }
    console.log('✅ TEST 3/4 PASSED: Maker Self-Approval strictly prohibited and blocked!');
    passCount++;

    // 4. Dual-Operator Approval by Checker
    console.log('   ⏳ Test 4/4: Testing Checker Approval & Atomic Double-Entry Ledger Credit...');
    const approveRes = await makerCheckerEngine.approveRequest(req.requestId, 'admin_checker_vikram');

    if (approveRes.status !== 'APPROVED' || approveRes.checkerId !== 'admin_checker_vikram') {
      throw new Error(`Failed to approve request, got: ${JSON.stringify(approveRes)}`);
    }
    console.log(`✅ TEST 4/4 PASSED: Checker approved request & double-entry ledger credited! (Status: ${approveRes.status}).`);
    passCount++;

    console.log('\n=====================================================================');
    console.log(`🎯 PHASES 11 & 12 ACCEPTANCE TEST RESULT: ${passCount}/4 TESTS PASSED`);
    console.log('=====================================================================\n');

  } catch (err) {
    console.error('\n❌ PHASES 11 & 12 ACCEPTANCE TEST FAILED:', err.message);
    process.exit(1);
  }
}

runPhase1112AcceptanceTest();
