import { pool, query, withTransaction, checkPgHealth } from '../db/pg.js';
import { redis, checkRedisHealth } from '../db/redis.js';
import { handleUserSupportQuery, classifyIntent } from '../lib/supportAssistant.mjs';
import dotenv from 'dotenv';

dotenv.config();

console.log('🧪 EXECUTING ODDSYRA POSTGRESQL & REDIS FULL TEST MATRIX...\n');

async function runTestMatrix() {
  let passed = 0;
  let total = 6;

  // 1. TEST PG & REDIS CONNECTIVITY
  try {
    const pgHealth = await checkPgHealth();
    const redisHealth = await checkRedisHealth();
    if (pgHealth.connected && redisHealth.connected) {
      console.log('✅ TEST 1/6 PASSED: PostgreSQL & Redis connectivity verified.');
      passed++;
    } else {
      console.error('❌ TEST 1/6 FAILED: Connection health failed', { pgHealth, redisHealth });
    }
  } catch (err) {
    console.error('❌ TEST 1/6 FAILED:', err.message);
  }

  // 2. TEST SPORTS & MATCH PLAYERS JUNCTION TABLE ISOLATION
  try {
    const mpRes = await query(`
      SELECT mp.id, m.match_id, t.name as team_name, p.name as player_name, mp.status
      FROM match_players mp
      JOIN matches m ON mp.match_id = m.match_id
      JOIN teams t ON mp.team_id = t.team_id
      JOIN players p ON mp.player_id = p.player_id
      WHERE mp.match_id = $1;
    `, ['match_wi_pak_2026']);

    if (mpRes.rows.length > 0) {
      console.log(`✅ TEST 2/6 PASSED: match_players junction table verified (${mpRes.rows.length} match player entries).`);
      passed++;
    } else {
      console.error('❌ TEST 2/6 FAILED: No match_players records found.');
    }
  } catch (err) {
    console.error('❌ TEST 2/6 FAILED:', err.message);
  }

  // 3. TEST FINANCIAL LEDGER & WALLET ATOMIC TRANSACTIONS
  try {
    const txRes = await withTransaction(async (client) => {
      // Create test transaction
      const txId = `tx_test_${Date.now()}`;
      await client.query(`
        INSERT INTO transactions (transaction_id, user_id, type, amount, status)
        VALUES ($1, $2, 'DEPOSIT', 500.00, 'COMPLETED');
      `, [txId, 'user_demo_101']);

      // Double-entry ledger entry
      await client.query(`
        INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
        VALUES ('w_demo_101', $1, 'CREDIT', 500.00, 12500.00, 'Test Deposit Credit');
      `, [txId]);

      // Update wallet balance atomically
      await client.query(`
        UPDATE wallets SET balance = balance + 500.00, updated_at = CURRENT_TIMESTAMP
        WHERE wallet_id = 'w_demo_101';
      `);

      const wCheck = await client.query(`SELECT balance FROM wallets WHERE wallet_id = 'w_demo_101'`);
      return wCheck.rows[0]?.balance;
    });

    console.log(`✅ TEST 3/6 PASSED: Atomic SQL wallet & ledger transaction committed (New balance: ₹${txRes}).`);
    passed++;
  } catch (err) {
    console.error('❌ TEST 3/6 FAILED:', err.message);
  }

  // 4. TEST CRITICAL REGRESSION TEST #35 (DYNAMIC KYC INTENT + POSTGRESQL QUERY)
  try {
    const inputMsg = 'I want to know the status of my KYC';
    const intent = classifyIntent(inputMsg);

    // Query user profile from PostgreSQL
    const profileRes = await query(`
      SELECT user_id, display_name, kyc_status, kyc_details
      FROM user_profiles WHERE user_id = $1;
    `, ['user_demo_101']);

    const userProfile = profileRes.rows[0];
    const supportRes = handleUserSupportQuery(inputMsg, 'demo@oddsyra.com');

    const intentOk = intent === 'KYC_STATUS';
    const statusMatch = userProfile?.kyc_status === 'VERIFIED';
    const responseHasStatus = supportRes.response.includes('VERIFIED');
    const noGenericGreeting = !supportRes.response.includes('How can I assist with your account today?');

    if (intentOk && statusMatch && responseHasStatus && noGenericGreeting) {
      console.log(`✅ TEST 4/6 PASSED: Critical Regression Test #35 Passed!`);
      console.log(`   User KYC Status in DB: ${userProfile.kyc_status}`);
      console.log(`   Dynamic Response: "${supportRes.response.slice(0, 90)}..."`);
      passed++;
    } else {
      console.error('❌ TEST 4/6 FAILED: KYC intent or DB status resolution failed.');
    }
  } catch (err) {
    console.error('❌ TEST 4/6 FAILED:', err.message);
  }

  // 5. TEST SUPPORT CHAT POSTGRESQL PERSISTENCE
  try {
    const msgId = `msg_test_${Date.now()}`;
    await query(`
      INSERT INTO support_messages (message_id, conversation_id, sender, agent_name, text)
      VALUES ($1, 'conv_demo_9912', 'customer', NULL, 'Test persistent support message in PostgreSQL');
    `, [msgId]);

    const checkMsg = await query(`SELECT text FROM support_messages WHERE message_id = $1`, [msgId]);
    if (checkMsg.rows[0]?.text === 'Test persistent support message in PostgreSQL') {
      console.log('✅ TEST 5/6 PASSED: Support Chat message successfully persisted to PostgreSQL.');
      passed++;
    } else {
      console.error('❌ TEST 5/6 FAILED: Support message persistence check failed.');
    }
  } catch (err) {
    console.error('❌ TEST 5/6 FAILED:', err.message);
  }

  // 6. TEST REDIS CACHE FLUSH & POSTGRESQL PERSISTENCE ISOLATION
  try {
    await redis.set('cache:test_key', 'transient_realtime_data', 'EX', 60);
    const cachedVal = await redis.get('cache:test_key');

    // Flush Redis cache
    await redis.flushdb();
    const afterFlush = await redis.get('cache:test_key');

    // Verify PostgreSQL data is still intact
    const dbCheck = await query(`SELECT COUNT(*) FROM users`);
    const userCount = parseInt(dbCheck.rows[0].count, 10);

    if (cachedVal === 'transient_realtime_data' && afterFlush === null && userCount > 0) {
      console.log(`✅ TEST 6/6 PASSED: Redis transient cache flushed, PostgreSQL permanent data intact (${userCount} users).`);
      passed++;
    } else {
      console.error('❌ TEST 6/6 FAILED: Redis/PostgreSQL persistence isolation test failed.');
    }
  } catch (err) {
    console.error('❌ TEST 6/6 FAILED:', err.message);
  }

  console.log(`\n====================================================`);
  console.log(`🎯 TEST MATRIX SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log(`====================================================\n`);

  process.exit(passed === total ? 0 : 1);
}

runTestMatrix();
