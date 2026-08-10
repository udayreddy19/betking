import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const BACKUP_DIR = path.join(process.cwd(), 'backups');

const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.sql')).sort().reverse();
if (!files.length) {
  console.error('❌ No backup .sql files found in /backups directory');
  process.exit(1);
}

const latestBackup = path.join(BACKUP_DIR, files[0]);
console.log(`♻️ RESTORING POSTGRESQL DATABASE FROM BACKUP: ${latestBackup}`);

try {
  const dbName = process.env.POSTGRES_DB || 'betking';
  const dbUser = process.env.POSTGRES_USER || 'betking_app';

  const cmd = `docker exec -i betking_postgres psql -U ${dbUser} -d ${dbName} < "${latestBackup}"`;
  execSync(cmd, { stdio: 'inherit' });

  console.log('✅ DATABASE RESTORE COMPLETED SUCCESSFULLY!');
} catch (err) {
  console.error('❌ RESTORE FAILED:', err.message);
}
