import { describe, it, expect, beforeEach } from 'vitest';
import { recordDeviceFingerprint } from '../../lib/deviceFingerprintEngine.mjs';
import { generateRiskSignal } from '../../lib/riskSignalEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 9 Device Cluster & Risk Signal Tests', () => {
  const userA = 'usr_dev_101';
  const userB = 'usr_dev_102';
  const sharedDeviceHash = 'hash_shared_macbook_pro_12345';

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userA, `${userA}@example.com`]);
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userB, `${userB}@example.com`]);
    await query(`DELETE FROM device_fingerprints WHERE user_id IN ($1, $2);`, [userA, userB]);
    await query(`DELETE FROM risk_signals WHERE user_id IN ($1, $2);`, [userA, userB]);
    await query(`DELETE FROM fraud_cases WHERE user_id IN ($1, $2);`, [userA, userB]);
  });

  it('CRITICAL: 2 accounts sharing same device hash -> MULTIPLE_ACCOUNTS_SAME_DEVICE signal generated', async () => {
    // User A records device
    await recordDeviceFingerprint({ userId: userA, deviceHash: sharedDeviceHash });

    // User B records SAME device
    const resB = await recordDeviceFingerprint({ userId: userB, deviceHash: sharedDeviceHash });

    expect(resB.success).toBe(true);
    expect(resB.signalsGenerated.length).toBeGreaterThan(0);
    expect(resB.signalsGenerated[0].signalType).toBe('DEVICE_CLUSTER_DETECTED');

    const dbSig = await query('SELECT * FROM risk_signals WHERE user_id = $1 AND signal_type = \'DEVICE_CLUSTER_DETECTED\'', [userB]);
    expect(dbSig.rows.length).toBe(1);
    expect(dbSig.rows[0].severity).toBe('HIGH');
  });

  it('DETERMINISTIC RISK SCORE: signal cumulative score aggregation is exact and deterministic', async () => {
    // Generate Signal 1 (score 15)
    await generateRiskSignal({ userId: userA, signalType: 'IP_CLUSTER_DETECTED', score: 15 });
    // Generate Signal 2 (score 25)
    const sig2 = await generateRiskSignal({ userId: userA, signalType: 'DEVICE_CLUSTER_DETECTED', score: 25 });

    expect(sig2.totalScore).toBe(40); // 15 + 25 = 40
    expect(sig2.riskTier).toBe('MEDIUM');
  });
});
