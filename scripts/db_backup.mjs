import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const BACKUP_DIR = path.join(process.cwd(), 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(BACKUP_DIR, `betking_local_backup_${timestamp}.sql`);

console.log(`📦 CREATING POSTGRESQL LOCAL BACKUP AT: ${backupFile}`);

try {
  const dbName = process.env.POSTGRES_DB || 'betking';
  const dbUser = process.env.POSTGRES_USER || 'betking_app';

  // Use docker exec pg_dump to avoid requiring local pg_dump binary on host
  const cmd = `docker exec betking_postgres pg_dump -U ${dbUser} -d ${dbName} > "${backupFile}"`;
  execSync(cmd, { stdio: 'inherit' });

  console.log(`✅ LOCAL BACKUP CREATED SUCCESSFULLY (${fs.statSync(backupFile).size} bytes)`);
} catch (err) {
  console.error('❌ BACKUP FAILED:', err.message);
}
