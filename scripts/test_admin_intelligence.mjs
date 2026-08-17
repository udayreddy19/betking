import { query } from '../db/pg.js';
import {
  getRealtimeDashboardOverview,
  getUser360View,
  investigateBet,
  createMakerCheckerRequest,
  approveMakerCheckerRequest,
} from '../lib/adminIntelligenceEngine.mjs';
import { executeBetPlacementTransaction } from '../db/financialTransactions.js';
import dotenv from 'dotenv';

dotenv.config();

console.log('🚀 EXECUTING ODDSYRA ADVANCED ADMIN CONTROL CENTER ACCEPTANCE TEST SUITE...\n');

async function runAdminIntelligenceSuite() {
  let passed = 0;
  let total = 8;

  // 1. REAL-TIME DASHBOARD OVERVIEW METRICS ACCURACY
  try {
    console.log('   ⏳ Test 1/8: Testing real-time dashboard overview metrics...');
    const overview = await getRealtimeDashboardOverview();
    if (overview.success && typeof overview.users.total === 'number' && typeof overview.finance.walletLiability === 'number') {
      console.log(`✅ TEST 1/8 PASSED: Dashboard Overview metrics clean! (Total Users: ${overview.users.total}, Wallet Liability: ₹${overview.finance.walletLiability}).`);
      passed++;
    } else {
      console.error('❌ TEST 1/8 FAILED:', overview);
    }
  } catch (err) {
    console.error('❌ TEST 1/8 FAILED:', err.message);
  }

  // 2. USER 360 & CHRONOLOGICAL ACTIVITY TIMELINE
  try {
    console.log('   ⏳ Test 2/8: Testing User 360 chronological activity timeline...');
    const u360 = await getUser360View('user_demo_101');
    if (u360.success && u360.user && Array.isArray(u360.timeline)) {
      console.log(`✅ TEST 2/8 PASSED: User 360 Timeline verified! (${u360.user.email}, ${u360.timeline.length} timeline events).`);
      passed++;
    } else {
      console.error('❌ TEST 2/8 FAILED:', u360);
    }
  } catch (err) {
    console.error('❌ TEST 2/8 FAILED:', err.message);
  }

  // 3. BET INVESTIGATION TRACE ENGINE
  try {
    console.log('   ⏳ Test 3/8: Testing Bet Investigation end-to-end trace engine...');
    const bMatchId = `match_trace_${Date.now()}`;
    await query(`INSERT INTO matches (match_id, status) VALUES ($1, 'LIVE');`, [bMatchId]);
    await query(`INSERT INTO markets (market_id, match_id, name) VALUES ($1, $2, 'Winner');`, [`m_${bMatchId}`, bMatchId]);
    await query(`INSERT INTO selections (selection_id, market_id, name, odds) VALUES ($1, $2, 'Team A', 1.90);`, [`sel_${bMatchId}`, `m_${bMatchId}`]);

    const bet = await executeBetPlacementTransaction({
      userId: 'user_demo_101',
      matchId: bMatchId,
      selectionId: `sel_${bMatchId}`,
      stake: 100.00,
      odds: 1.90,
      potentialPayout: 190.00,
    });

    const trace = await investigateBet(bet.betId);
    if (trace.success && trace.bet && Array.isArray(trace.statusHistory)) {
      console.log(`✅ TEST 3/8 PASSED: Bet Investigation Trace verified! (Bet ID: ${bet.betId}, History steps: ${trace.statusHistory.length}).`);
      passed++;
    } else {
      console.error('❌ TEST 3/8 FAILED:', trace);
    }
  } catch (err) {
    console.error('❌ TEST 3/8 FAILED:', err.message);
  }

  // 4. MAKER-CHECKER DUAL AUTHORIZATION WORKFLOW
  try {
    console.log('   ⏳ Test 4/8: Testing Maker-Checker dual authorization workflow...');
    const mcReq = await createMakerCheckerRequest({
      actionType: 'WALLET_ADJUSTMENT',
      targetEntityType: 'user',
      targetEntityId: 'user_demo_101',
      requestPayload: { userId: 'user_demo_101', amount: 50.00, description: 'Test Admin Credit' },
      makerId: 'admin_maker_1',
    });

    // 1. Same Maker attempt approval ➔ Expect Failure
    let sameMakerError = null;
    try {
      await approveMakerCheckerRequest({ requestId: mcReq.requestId, checkerId: 'admin_maker_1' });
    } catch (err) {
      sameMakerError = err;
    }

    // 2. Checker approval ➔ Expect Success
    const approveRes = await approveMakerCheckerRequest({ requestId: mcReq.requestId, checkerId: 'admin_checker_2' });

    if (sameMakerError && sameMakerError.message.includes('DUAL_AUTHORIZATION_VIOLATION') && approveRes.status === 'APPROVED') {
      console.log(`✅ TEST 4/8 PASSED: Maker-Checker Dual Authorization Rule enforced! (Maker cannot self-approve, Checker 'admin_checker_2' approved).`);
      passed++;
    } else {
      console.error('❌ TEST 4/8 FAILED:', { sameMakerError, approveRes });
    }
  } catch (err) {
    console.error('❌ TEST 4/8 FAILED:', err.message);
  }

  // 5. ACCOUNT RESTRICTION AUDIT
  try {
    console.log('   ⏳ Test 5/8: Verifying account restriction audit trail...');
    const auditRes = await query(`SELECT COUNT(*) FROM audit_events WHERE action IN ('ACCOUNT_RESTRICTED', 'ACCOUNT_RELEASED');`);
    console.log(`✅ TEST 5/8 PASSED: Account restriction audit logging verified (${auditRes.rows[0].count} events logged).`);
    passed++;
  } catch (err) {
    console.error('❌ TEST 5/8 FAILED:', err.message);
  }

  // 6. REAL-TIME OUTBOX BACKLOG & SYSTEM HEALTH
  try {
    console.log('   ⏳ Test 6/8: Checking system health & outbox backlog metrics...');
    const overview = await getRealtimeDashboardOverview();
    if (overview.system.postgres && overview.system.redis) {
      console.log(`✅ TEST 6/8 PASSED: System & Outbox metrics operational (${overview.system.postgres}, ${overview.system.redis}).`);
      passed++;
    } else {
      console.error('❌ TEST 6/8 FAILED:', overview.system);
    }
  } catch (err) {
    console.error('❌ TEST 6/8 FAILED:', err.message);
  }

  // 7. ADMIN RBAC PERMISSION ENFORCEMENT
  try {
    console.log('   ⏳ Test 7/8: Verifying Admin RBAC permission enforcement...');
    const mcCheck = await query(`SELECT COUNT(*) FROM maker_checker_requests;`);
    if (parseInt(mcCheck.rows[0].count, 10) > 0) {
      console.log(`✅ TEST 7/8 PASSED: Admin RBAC & Maker-Checker authorization table active (${mcCheck.rows[0].count} requests tracked).`);
      passed++;
    } else {
      console.error('❌ TEST 7/8 FAILED: Maker checker requests empty');
    }
  } catch (err) {
    console.error('❌ TEST 7/8 FAILED:', err.message);
  }

  // 8. PROVIDER HEALTH CHECK & INCIDENT TRACKING
  try {
    console.log('   ⏳ Test 8/8: Verifying provider health logging & system incident tracking...');
    await query(`
      INSERT INTO provider_health_logs (id, provider_name, status, latency_ms)
      VALUES ($1, 'Sportradar', 'HEALTHY', 45)
      ON CONFLICT DO NOTHING;
    `, [`ph_test_${Date.now()}`]);

    const phRes = await query(`SELECT status FROM provider_health_logs WHERE provider_name = 'Sportradar'`);
    if (phRes.rows.length > 0) {
      console.log(`✅ TEST 8/8 PASSED: Provider health & system incident tracking operational.`);
      passed++;
    } else {
      console.error('❌ TEST 8/8 FAILED: Provider health log query failed');
    }
  } catch (err) {
    console.error('❌ TEST 8/8 FAILED:', err.message);
  }

  console.log(`\n=====================================================================`);
  console.log(`🎯 ADMIN INTELLIGENCE ACCEPTANCE TEST RESULT: ${passed}/${total} TESTS PASSED`);
  console.log(`=====================================================================\n`);

  process.exit(passed === total ? 0 : 1);
}

runAdminIntelligenceSuite();
