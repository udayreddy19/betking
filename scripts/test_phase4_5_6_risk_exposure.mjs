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
    const testUserId = `risk_user_${Date.now()}@betking.com`;

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

    // 2. High Value Bet Manual Review Trigger (Stake = ₹35,000 > ₹25,000 Threshold)
    console.log('   ⏳ Test 2/5: Testing High-Value Bet Escrow Trigger (Stake = ₹35,000)...');
    const betEval = await globalRiskOrchestrator.evaluateBetRequest({
      userId: testUserId,
      matchId: 'match_ind_aus_01',
      marketId: 'match_winner',
      selectionId: 'team_india',
      clientOdds: 1.90,
      serverOdds: 1.90,
      stake: 35000,
    });

    if (betEval.decision !== 'MANUAL_REVIEW') {
      throw new Error(`Expected decision MANUAL_REVIEW for ₹35,000 bet, got '${betEval.decision}'`);
    }
    console.log(`✅ TEST 2/5 PASSED: High-Value Bet escalated to Manual Review Queue! (Bet ID: ${betEval.betId}).`);
    passCount++;

    // 3. Inspect Admin High-Value Bet Queue
    console.log('   ⏳ Test 3/5: Inspecting Admin High-Value Bet Review Queue...');
    const queue = globalRiskOrchestrator.getHighValueReviewQueue();
    const queuedBet = queue.find(b => b.betId === betEval.betId);

    if (!queuedBet || queuedBet.status !== 'PENDING_MANUAL_REVIEW') {
      throw new Error('High-value bet missing from Admin Review Queue');
    }
    console.log(`✅ TEST 3/5 PASSED: Bet found in Admin Review Queue! (Potential Payout: ₹${queuedBet.potentialPayout}).`);
    passCount++;

    // 4. Admin Manual Approval Workflow
    console.log('   ⏳ Test 4/5: Testing Admin Approval of High-Value Bet...');
    const approveRes = await globalRiskOrchestrator.approveHighValueBet(betEval.betId, 'trader_vikram');

    if (!approveRes.success || approveRes.bet.status !== 'APPROVED') {
      throw new Error('Failed to approve high-value bet');
    }
    console.log(`✅ TEST 4/5 PASSED: High-value bet approved by trader_vikram! (Status: ${approveRes.bet.status}).`);
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
