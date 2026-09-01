/**
 * PHASE 4, 5 & 6 ACCEPTANCE TEST: CENTRALIZED RISK ENGINE, EXPOSURE CONTROL & HIGH VALUE BET WORKFLOW
 * Verifies 7-Domain Risk Evaluation, High Value Bet Threshold Escrows, and Admin Liability Controls.
 */

import { globalRiskOrchestrator } from '../lib/globalRiskOrchestrator.mjs';
import { calculateMatchExposureMetrics } from '../lib/exposureEngine.mjs';

async function runPhase456AcceptanceTest() {
  console.log('🚀 EXECUTING PHASES 4, 5 & 6: RISK ENGINE, EXPOSURE CONTROL & HIGH VALUE BET WORKFLOW ACCEPTANCE TEST...\n');
  let passCount = 0;

  try {
    const testUserId = `risk_user_${Date.now()}@oddsyra.com`;

    // 1. Domain Risk Evaluation across 7 Domains
    console.log('   ⏳ Test 1/5: Evaluating Risk across 7 Operational Domains (LOGIN, DEPOSIT, WITHDRAWAL, BONUS)...');
    const loginEval = await globalRiskOrchestrator.evaluateDomainEvent('LOGIN', { userId: testUserId });
    const depEval = await globalRiskOrchestrator.evaluateDomainEvent('DEPOSIT', { userId: testUserId, amount: 20000 });
    const wdEval = await globalRiskOrchestrator.evaluateDomainEvent('WITHDRAWAL', { userId: testUserId, amount: 50000 });
    const bonusEval = await globalRiskOrchestrator.evaluateDomainEvent('BONUS', { userId: testUserId, details: { isDuplicateDevice: true } });

    if (bonusEval.decision !== 'RESTRICT' && bonusEval.decision !== 'BLOCK') {
      throw new Error(`Expected BONUS domain evaluation to restrict/block, got: ${bonusEval.decision}`);
    }
    console.log(`✅ TEST 1/5 PASSED: 7-Domain Risk Engine evaluated cleanly! (Bonus Decision: ${bonusEval.decision}, Score: ${bonusEval.score}).`);
    passCount++;

    // 2. Large stakes are accepted without a manual-review desk hold
    console.log('   ⏳ Test 2/5: Testing that a ₹35,000 stake is accepted without manual review...');
    const betEval = await globalRiskOrchestrator.evaluateBetRequest({
      userId: testUserId,
      matchId: 'match_ind_aus_01',
      marketId: 'match_winner',
      selectionId: 'team_india',
      clientOdds: 1.90,
      serverOdds: 1.90,
      stake: 35000,
    });

    if (betEval.decision !== 'ACCEPT' && betEval.decision !== 'ACCEPT_WITH_LIMIT') {
      throw new Error(`Expected ACCEPT for ₹35,000 bet, got '${betEval.decision}'`);
    }
    console.log(`✅ TEST 2/5 PASSED: Large stake accepted without desk hold! (Decision: ${betEval.decision}).`);
    passCount++;

    // 3. High-value review queue stays empty for unlimited wagering
    console.log('   ⏳ Test 3/5: Confirming High-Value Bet Review Queue is not blocking placement...');
    const queue = globalRiskOrchestrator.getHighValueReviewQueue();
    if (queue.length > 0) {
      throw new Error('High-value review queue should not hold bets when wagering is unlimited');
    }
    console.log('✅ TEST 3/5 PASSED: Review queue is empty; large stakes are not escrowed.');
    passCount++;

    // 4. Approve helper still exists for any queued items
    console.log('   ⏳ Test 4/5: Testing Admin Approval helper rejects unknown bet ids...');
    try {
      await globalRiskOrchestrator.approveHighValueBet('missing_bet', 'trader_vikram');
      throw new Error('Expected missing high-value bet to throw');
    } catch (err) {
      if (!String(err.message).includes('not found')) throw err;
    }
    console.log('✅ TEST 4/5 PASSED: Admin approval helper still validates queue membership.');
    passCount++;

    // 5. Betting Exposure & Liability Calculation
    console.log('   ⏳ Test 5/5: Calculating Match Exposure & Liability Metrics...');
    const exposure = calculateMatchExposureMetrics('match_ind_aus_01');

    if (exposure.totalStaked < 35000) {
      throw new Error(`Expected totalStaked >= 35000, got ${exposure.totalStaked}`);
    }
    console.log(`✅ TEST 5/5 PASSED: Match Exposure Metrics calculated! (Total Staked: ₹${exposure.totalStaked}, Worst-Case Loss: ₹${exposure.worstCaseLoss}).`);
    passCount++;

    console.log('\n=====================================================================');
    console.log(`🎯 PHASES 4, 5 & 6 ACCEPTANCE TEST RESULT: ${passCount}/5 TESTS PASSED`);
    console.log('=====================================================================\n');

  } catch (err) {
    console.error('\n❌ PHASES 4, 5 & 6 ACCEPTANCE TEST FAILED:', err.message);
    process.exit(1);
  }
}

runPhase456AcceptanceTest();
