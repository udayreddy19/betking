import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const BACKUP_DIR = path.join(process.cwd(), 'backups');

if (!fs.existsSync(BACKUP_DIR)) {
  console.error('❌ Backups directory does not exist');
  process.exit(1);
}

const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.sql')).sort().reverse();
if (!files.length) {
  console.error('❌ No backup .sql files found in /backups directory');
  process.exit(1);
}

const latestBackup = path.join(BACKUP_DIR, files[0]);
console.log(`♻️ RESTORING POSTGRESQL DATABASE FROM BACKUP: ${latestBackup}`);

try {
  const dbName = process.env.POSTGRES_DB || 'oddsyra';
  const dbUser = process.env.POSTGRES_USER || 'oddsyra_app';
  const dbHost = process.env.POSTGRES_HOST || '127.0.0.1';

  let restored = false;

  // Attempt 1: Host psql
  try {
    const cmd = `PGPASSWORD="${process.env.POSTGRES_PASSWORD || 'oddsyra_dev_pass'}" psql -h ${dbHost} -U ${dbUser} -d ${dbName} < "${latestBackup}"`;
    execSync(cmd, { stdio: 'pipe' });
    restored = true;
  } catch (err) {
    // Attempt 2: Docker psql fallback
    const cmd = `docker exec -i oddsyra_postgres psql -U ${dbUser} -d ${dbName} < "${latestBackup}"`;
    execSync(cmd, { stdio: 'pipe' });
    restored = true;
  }

  console.log('✅ DATABASE RESTORE COMPLETED SUCCESSFULLY!');
} catch (err) {
  console.error('❌ RESTORE FAILED:', err.message);
  process.exit(1);
}
