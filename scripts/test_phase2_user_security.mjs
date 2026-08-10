/**
 * PHASE 2 ACCEPTANCE TEST: USER ACCOUNT & SECURITY CENTER
 * Verifies Device Fingerprinting, Session Revocation, Security Alerts, and Account Control State Machine.
 */

import { userSecurityCenter } from '../lib/userSecurityCenter.mjs';

async function runPhase2AcceptanceTest() {
  console.log('🚀 EXECUTING PHASE 2: ADVANCED USER ACCOUNT & SECURITY CENTER ACCEPTANCE TEST...\n');
  let passCount = 0;

  try {
    const testUserId = `sec_user_${Date.now()}@betking.com`;

    // 1. Device Registration & Fingerprint
    console.log('   ⏳ Test 1/5: Registering User Devices & Fingerprint...');
    const dev1 = await userSecurityCenter.registerDevice(testUserId, {
      deviceHash: 'hash_macbook_pro_01',
      platform: 'Web',
      browser: 'Chrome 128',
      os: 'macOS 15',
      ipAddress: '103.22.14.5',
    });
    if (!dev1.deviceId) throw new Error('Failed to register primary device');
    console.log(`✅ TEST 1/5 PASSED: Primary Device registered! (ID: ${dev1.deviceId}).`);
    passCount++;

    // 2. Secondary Device & Security Alert Trigger
    console.log('   ⏳ Test 2/5: Registering Secondary Device & Verifying Security Alert...');
    const dev2 = await userSecurityCenter.registerDevice(testUserId, {
      deviceHash: 'hash_iphone_15_pro',
      platform: 'Mobile',
      browser: 'Safari',
      os: 'iOS 18',
      ipAddress: '49.36.12.99',
    });

    const alerts = userSecurityCenter.getUserSecurityAlerts(testUserId);
    const newDevAlert = alerts.find(a => a.alertType === 'NEW_DEVICE_LOGIN');
    if (!newDevAlert) throw new Error('Expected NEW_DEVICE_LOGIN alert, but none generated');
    console.log(`✅ TEST 2/5 PASSED: New Device Security Alert generated! (${newDevAlert.title}).`);
    passCount++;

    // 3. Logout All Other Devices
    console.log('   ⏳ Test 3/5: Testing Logout All Other Devices...');
    const logoutRes = await userSecurityCenter.logoutAllOtherDevices(testUserId, dev2.deviceId);
    const userDevs = userSecurityCenter.getUserDevices(testUserId);
    const activeDevs = userDevs.filter(d => d.isActiveSession);

    if (activeDevs.length !== 1 || activeDevs[0].deviceId !== dev2.deviceId) {
      throw new Error(`Expected only 1 active session remaining (dev2), found ${activeDevs.length}`);
    }
    console.log(`✅ TEST 3/5 PASSED: Logged out all other devices! (${logoutRes.revokedCount} sessions terminated).`);
    passCount++;

    // 4. Account Restrictions & Self-Exclusion State Machine
    console.log('   ⏳ Test 4/5: Testing Account Restriction & Self-Exclusion State Machine...');
    await userSecurityCenter.selfExcludeAccount(testUserId, { durationDays: 7, reason: 'Responsible Gaming Request' });
    const controlStatus = userSecurityCenter.getAccountControlStatus(testUserId);

    if (controlStatus.accountState !== 'SELF_EXCLUDED' || !controlStatus.isRestricted) {
      throw new Error(`Expected accountState 'SELF_EXCLUDED', got '${controlStatus.accountState}'`);
    }
    console.log(`✅ TEST 4/5 PASSED: Account Self-Exclusion applied! (State: ${controlStatus.accountState}, Restricted: ${controlStatus.isRestricted}).`);
    passCount++;

    // 5. Account Recovery
    console.log('   ⏳ Test 5/5: Testing Account Recovery & Restoration...');
    await userSecurityCenter.recoverAccount(testUserId, { operatorId: 'admin_security', verificationRef: 'VERIFIED_KYC_DOC' });
    const restoredStatus = userSecurityCenter.getAccountControlStatus(testUserId);

    if (restoredStatus.accountState !== 'ACTIVE' || restoredStatus.isRestricted) {
      throw new Error(`Expected accountState 'ACTIVE', got '${restoredStatus.accountState}'`);
    }
    console.log(`✅ TEST 5/5 PASSED: Account Recovery completed! (State: ${restoredStatus.accountState}).`);
    passCount++;

    console.log('\n=====================================================================');
    console.log(`🎯 PHASE 2 ACCEPTANCE TEST RESULT: ${passCount}/5 TESTS PASSED`);
    console.log('=====================================================================\n');

  } catch (err) {
    console.error('\n❌ PHASE 2 ACCEPTANCE TEST FAILED:', err.message);
    process.exit(1);
  }
}

runPhase2AcceptanceTest();
