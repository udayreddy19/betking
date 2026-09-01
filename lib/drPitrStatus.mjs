/**
 * Honest DR / PITR status. SQL dumps are not point-in-time recovery.
 */

import { query } from '../db/pg.js';

export async function getDrPitrStatus() {
  const backups = await query(
    `SELECT id, backup_type, status, created_at, size_bytes
     FROM backups_log ORDER BY created_at DESC LIMIT 5`,
  ).catch(() => ({ rows: [] }));

  const lastDump = backups.rows.find((r) => String(r.backup_type || '').toUpperCase().includes('DUMP'))
    || backups.rows[0]
    || null;
  const lastPitr = backups.rows.find((r) => /PITR|WAL/i.test(String(r.backup_type || '')));

  const walLevel = await query(`SHOW wal_level`).catch(() => ({ rows: [] }));
  const archive = await query(`SHOW archive_mode`).catch(() => ({ rows: [] }));

  return {
    dumpBackups: backups.rows,
    lastDumpAt: lastDump?.created_at || null,
    lastDumpStatus: lastDump?.status || null,
    pitrCertified: Boolean(lastPitr && String(lastPitr.status).toUpperCase() === 'PASS'),
    lastPitrDrillAt: lastPitr?.created_at || null,
    postgresWalLevel: walLevel.rows[0]?.wal_level || 'unknown',
    archiveMode: archive.rows[0]?.archive_mode || 'unknown',
    note: 'A SQL dump is not WAL/PITR. Production GREEN requires a documented PITR restore drill on a clone. Wallet↔ledger mismatches stay flag-only — never silent auto-repair.',
    goLive: lastPitr ? 'PITR_DRILL_LOGGED' : 'NOT_VERIFIED',
  };
}
