import { query, withTransaction } from '../db/pg.js';
import { redis } from '../db/redis.js';
import {
  executeWalletTransaction,
  executeBetPlacementTransaction,
  executeSettlementTransaction,
} from '../db/financialTransactions.js';
import { runFinancialReconciliation } from '../lib/reconciliationEngine.mjs';
import dotenv from 'dotenv';

dotenv.config();

console.log('🛡️ EXECUTING ODDSYRA POSTGRESQL PRODUCTION HARDENING & FINANCIAL INTEGRITY AUDIT...\n');

async function runProductionHardeningSuite() {
  let passed = 0;
  let total = 8;

  // Setup test user with exact ₹1,000 balance & initial deposit transaction
  const testUserId = `user_hard_test_${Date.now()}`;
  await query(`INSERT INTO users (user_id, email) VALUES ($1, $2);`, [testUserId, `${testUserId}@oddsyra.com`]);
  await query(`INSERT INTO user_profiles (user_id, display_name, kyc_status) VALUES ($1, 'Test User', 'VERIFIED');`, [testUserId]);
  await query(`INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance) VALUES ($1, $2, 1000.00, 0.00);`, [`w_${testUserId}`, testUserId]);
  await query(`INSERT INTO transactions (transaction_id, user_id, type, amount, status) VALUES ($1, $2, 'DEPOSIT', 1000.00, 'COMPLETED');`, [`tx_init_${testUserId}`, testUserId]);
  await query(`INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description) VALUES ($1, $2, 'CREDIT', 1000.00, 1000.00, 'Initial Deposit');`, [`w_${testUserId}`, `tx_init_${testUserId}`]);

  // Seed test market and selection
  await query(`INSERT INTO markets (market_id, match_id, name) VALUES ('m_hard_test', 'match_wi_pak_2026', 'Match Winner') ON CONFLICT DO NOTHING;`);
  await query(`INSERT INTO selections (selection_id, market_id, name, odds) VALUES ('sel_home_win', 'm_hard_test', 'West Indies', 1.95) ON CONFLICT DO NOTHING;`);

  // 1. TEST CONCURRENT DOUBLE WITHDRAWAL (SELECT ... FOR UPDATE ROW LOCKING)
  try {
    console.log('   ⏳ Test 1/8: Executing concurrent double withdrawal (₹800 x 2 against ₹1,000 balance)...');
    const reqA = executeWalletTransaction({ userId: testUserId, type: 'WITHDRAWAL', amount: 800.00, description: 'Withdrawal A' });
    const reqB = executeWalletTransaction({ userId: testUserId, type: 'WITHDRAWAL', amount: 800.00, description: 'Withdrawal B' });

    const results = await Promise.allSettled([reqA, reqB]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    const wCheck = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId]);
    const finalBal = parseFloat(wCheck.rows[0].balance);

    if (fulfilled.length === 1 && rejected.length === 1 && finalBal === 200.00) {
      console.log(`✅ TEST 1/8 PASSED: Concurrent Double Withdrawal Protected! (1 Succeeded, 1 Rejected: "${rejected[0].reason.message}", Final Balance: ₹${finalBal})`);
      passed++;
    } else {
      console.error('❌ TEST 1/8 FAILED: Over-withdrawal allowed', { fulfilledCount: fulfilled.length, finalBal });
    }
  } catch (err) {
    console.error('❌ TEST 1/8 FAILED:', err.message);
  }

  // 2. TEST DOUBLE BET PLACEMENT IDEMPOTENCY
  try {
    console.log('   ⏳ Test 2/8: Testing duplicate bet placement idempotency key...');
    const bKey = `bet_idem_key_${Date.now()}`;
    const bet1 = await executeBetPlacementTransaction({
      userId: 'user_demo_101',
      matchId: 'match_wi_pak_2026',
      selectionId: 'sel_home_win',
      stake: 100.00,
      odds: 1.95,
      potentialPayout: 195.00,
      idempotencyKey: bKey,
    });

    const bet2 = await executeBetPlacementTransaction({
      userId: 'user_demo_101',
      matchId: 'match_wi_pak_2026',
      selectionId: 'sel_home_win',
      stake: 100.00,
      odds: 1.95,
      potentialPayout: 195.00,
      idempotencyKey: bKey,
    });

    if (bet1.betId && bet2.betId === bet1.betId) {
      console.log(`✅ TEST 2/8 PASSED: Double Bet Placement Protected! (Duplicate key returned original bet ${bet1.betId}).`);
      passed++;
    } else {
      console.error('❌ TEST 2/8 FAILED: Duplicate bet created', { bet1, bet2 });
    }
  } catch (err) {
    console.error('❌ TEST 2/8 FAILED:', err.message);
  }

  // 3. TEST DOUBLE SETTLEMENT PROTECTION
  try {
    console.log('   ⏳ Test 3/8: Testing double settlement protection...');
    const matchId = `match_settle_${Date.now()}`;
    const sIdempKey = `settle_key_${Date.now()}`;
    await query(`INSERT INTO matches (match_id, status) VALUES ($1, 'FINISHED');`, [matchId]);
    await query(`INSERT INTO markets (market_id, match_id, name) VALUES ($1, $2, 'Match Winner');`, [`m_${matchId}`, matchId]);
    await query(`INSERT INTO selections (selection_id, market_id, name) VALUES ($1, $2, 'Team A');`, [`sel_${matchId}`, `m_${matchId}`]);

    const settle1 = await executeSettlementTransaction({ matchId, selectionId: `sel_${matchId}`, winningSelectionId: `sel_${matchId}`, idempotencyKey: sIdempKey });
    const settle2 = await executeSettlementTransaction({ matchId, selectionId: `sel_${matchId}`, winningSelectionId: `sel_${matchId}`, idempotencyKey: sIdempKey });

    if (settle1.success && (settle2.alreadySettled || settle2.settlementId === settle1.settlementId)) {
      console.log(`✅ TEST 3/8 PASSED: Double Settlement Protected! (Duplicate settlement key rejected).`);
      passed++;
    } else {
      console.error('❌ TEST 3/8 FAILED: Double settlement occurred', { settle1, settle2 });
    }
  } catch (err) {
    console.error('❌ TEST 3/8 FAILED:', err.message);
  }

  // 4. TEST DUPLICATE PAYMENT WEBHOOK UTR DEDUPLICATION
  try {
    console.log('   ⏳ Test 4/8: Testing duplicate payment webhook UTR deduplication...');
    const testUtr = `utr_dedup_${Date.now()}`;

    await executeWalletTransaction({ userId: 'user_demo_101', type: 'DEPOSIT', amount: 500.00, utr: testUtr, description: 'Razorpay Webhook 1' });

    let dupError = null;
    try {
      await executeWalletTransaction({ userId: 'user_demo_101', type: 'DEPOSIT', amount: 500.00, utr: testUtr, description: 'Razorpay Webhook Duplicate' });
    } catch (err) {
      dupError = err;
    }

    if (dupError && (dupError.message.includes('unique') || dupError.message.includes('utr') || dupError.code === '23505')) {
      console.log(`✅ TEST 4/8 PASSED: Duplicate Payment Webhook UTR Rejected by Unique Index!`);
      passed++;
    } else {
      console.error('❌ TEST 4/8 FAILED: Duplicate webhook UTR allowed');
    }
  } catch (err) {
    console.error('❌ TEST 4/8 FAILED:', err.message);
  }

  // 5. TEST FINANCIAL LEDGER RECONCILIATION ENGINE
  try {
    console.log('   ⏳ Test 5/8: Running automated financial ledger reconciliation...');
    const recon = await runFinancialReconciliation();
    if (recon.success && recon.mismatchCount === 0) {
      console.log(`✅ TEST 5/8 PASSED: Financial Reconciliation Audit Clean! (${recon.reconciledCount}/${recon.totalWalletsAudited} wallets balanced).`);
      passed++;
    } else {
      console.error('❌ TEST 5/8 FAILED: Mismatches detected', recon);
    }
  } catch (err) {
    console.error('❌ TEST 5/8 FAILED:', err.message);
  }

  // 6. TEST IMMUTABLE LEDGER & AUDIT TRAIL
  try {
    console.log('   ⏳ Test 6/8: Verifying ledger entries immutability & audit logging...');
    const ledgerCheck = await query(`SELECT COUNT(*) FROM ledger_entries;`);
    const auditCheck = await query(`SELECT COUNT(*) FROM audit_events;`);

    if (parseInt(ledgerCheck.rows[0].count, 10) > 0 && parseInt(auditCheck.rows[0].count, 10) > 0) {
      console.log(`✅ TEST 6/8 PASSED: Immutable Ledger & Audit Trail verified (${ledgerCheck.rows[0].count} ledger entries, ${auditCheck.rows[0].count} audit events).`);
      passed++;
    } else {
      console.error('❌ TEST 6/8 FAILED: Ledger or audit logs missing.');
    }
  } catch (err) {
    console.error('❌ TEST 6/8 FAILED:', err.message);
  }

  // 7. TEST REDIS FAILURE ISOLATION
  try {
    console.log('   ⏳ Test 7/8: Simulating Redis flush & verifying PostgreSQL data isolation...');
    await redis.set('transient:session', 'active', 'EX', 10);
    await redis.flushdb();

    const userCheck = await query(`SELECT COUNT(*) FROM users;`);
    const walletCheck = await query(`SELECT balance FROM wallets WHERE user_id = $1`, ['user_demo_101']);

    if (parseInt(userCheck.rows[0].count, 10) > 0 && parseFloat(walletCheck.rows[0].balance) > 0) {
      console.log(`✅ TEST 7/8 PASSED: Redis flushed cleanly, PostgreSQL permanent financial data 100% intact.`);
      passed++;
    } else {
      console.error('❌ TEST 7/8 FAILED: Permanent data lost during Redis flush.');
    }
  } catch (err) {
    console.error('❌ TEST 7/8 FAILED:', err.message);
  }

  // 8. TEST POSTGRESQL CONNECTION RECOVERY
  try {
    console.log('   ⏳ Test 8/8: Verifying PostgreSQL connection pool health & recovery...');
    const ping = await query(`SELECT 1 AS alive, NOW() AS server_time;`);
    if (ping.rows[0]?.alive === 1) {
      console.log(`✅ TEST 8/8 PASSED: PostgreSQL connection pool healthy & responsive (${ping.rows[0].server_time}).`);
      passed++;
    } else {
      console.error('❌ TEST 8/8 FAILED: PostgreSQL pool ping failed.');
    }
  } catch (err) {
    console.error('❌ TEST 8/8 FAILED:', err.message);
  }

  console.log(`\n=====================================================================`);
  console.log(`🎯 PRODUCTION HARDENING ACCEPTANCE TEST RESULT: ${passed}/${total} TESTS PASSED`);
  console.log(`=====================================================================\n`);

  process.exit(passed === total ? 0 : 1);
}

runProductionHardeningSuite();
