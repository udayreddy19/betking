import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { query } from '../db/pg.js';

dotenv.config();

const BACKUP_DIR = path.join(process.cwd(), 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(BACKUP_DIR, `oddsyra_local_backup_${timestamp}.sql`);

console.log(`📦 CREATING POSTGRESQL PRODUCTION BACKUP AT: ${backupFile}`);

const t0 = Date.now();
try {
  const dbName = process.env.POSTGRES_DB || 'oddsyra';
  const dbUser = process.env.POSTGRES_USER || 'oddsyra_app';
  const dbHost = process.env.POSTGRES_HOST || '127.0.0.1';
  const dbPort = process.env.POSTGRES_PORT || '5432';

  let success = false;

  // Attempt 1: Native pg_dump on host
  try {
    const cmd = `PGPASSWORD="${process.env.POSTGRES_PASSWORD || 'oddsyra_dev_pass'}" pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} > "${backupFile}"`;
    execSync(cmd, { stdio: 'pipe' });
    success = true;
  } catch (err) {
    // Attempt 2: Docker container exec fallback
    const cmd = `docker exec oddsyra_postgres pg_dump -U ${dbUser} -d ${dbName} > "${backupFile}"`;
    execSync(cmd, { stdio: 'pipe' });
    success = true;
  }

  const durationMs = Date.now() - t0;
  const sizeBytes = fs.statSync(backupFile).size;
  console.log(`✅ LOCAL BACKUP CREATED SUCCESSFULLY (${sizeBytes} bytes in ${durationMs}ms)`);

  // Log in PostgreSQL backups_log table if available
  try {
    const bId = `bkp_${Date.now()}`;
    await query(`INSERT INTO backups_log (id, backup_type, status, size_bytes, duration_ms) VALUES ($1, 'FULL_DUMP', 'SUCCESS', $2, $3);`, [bId, sizeBytes, durationMs]);
  } catch {
    // Ignore DB log error during standalone script execution
  }
} catch (err) {
  console.error('❌ BACKUP FAILED:', err.message);
  process.exit(1);
}
