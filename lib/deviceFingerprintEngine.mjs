import { query } from '../db/pg.js';
import { generateRiskSignal } from './riskSignalEngine.mjs';

/**
 * Enterprise Device & IP Fingerprinting Engine
 */
export async function recordDeviceFingerprint({
  userId,
  deviceHash,
  platform = 'Web',
  browser = 'Chrome',
  os = 'macOS',
  ipAddress = '127.0.0.1',
}) {
  const fpId = `fp_${userId}_${deviceHash.substring(0, 8)}`;

  await query(`
    INSERT INTO device_fingerprints (id, user_id, device_hash, platform, browser, os, ip_address, first_seen, last_seen)
    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO UPDATE
    SET last_seen = CURRENT_TIMESTAMP, ip_address = EXCLUDED.ip_address;
  `, [fpId, userId, deviceHash, platform, browser, os, ipAddress]);

  // Run cluster check
  return await detectDeviceAndIPClusters(userId, deviceHash, ipAddress);
}

export async function detectDeviceAndIPClusters(userId, deviceHash, ipAddress) {
  const signalsGenerated = [];

  // 1. Device Hash Cluster Check
  if (deviceHash) {
    const devClusterRes = await query(`
      SELECT DISTINCT user_id
      FROM device_fingerprints
      WHERE device_hash = $1 AND user_id != $2;
    `, [deviceHash, userId]);

    if (devClusterRes.rows.length > 0) {
      const linkedUsers = devClusterRes.rows.map(r => r.user_id);
      const sig = await generateRiskSignal({
        userId,
        signalType: 'DEVICE_CLUSTER_DETECTED',
        severity: 'HIGH',
        score: 25,
        source: 'DEVICE_FINGERPRINT_ENGINE',
        evidence: { deviceHash, linkedUsers, accountCount: linkedUsers.length + 1 },
      });
      signalsGenerated.push(sig);
    }
  }

  // 2. IP Cluster Check
  if (ipAddress && ipAddress !== '127.0.0.1') {
    const ipClusterRes = await query(`
      SELECT DISTINCT user_id
      FROM device_fingerprints
      WHERE ip_address = $1 AND user_id != $2;
    `, [ipAddress, userId]);

    if (ipClusterRes.rows.length >= 1) { // 2+ accounts sharing same IP address
      const linkedUsers = ipClusterRes.rows.map(r => r.user_id);
      const sig = await generateRiskSignal({
        userId,
        signalType: 'IP_CLUSTER_DETECTED',
        severity: 'MEDIUM',
        score: 15,
        source: 'IP_RISK_ENGINE',
        evidence: { ipAddress, linkedUsers, accountCount: linkedUsers.length + 1 },
      });
      signalsGenerated.push(sig);
    }
  }

  return { success: true, userId, signalsGenerated };
}
