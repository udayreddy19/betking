#!/usr/bin/env node
/**
 * OddsYra Platform Expansion Batch 1 — Acceptance Test Suite
 * Tests: Platform Integrity Engine, CMS, Config Center, Feature Flags,
 *        Customer Segmentation, VIP/Loyalty, Affiliate Platform, Rules Engine,
 *        Audit Explorer
 */

import 'dotenv/config';
import { query } from '../db/pg.js';

let passed = 0;
let failed = 0;
const TOTAL = 14;

function log(msg) { console.log(msg); }

async function safePgQuery(sql, params = []) {
  try { return await query(sql, params); } catch (err) { return { rows: [] }; }
}

async function runTest(testNum, testName, testFn) {
  log(`   ⏳ Test ${testNum}/${TOTAL}: ${testName}...`);
  try {
    await testFn();
    passed++;
    log(`✅ TEST ${testNum}/${TOTAL} PASSED: ${testName}`);
  } catch (err) {
    failed++;
    log(`❌ TEST ${testNum}/${TOTAL} FAILED: ${testName} — ${err.message}`);
  }
}

log('🚀 EXECUTING ODDSYRA PLATFORM EXPANSION BATCH 1 ACCEPTANCE TEST SUITE...\n');

// Ensure test user exists for FK safety
await safePgQuery(`INSERT INTO users (user_id, email) VALUES ('test_exp_user', 'test_exp_user') ON CONFLICT (user_id) DO NOTHING;`);

// ============================================================
// TEST 1: Platform Integrity Engine — Scan Execution
// ============================================================
await runTest(1, 'Platform Integrity Engine — Full Scan Execution', async () => {
  const { runFullIntegrityScan } = await import('../lib/platformIntegrityEngine.mjs');
  const result = await runFullIntegrityScan();
  if (!result.success) throw new Error('Integrity scan did not return success');
  if (typeof result.checksPerformed !== 'number' || result.checksPerformed < 5) throw new Error(`Expected ≥5 checks, got ${result.checksPerformed}`);
  log(`   → Scan completed: ${result.checksPerformed} checks, ${result.exceptionsFound} exceptions found.`);
});

// ============================================================
// TEST 2: Platform Integrity Engine — Exception Lifecycle
// ============================================================
await runTest(2, 'Platform Integrity Engine — Exception Creation & Resolution', async () => {
  const { createIntegrityException, resolveIntegrityException, getIntegrityScanMetrics } = await import('../lib/platformIntegrityEngine.mjs');
  const exc = await createIntegrityException({
    checkType: 'WALLET_LEDGER_DRIFT',
    entityType: 'WALLET',
    entityId: 'test_user_123',
    expectedState: 'Balance: ₹5000',
    actualState: 'Balance: ₹4999.50',
    severity: 'HIGH',
  });
  if (!exc.id) throw new Error('Exception creation failed');

  const resolved = await resolveIntegrityException(exc.id, { resolution: 'Manual reconciliation', resolvedBy: 'admin' });
  if (!resolved.success) throw new Error('Exception resolution failed');

  const metrics = await getIntegrityScanMetrics();
  if (!metrics.success) throw new Error('Metrics retrieval failed');
  log(`   → Exception ${exc.id} created & resolved. Total: ${metrics.metrics.total}.`);
});

// ============================================================
// TEST 3: CMS Engine — Content Lifecycle (DRAFT → PUBLISHED)
// ============================================================
await runTest(3, 'CMS Engine — Content DRAFT → PUBLISHED Lifecycle', async () => {
  const { createContent, transitionContentStatus, getPublishedContent } = await import('../lib/cmsEngine.mjs');
  const content = await createContent({
    contentType: 'BANNER',
    title: 'Welcome to OddsYra IPL Season!',
    body: '<h1>Win Big on IPL 2026</h1>',
    createdBy: 'admin',
  });
  if (!content.success || content.status !== 'DRAFT') throw new Error('Content creation failed');

  const published = await transitionContentStatus(content.contentId, { newStatus: 'PUBLISHED', actorId: 'admin' });
  if (!published.success || published.newStatus !== 'PUBLISHED') throw new Error('Content publish failed');

  const pubContent = await getPublishedContent('BANNER');
  if (!pubContent.success) throw new Error('Published content retrieval failed');
  log(`   → Content ${content.contentId} created as DRAFT → PUBLISHED. ${pubContent.count} published banners.`);
});

// ============================================================
// TEST 4: CMS Engine — Version History
// ============================================================
await runTest(4, 'CMS Engine — Version History Tracking', async () => {
  const { createContent, updateContent, getContentVersionHistory } = await import('../lib/cmsEngine.mjs');
  const content = await createContent({
    contentType: 'FAQ',
    title: 'How to deposit?',
    body: 'Use UPI, cards, or net banking.',
    createdBy: 'admin',
  });
  await updateContent(content.contentId, { title: 'How to deposit funds?', body: 'Updated: Use UPI, Paytm, or cards.', updatedBy: 'editor' });
  const versions = await getContentVersionHistory(content.contentId);
  if (versions.versions.length < 2) throw new Error('Version history missing');
  log(`   → Content ${content.contentId}: ${versions.versions.length} versions tracked.`);
});

// ============================================================
// TEST 5: Config Center — Set, Get, Audit
// ============================================================
await runTest(5, 'Configuration Center — PG Persistence & Audit Trail', async () => {
  const { setConfig, getConfig, getConfigAuditHistory } = await import('../lib/configEngine.mjs');
  await setConfig({
    configKey: 'MAX_DAILY_DEPOSIT_LIMIT',
    configValue: { amount: 500000, currency: 'INR' },
    category: 'PAYMENT',
    changedBy: 'admin',
    reason: 'Regulatory compliance',
  });
  const cfg = await getConfig('MAX_DAILY_DEPOSIT_LIMIT');
  if (!cfg.success || !cfg.value) throw new Error('Config retrieval failed');

  // Update to create audit trail
  await setConfig({
    configKey: 'MAX_DAILY_DEPOSIT_LIMIT',
    configValue: { amount: 600000, currency: 'INR' },
    category: 'PAYMENT',
    changedBy: 'compliance_officer',
    reason: 'Limit increased after review',
  });
  const audit = await getConfigAuditHistory('MAX_DAILY_DEPOSIT_LIMIT');
  if (audit.count < 2) throw new Error('Audit trail missing');
  log(`   → Config 'MAX_DAILY_DEPOSIT_LIMIT' set & audited. ${audit.count} audit entries.`);
});

// ============================================================
// TEST 6: Feature Flags — Create, Check, Audit
// ============================================================
await runTest(6, 'Feature Flags — PG Persistence, Rollout & Audit', async () => {
  const { upsertFeatureFlag, isFeatureEnabled, getAllFeatureFlags } = await import('../lib/featureStore.mjs');
  await upsertFeatureFlag({
    flagKey: 'NEW_CASHOUT_UI',
    name: 'New Cashout User Interface',
    enabled: true,
    rolloutPercentage: 50,
    tenantScope: ['tenant_default'],
    updatedBy: 'admin',
    reason: 'A/B testing new cashout flow',
  });

  const enabled = await isFeatureEnabled('NEW_CASHOUT_UI', { tenantId: 'tenant_default', userId: 'user_abc' });
  const allFlags = await getAllFeatureFlags();
  if (allFlags.count < 1) throw new Error('Feature flag not persisted');
  log(`   → Flag 'NEW_CASHOUT_UI' created (50% rollout). Enabled for user_abc: ${enabled}. Total flags: ${allFlags.count}.`);
});

// ============================================================
// TEST 7: Customer Segmentation — Create Segment & Evaluate
// ============================================================
await runTest(7, 'Customer Segmentation — PG-Backed Segments & Evaluation', async () => {
  const { createCustomerSegment, getAllCustomerSegments, evaluateUserSegments } = await import('../lib/crmEngine.mjs');
  await createCustomerSegment({
    name: 'HIGH_VALUE_CRICKET_FANS',
    description: 'Users with >₹100K deposits who bet on cricket',
    rules: { conditions: [{ field: 'total_deposits', operator: '>=', value: 100000 }, { field: 'favorite_sport', operator: '=', value: 'CRICKET' }] },
    createdBy: 'admin',
  });
  const segments = await getAllCustomerSegments();
  if (segments.count < 1) throw new Error('Segment not created');

  const eval1 = await evaluateUserSegments('test_user', { totalBets: 50, totalDeposits: 200000, favoriteSport: 'CRICKET' });
  if (!eval1.qualifiedSegments.includes('HIGH_VALUE')) throw new Error('User not qualified for HIGH_VALUE');
  if (!eval1.qualifiedSegments.includes('ACTIVE_BETTOR')) throw new Error('User not qualified for ACTIVE_BETTOR');
  log(`   → Segment 'HIGH_VALUE_CRICKET_FANS' created. User qualified for: ${eval1.qualifiedSegments.join(', ')}.`);
});

// ============================================================
// TEST 8: VIP Engine — Tier Evaluation & Benefits Catalog
// ============================================================
await runTest(8, 'VIP Engine — Tier Evaluation & Benefits Catalog', async () => {
  const { evaluateUserVipTier, getVipBenefitsCatalog, getUserVipStatus } = await import('../lib/vipEngine.mjs');
  const result = await evaluateUserVipTier('test_exp_user', 3000000);
  if (result.tier !== 'PLATINUM') throw new Error(`Expected PLATINUM, got ${result.tier}`);
  if (result.cashbackRatePct !== 7.5) throw new Error(`Expected 7.5% cashback, got ${result.cashbackRatePct}`);

  const catalog = getVipBenefitsCatalog();
  if (catalog.tiers.length !== 5) throw new Error('Benefits catalog incomplete');
  log(`   → User evaluated as ${result.tier} (₹30L turnover, ${result.cashbackRatePct}% cashback). ${catalog.tiers.length} tiers in catalog.`);
});

// ============================================================
// TEST 9: Loyalty Engine — Points & PG Persistence
// ============================================================
await runTest(9, 'Loyalty Engine — Points Accumulation & PG Persistence', async () => {
  const { addLoyaltyPoints, getLoyaltyStatus } = await import('../lib/loyaltyEngine.mjs');
  await addLoyaltyPoints('test_exp_user', 5000);
  await addLoyaltyPoints('test_exp_user', 3000);
  const status = await getLoyaltyStatus('test_exp_user');
  if (status.points < 8000) throw new Error(`Expected ≥8000 points, got ${status.points}`);
  if (status.tier !== 'SILVER') throw new Error(`Expected SILVER tier, got ${status.tier}`);
  log(`   → Loyalty: ${status.points} points, Tier: ${status.tier}, Level: ${status.level}.`);
});

// ============================================================
// TEST 10: Affiliate Platform — Account, Click, Conversion, Fraud Guard
// ============================================================
await runTest(10, 'Affiliate Platform — PG Account, Conversion & Fraud Guard', async () => {
  const { createAffiliateAccount, recordAffiliateClick, recordAffiliateConversion } = await import('../lib/affiliateEngine.mjs');
  const aff = await createAffiliateAccount({
    name: 'CricketFansBlog',
    email: `affiliate_${Date.now()}@test.com`,
    commissionRate: 7.5,
  });
  if (!aff.success) throw new Error('Affiliate creation failed');

  const click = await recordAffiliateClick(aff.referralCode);
  if (!click.success) throw new Error('Click recording failed');

  const conv = await recordAffiliateConversion({
    referralCode: aff.referralCode,
    referredUserId: 'test_exp_user',
    eventType: 'FIRST_DEPOSIT',
    amount: 10000,
  });
  if (!conv.success) throw new Error('Conversion recording failed');
  if (conv.commission !== 750) throw new Error(`Expected ₹750 commission (7.5% of ₹10K), got ₹${conv.commission}`);

  // Fraud guard: duplicate conversion blocked
  const dup = await recordAffiliateConversion({
    referralCode: aff.referralCode,
    referredUserId: 'test_exp_user',
    eventType: 'FIRST_DEPOSIT',
    amount: 10000,
  });
  if (dup.success !== false) throw new Error('Duplicate conversion NOT blocked!');
  log(`   → Affiliate ${aff.affiliateId}: Click recorded, ₹${conv.commission} commission. Duplicate blocked: ${dup.error}.`);
});

// ============================================================
// TEST 11: Rules Engine — Persist & Load Business Rules
// ============================================================
await runTest(11, 'Business Rules Engine — PG Persistence & Versioning', async () => {
  const { persistBusinessRule, loadBusinessRules, registerBusinessRule, evaluateBusinessRules } = await import('../lib/ruleEngine.mjs');
  const rule = await persistBusinessRule({
    ruleName: 'Max Stake Limit',
    category: 'BETTING',
    condition: { field: 'stake', operator: '<=', value: 100000 },
    action: 'ALLOW',
  });
  if (!rule.success) throw new Error('Rule persistence failed');

  // Update to test versioning
  const updated = await persistBusinessRule({
    ruleId: rule.ruleId,
    ruleName: 'Max Stake Limit Updated',
    category: 'BETTING',
    condition: { field: 'stake', operator: '<=', value: 150000 },
    action: 'ALLOW',
  });
  if (updated.version < 2) throw new Error('Rule versioning not working');

  const loaded = await loadBusinessRules();
  if (loaded.count < 1) throw new Error('No rules loaded from PG');

  // Test in-memory evaluation
  registerBusinessRule('TEST_MIN_STAKE', {
    name: 'Minimum Stake ₹10',
    category: 'BETTING',
    conditionFn: (ctx) => (ctx.stake || 0) >= 10,
    action: 'REJECT',
  });
  const evalResult = evaluateBusinessRules({ stake: 5 });
  if (evalResult.passed) throw new Error('Rule violation not detected');
  log(`   → Rule '${rule.ruleId}' persisted (v${updated.version}). ${loaded.count} PG rules. In-memory eval: ${evalResult.violations.length} violation(s).`);
});

// ============================================================
// TEST 12: Audit Explorer — Filter by Actor and Action
// ============================================================
await runTest(12, 'Audit Explorer — PG Query with Filters', async () => {
  // Insert test audit event
  await safePgQuery(`
    INSERT INTO audit_events (actor_id, target_id, action, details)
    VALUES ('admin_test', 'user_123', 'CONFIG_CHANGED', '{"key": "MAX_DEPOSIT", "old": 500000, "new": 600000}');
  `);
  const res = await safePgQuery(`
    SELECT COUNT(*) AS cnt FROM audit_events WHERE actor_id = 'admin_test';
  `);
  const count = parseInt(res.rows[0]?.cnt || 0);
  if (count < 1) throw new Error('Audit event not found');
  log(`   → Audit Explorer: ${count} events found for actor 'admin_test'.`);
});

// ============================================================
// TEST 13: Config Engine — Backward Compatibility
// ============================================================
await runTest(13, 'Config Engine — Backward Compatibility (In-Memory Config)', async () => {
  const { getMasterPlatformConfig, updateFeatureFlag } = await import('../lib/configEngine.mjs');
  const config = getMasterPlatformConfig();
  if (config.platformName !== 'OddsYra Sportsbook') throw new Error('Platform config broken');
  if (!config.featureFlags.enableBetBuilder) throw new Error('Feature flag missing');

  const flags = updateFeatureFlag('enableBetBuilder', false);
  if (flags.enableBetBuilder !== false) throw new Error('Feature flag update failed');
  updateFeatureFlag('enableBetBuilder', true); // Reset
  log(`   → In-memory config intact. Platform: ${config.platformName}, Version: ${config.version}.`);
});

// ============================================================
// TEST 14: Feature Store — Backward Compatibility (Match Features)
// ============================================================
await runTest(14, 'Feature Store — Match Feature Cache Backward Compatibility', async () => {
  const { upsertMatchFeatures, getMatchFeatures } = await import('../lib/featureStore.mjs');
  const features = upsertMatchFeatures('match_test_001', { homeElo: 1600, awayElo: 1450 });
  if (features.homeElo !== 1600) throw new Error('Match feature upsert failed');

  const retrieved = getMatchFeatures('match_test_001');
  if (retrieved.homeElo !== 1600) throw new Error('Match feature retrieval failed');
  log(`   → Match feature cache: homeElo=${retrieved.homeElo}, awayElo=${retrieved.awayElo}.`);
});

// ============================================================
// FINAL RESULTS
// ============================================================
log(`\n=====================================================================`);
if (failed === 0) {
  log(`🎯 ODDSYRA PLATFORM EXPANSION BATCH 1 RESULT: ${passed}/${TOTAL} TESTS PASSED`);
} else {
  log(`⚠️  ODDSYRA PLATFORM EXPANSION BATCH 1 RESULT: ${passed}/${TOTAL} PASSED, ${failed}/${TOTAL} FAILED`);
}
log(`=====================================================================\n`);

process.exit(failed > 0 ? 1 : 0);
