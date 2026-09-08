import { runFullDatabaseBackup } from '../lib/backupEngine.mjs';

console.log('📦 CREATING POSTGRESQL FULL BACKUP...');

try {
  const result = await runFullDatabaseBackup({ trigger: 'CLI', actor: 'cli' });
  console.log(`✅ BACKUP CREATED: ${result.fileName} (${result.sizeBytes} bytes in ${result.durationMs}ms)`);
  process.exit(0);
} catch (err) {
  console.error('❌ BACKUP FAILED:', err.message);
  process.exit(1);
}
