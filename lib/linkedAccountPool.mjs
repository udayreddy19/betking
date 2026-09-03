/**
 * Linked-account pool via shared device fingerprint / IP.
 * Used to share Over ladder + daily net-win caps across multi-accounts.
 */

import { query } from '../db/pg.js';

/**
 * @returns {Promise<string[]>} user ids including self
 */
export async function getLinkedUserIds(userId, client = null) {
  if (!userId) return [];
  const run = client?.query?.bind(client) || query;
  const ids = new Set([String(userId)]);

  try {
    const fp = await run(
      `SELECT DISTINCT device_hash, ip_address
       FROM device_fingerprints
       WHERE user_id = $1
         AND last_seen > NOW() - INTERVAL '30 days'`,
      [userId],
    );
    const hashes = fp.rows.map((r) => r.device_hash).filter(Boolean);
    const ips = fp.rows
      .map((r) => r.ip_address)
      .filter((ip) => ip && ip !== '127.0.0.1' && ip !== '::1');

    if (hashes.length) {
      const byDev = await run(
        `SELECT DISTINCT user_id FROM device_fingerprints
         WHERE device_hash = ANY($1::text[])
           AND last_seen > NOW() - INTERVAL '30 days'`,
        [hashes],
      );
      for (const row of byDev.rows) ids.add(String(row.user_id));
    }

    if (ips.length) {
      const byIp = await run(
        `SELECT DISTINCT user_id FROM device_fingerprints
         WHERE ip_address = ANY($1::text[])
           AND last_seen > NOW() - INTERVAL '14 days'`,
        [ips],
      );
      for (const row of byIp.rows) ids.add(String(row.user_id));
    }

    // Also check user_devices if present
    try {
      const ud = await run(
        `SELECT DISTINCT device_hash, ip_address FROM user_devices
         WHERE user_id = $1 AND COALESCE(is_active_session, true) = true`,
        [userId],
      );
      const uHashes = ud.rows.map((r) => r.device_hash).filter(Boolean);
      const uIps = ud.rows.map((r) => r.ip_address).filter((ip) => ip && ip !== '127.0.0.1');
      if (uHashes.length) {
        const linked = await run(
          `SELECT DISTINCT user_id FROM user_devices WHERE device_hash = ANY($1::text[])`,
          [uHashes],
        );
        for (const row of linked.rows) ids.add(String(row.user_id));
      }
      if (uIps.length) {
        const linked = await run(
          `SELECT DISTINCT user_id FROM user_devices WHERE ip_address = ANY($1::text[])`,
          [uIps],
        );
        for (const row of linked.rows) ids.add(String(row.user_id));
      }
    } catch {
      // table may not exist in older envs
    }
  } catch {
    // fail open to self-only if fingerprint tables missing
  }

  return Array.from(ids);
}
