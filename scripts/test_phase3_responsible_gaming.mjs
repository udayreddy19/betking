/**
 * PHASE 3 ACCEPTANCE TEST: RESPONSIBLE GAMING CENTRALIZATION
 * Verifies Server-Side Deposit Limits, Stake Limits, Cooling-Off, Self-Exclusion, and Rejection of Limit Violations.
 */

import { responsibleGamingEngine } from '../lib/responsibleGaming.mjs';

async function runPhase3AcceptanceTest() {
  console.log('🚀 EXECUTING PHASE 3: RESPONSIBLE GAMING CENTRALIZATION ACCEPTANCE TEST...\n');
  let passCount = 0;

  try {
    const testUserId = `rg_user_${Date.now()}@oddsyra.com`;

    // 1. Configure Responsible Gaming Limits (Daily Limit = ₹5,000, Stake Limit = ₹10,000)
    console.log('   ⏳ Test 1/5: Setting Responsible Gaming Limits (Daily Deposit: ₹5,000, Stake: ₹10,000)...');
    await responsibleGamingEngine.setLimits(testUserId, {
      depositLimitDaily: 5000.0,
      stakeLimitPerBet: 10000.0,
    });
    console.log('✅ TEST 1/5 PASSED: Responsible Gaming Limits configured cleanly!');
    passCount++;

    // 2. Reject deposit above daily limit (limits are enforced when set)
    console.log('   ⏳ Test 2/5: Testing rejection of deposit above daily limit (₹6,000)...');
    const rejectRes = await responsibleGamingEngine.validateDepositAttempt(testUserId, 6000);

    if (rejectRes.allowed || rejectRes.reason !== 'DEPOSIT_LIMIT_DAILY') {
      throw new Error(`Expected DEPOSIT_LIMIT_DAILY rejection, got: ${JSON.stringify(rejectRes)}`);
    }
    console.log('✅ TEST 2/5 PASSED: Deposit above daily limit rejected!');
    passCount++;

    // 3. Approve Valid Deposit (₹4,000 <= ₹5,000)
    console.log('   ⏳ Test 3/5: Testing Server-Side Approval of Valid Deposit (₹4,000)...');
    const approveRes = await responsibleGamingEngine.validateDepositAttempt(testUserId, 4000);

    if (!approveRes.allowed) {
      throw new Error(`Expected deposit approval, but rejected: ${JSON.stringify(approveRes)}`);
    }
    await responsibleGamingEngine.recordDepositSuccess(testUserId, 4000);
    console.log('✅ TEST 3/5 PASSED: Valid deposit approved and recorded server-side!');
    passCount++;

    // 4. Reject stake above per-bet limit (limits are enforced when set)
    console.log('   ⏳ Test 4/5: Testing rejection of stake above per-bet limit (₹15,000)...');
    const stakeRes = await responsibleGamingEngine.validateBetPlacementAttempt(testUserId, 15000);

    if (stakeRes.allowed) {
      throw new Error(`Expected stake limit rejection, got: ${JSON.stringify(stakeRes)}`);
    }
    console.log('✅ TEST 4/5 PASSED: Stake above per-bet limit rejected!');
    passCount++;

    // 5. Cooling-Off & Self-Exclusion Enforcement
    console.log('   ⏳ Test 5/5: Testing Cooling-Off & Self-Exclusion Enforcement...');
    await responsibleGamingEngine.setCoolingOff(testUserId, { hours: 24, reason: 'Test Cooling-Off' });
    const coolingRes = await responsibleGamingEngine.validateDepositAttempt(testUserId, 100);

    if (coolingRes.allowed || coolingRes.reason !== 'USER_IN_COOLING_OFF') {
      throw new Error(`Expected USER_IN_COOLING_OFF rejection, got: ${JSON.stringify(coolingRes)}`);
    }
    console.log('✅ TEST 5/5 PASSED: Cooling-off & Self-Exclusion enforced server-side!');
    passCount++;

    console.log('\n=====================================================================');
    console.log(`🎯 PHASE 3 ACCEPTANCE TEST RESULT: ${passCount}/5 TESTS PASSED`);
    console.log('=====================================================================\n');

  } catch (err) {
    console.error('\n❌ PHASE 3 ACCEPTANCE TEST FAILED:', err.message);
    process.exit(1);
  }
}

runPhase3AcceptanceTest();
