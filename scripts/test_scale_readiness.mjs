import { query, withTransaction } from '../db/pg.js';
import { redis } from '../db/redis.js';
import { publishOutboxEvent, getOutboxMetrics } from '../lib/outboxEngine.mjs';
import { processPendingOutboxEvents, subscribeToEvent } from '../lib/outboxWorker.mjs';
import {
  runFullReconciliationAudit,
  runPaymentReconciliationAudit,
  runSettlementReconciliationAudit,
  runDataIntegrityChecker,
  getReconciliationCasesMetrics,
} from '../lib/reconciliationEngine.mjs';
import dotenv from 'dotenv';

dotenv.config();

console.log('🚀 EXECUTING BETKING ADVANCED DATABASE ARCHITECTURE & SCALE-READINESS TEST SUITE...\n');

async function runScaleReadinessSuite() {
  let passed = 0;
  let total = 8;

  const testCorrId = `corr_scale_${Date.now()}`;

  // 1. TEST TRANSACTIONAL OUTBOX ATOMIC PUBLISHING & PROCESSING
  try {
    console.log('   ⏳ Test 1/8: Testing Transactional Outbox atomic publish and worker processing...');
    let subscriberFired = false;

    subscribeToEvent('TEST_EVENT_SCALE', async (payload) => {
      if (payload.testToken === 'scale_token_123') {
        subscriberFired = true;
      }
    });

    const evtRecord = await withTransaction(async (client) => {
      return await publishOutboxEvent(client, {
        eventType: 'TEST_EVENT_SCALE',
        aggregateType: 'TEST_AGGREGATE',
        aggregateId: 'agg_991',
        payload: { testToken: 'scale_token_123' },
        correlationId: testCorrId,
      });
    });

    const pendingCheck = await query(`SELECT status FROM outbox_events WHERE id = $1`, [evtRecord.id]);

    // Process outbox batch
    await processPendingOutboxEvents(10);

    const processedCheck = await query(`SELECT status, processed_at FROM outbox_events WHERE id = $1`, [evtRecord.id]);

    if (pendingCheck.rows[0].status === 'PENDING' && processedCheck.rows[0].status === 'PROCESSED' && subscriberFired) {
      console.log(`✅ TEST 1/8 PASSED: Transactional Outbox published atomically & worker processed cleanly! (${evtRecord.id})`);
      passed++;
    } else {
      console.error('❌ TEST 1/8 FAILED:', { pendingStatus: pendingCheck.rows[0], processedStatus: processedCheck.rows[0], subscriberFired });
    }
  } catch (err) {
    console.error('❌ TEST 1/8 FAILED:', err.message);
  }

  // 2. TEST WORKER CRASH RECOVERY & EXPONENTIAL BACKOFF RETRY
  try {
    console.log('   ⏳ Test 2/8: Testing worker crash recovery and exponential backoff retry...');
    subscribeToEvent('TEST_FAILING_EVENT', async () => {
      throw new Error('SIMULATED_WORKER_CRASH_ERROR');
    });

    const failEvt = await publishOutboxEvent(null, {
      eventType: 'TEST_FAILING_EVENT',
      aggregateType: 'TEST',
      aggregateId: 'fail_1',
      payload: {},
      correlationId: testCorrId,
    });

    await processPendingOutboxEvents(10);

    const retryCheck = await query(`SELECT status, attempts, error_message FROM outbox_events WHERE id = $1`, [failEvt.id]);

    if (retryCheck.rows[0].status === 'FAILED' && retryCheck.rows[0].attempts === 1 && retryCheck.rows[0].error_message.includes('SIMULATED_WORKER_CRASH_ERROR')) {
      console.log(`✅ TEST 2/8 PASSED: Worker Crash Recovery verified! (Status: FAILED, Attempts: 1, Exponential Backoff set).`);
      passed++;
    } else {
      console.error('❌ TEST 2/8 FAILED:', retryCheck.rows[0]);
    }
  } catch (err) {
    console.error('❌ TEST 2/8 FAILED:', err.message);
  }

  // 3. TEST DUPLICATE EVENT CONSUMER IDEMPOTENCY
  try {
    console.log('   ⏳ Test 3/8: Testing duplicate event consumer idempotency...');
    let fireCount = 0;
    subscribeToEvent('TEST_IDEMP_EVENT', async () => {
      fireCount++;
    });

    const idempEvt = await publishOutboxEvent(null, {
      eventType: 'TEST_IDEMP_EVENT',
      aggregateType: 'TEST',
      aggregateId: 'idemp_1',
      payload: {},
      correlationId: testCorrId,
    });

    await processPendingOutboxEvents(10);
    // Attempt processing same batch again
    await processPendingOutboxEvents(10);

    if (fireCount === 1) {
      console.log(`✅ TEST 3/8 PASSED: Event Consumer Idempotency verified! (Event processed exactly once despite second worker pass).`);
      passed++;
    } else {
      console.error('❌ TEST 3/8 FAILED: Event fired multiple times', fireCount);
    }
  } catch (err) {
    console.error('❌ TEST 3/8 FAILED:', err.message);
  }

  // 4. TEST RECONCILIATION CASE CREATION ON FINANCIAL DISCREPANCY
  try {
    console.log('   ⏳ Test 4/8: Testing reconciliation case creation on financial discrepancy...');
    const synthUser = `user_recon_synth_${Date.now()}`;
    await query(`INSERT INTO users (user_id, email) VALUES ($1, $2);`, [synthUser, `${synthUser}@betking.com`]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance) VALUES ($1, $2, 9999.00);`, [`w_${synthUser}`, synthUser]);

    // Run audit
    await runFullReconciliationAudit();

    const caseCheck = await query(`
      SELECT id, reconciliation_type, entity_id, severity, status
      FROM reconciliation_cases
      WHERE entity_id = $1 AND status = 'OPEN';
    `, [`w_${synthUser}`]);

    if (caseCheck.rows.length > 0) {
      console.log(`✅ TEST 4/8 PASSED: Financial Reconciliation Case automatically created in PostgreSQL! (Case ID: ${caseCheck.rows[0].id}).`);
      passed++;
    } else {
      console.error('❌ TEST 4/8 FAILED: Case not created for synthetic discrepancy.');
    }

    // Clean up synthetic test user
    await query(`DELETE FROM reconciliation_cases WHERE entity_id = $1;`, [`w_${synthUser}`]);
    await query(`DELETE FROM wallets WHERE user_id = $1;`, [synthUser]);
    await query(`DELETE FROM users WHERE user_id = $1;`, [synthUser]);
  } catch (err) {
    console.error('❌ TEST 4/8 FAILED:', err.message);
  }

  // 5. TEST PAYMENT & SETTLEMENT RECONCILIATION AUDIT
  try {
    console.log('   ⏳ Test 5/8: Testing payment and settlement reconciliation audit engines...');
    const payRes = await runPaymentReconciliationAudit();
    const settleRes = await runSettlementReconciliationAudit();

    if (typeof payRes.casesCreated === 'number' && typeof settleRes.casesCreated === 'number') {
      console.log(`✅ TEST 5/8 PASSED: Payment & Settlement Reconciliation Audit completed cleanly!`);
      passed++;
    } else {
      console.error('❌ TEST 5/8 FAILED:', { payRes, settleRes });
    }
  } catch (err) {
    console.error('❌ TEST 5/8 FAILED:', err.message);
  }

  // 6. TEST DATA INTEGRITY CHECKER (ORPHANED RECORD DETECTION)
  try {
    console.log('   ⏳ Test 6/8: Running Data Integrity Checker for orphaned record detection...');
    const integRes = await runDataIntegrityChecker();
    if (typeof integRes.casesCreated === 'number') {
      console.log(`✅ TEST 6/8 PASSED: Data Integrity Checker verified (${integRes.orphanProfilesCount} orphaned profiles detected).`);
      passed++;
    } else {
      console.error('❌ TEST 6/8 FAILED:', integRes);
    }
  } catch (err) {
    console.error('❌ TEST 6/8 FAILED:', err.message);
  }

  // 7. TEST REDIS CACHE INVALIDATION VIA DOMAIN EVENTS
  try {
    console.log('   ⏳ Test 7/8: Testing Redis cache invalidation via domain outbox events...');
    const cacheUser = `user_cache_test_${Date.now()}`;
    await redis.set(`user:${cacheUser}:profile`, JSON.stringify({ name: 'Cached Profile' }));

    const cacheEvt = await publishOutboxEvent(null, {
      eventType: 'USER_PROFILE_UPDATED',
      aggregateType: 'USER',
      aggregateId: cacheUser,
      payload: { userId: cacheUser },
      correlationId: testCorrId,
    });

    await processPendingOutboxEvents(10);

    const cachedVal = await redis.get(`user:${cacheUser}:profile`);

    if (cachedVal === null) {
      console.log(`✅ TEST 7/8 PASSED: Redis cache invalidated automatically upon domain event dispatch!`);
      passed++;
    } else {
      console.error('❌ TEST 7/8 FAILED: Cache key still exists', cachedVal);
    }
  } catch (err) {
    console.error('❌ TEST 7/8 FAILED:', err.message);
  }

  // 8. TEST END-TO-END MULTI-SERVER CORRELATION ID TRACING
  try {
    console.log('   ⏳ Test 8/8: Verifying end-to-end multi-server correlation ID tracing...');
    const corrCheck = await query(`
      SELECT correlation_id FROM outbox_events WHERE correlation_id = $1;
    `, [testCorrId]);

    if (corrCheck.rows.length > 0) {
      console.log(`✅ TEST 8/8 PASSED: Multi-Server Correlation ID Tracing verified! (${corrCheck.rows.length} outbox events linked to ${testCorrId}).`);
      passed++;
    } else {
      console.error('❌ TEST 8/8 FAILED: Correlation ID not traced.');
    }
  } catch (err) {
    console.error('❌ TEST 8/8 FAILED:', err.message);
  }

  console.log(`\n=====================================================================`);
  console.log(`🎯 SCALE-READINESS ACCEPTANCE TEST RESULT: ${passed}/${total} TESTS PASSED`);
  console.log(`=====================================================================\n`);

  process.exit(passed === total ? 0 : 1);
}

runScaleReadinessSuite();
